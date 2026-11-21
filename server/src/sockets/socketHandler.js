import {
  EVENTS,
  MAX_FILES_PER_ROOM,
  PANELS,
} from '../constants/events.js';
import {
  createFile,
  deleteFile,
  ensurePanelFile,
  findRoomBySocket,
  getRoom,
  hydrateRoom,
  joinRoom,
  leaveRoom,
  renameFile,
  setPanelFile,
  updateFileContent,
} from './roomStore.js';
import { addParticipant, ensureRoom, saveFilesDebounced } from '../services/roomService.js';
import { normalizeFilePath } from '../utils/filePaths.js';

/** Match the REST code-size guard so sockets cannot smuggle in huge payloads. */
const MAX_CODE_CHARS = 100_000;

/** Public shape of a participant sent over the wire. */
function serializeUser({ id, username, role, colorIndex }) {
  return { id, username, role, colorIndex };
}

/**
 * Serialise the room into a plain, client-friendly payload.
 * Never send the internal `users` Map directly over the wire.
 */
function serializeRoom(room) {
  return {
    roomId: room.id,
    files: room.files.map((file) => ({ ...file })),
    panelFiles: { ...room.panelFiles },
    users: [...room.users.values()].map(serializeUser),
  };
}

/** Basic input sanitiser for untrusted socket payloads. */
function sanitizeRoomId(roomId) {
  return String(roomId ?? '')
    .trim()
    .slice(0, 64);
}

function sanitizeUsername(username) {
  const clean = String(username ?? '').trim().slice(0, 24);
  return clean || 'Anonymous';
}

/** Clamp an untrusted {lineNumber, column} pair to sane integers. */
function sanitizePosition(position) {
  const lineNumber = Number(position?.lineNumber);
  const column = Number(position?.column);
  if (!Number.isFinite(lineNumber) || !Number.isFinite(column)) return null;
  return {
    lineNumber: Math.max(1, Math.trunc(lineNumber)),
    column: Math.max(1, Math.trunc(column)),
  };
}

/**
 * Register every Socket.io event handler for a connected client.
 * Called once per connection from the main server bootstrap.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export function registerSocketHandlers(io, socket) {
  /** Persist room state and surface database failures to every editor. */
  const persist = (id, room) =>
    saveFilesDebounced(id, room.files, room.panelFiles, (message) => {
      io.to(id).emit(EVENTS.ERROR_MESSAGE, { message });
    });

  /**
   * JOIN: seat the user, reply with full room state, announce to peers.
   * Uses an acknowledgement callback so the client knows the outcome
   * (seated vs rejected) deterministically.
   *
   * Persistence: the room is upserted in MongoDB and the in-memory cache is
   * hydrated from the database ONCE (the first time anyone joins), so files
   * survive server restarts.
   */
  socket.on(EVENTS.ROOM_JOIN, async (payload = {}, ack) => {
    try {
      const roomId = sanitizeRoomId(payload.roomId);
      // Authenticated identity wins; fall back to a guest display name.
      const userId = socket.data.user?.id ?? null;
      const username = socket.data.user?.username ?? sanitizeUsername(payload.username);

      if (!roomId) {
        const message = 'A room id is required.';
        ack?.({ ok: false, reason: 'INVALID_ROOM' });
        return socket.emit(EVENTS.ERROR_MESSAGE, { message });
      }

      // Do not record membership until the seat is actually granted (below).
      const dbRoom = await ensureRoom({ roomId, ownerId: userId });
      const cached = getRoom(roomId);
      if (!cached || !cached.hydrated) {
        hydrateRoom(roomId, {
          code: dbRoom.code,
          files: dbRoom.files,
          panelFiles: dbRoom.panelFiles,
        });
      }

      const result = joinRoom({ roomId, socketId: socket.id, username });

      if (!result.ok) {
        const message = 'This room already has two editors.';
        socket.emit(EVENTS.ROOM_FULL, { roomId, message });
        ack?.({ ok: false, reason: result.reason });
        return;
      }

      const { room, user } = result;

      // Only a seated editor becomes a room member. This keeps the private
      // GET /api/rooms/:roomId endpoint honest for rejected third joiners.
      if (userId) await addParticipant(roomId, userId);

      ensurePanelFile(room, user.role);
      socket.join(roomId);

      // 1. Tell the joining client who they are and the current file state.
      ack?.({ ok: true, role: user.role, state: serializeRoom(room) });

      // 2. Tell existing peers the roster changed.
      socket.to(roomId).emit(EVENTS.USERS_UPDATE, { users: serializeRoom(room).users });
    } catch (err) {
      console.error('[socket] join failed:', err.message);
      ack?.({ ok: false, reason: 'SERVER_ERROR' });
      socket.emit(EVENTS.ERROR_MESSAGE, { message: 'Could not join the room.' });
    }
  });

  /**
   * FILE_OPEN: switch the file shown in the sender's own panel.
   * The server owns the panel -> file mapping so peers can mirror it and so
   * edits can be checked against the file the user actually has open.
   */
  socket.on(EVENTS.FILE_OPEN, (payload = {}, ack) => {
    const roomId = findRoomBySocket(socket.id);
    if (!roomId) return ack?.({ ok: false, reason: 'NOT_IN_ROOM' });

    const room = getRoom(roomId);
    const user = room?.users.get(socket.id);
    if (!room || !user) return ack?.({ ok: false, reason: 'NOT_IN_ROOM' });

    const fileId = String(payload.fileId ?? '');
    if (!room.files.some((file) => file.id === fileId)) {
      socket.emit(EVENTS.ERROR_MESSAGE, { message: 'That file does not exist.' });
      return ack?.({ ok: false, reason: 'UNKNOWN_FILE' });
    }

    setPanelFile({ roomId, panel: user.role, fileId });
    persist(roomId, room);

    ack?.({ ok: true, fileId, panel: user.role });
    socket.to(roomId).emit(EVENTS.FILE_OPENED, {
      panel: user.role,
      fileId,
      by: user.username,
    });
  });

  /**
   * FILE_CREATE: add a new file to the shared room tree and open it in the
   * creator's own panel. Validation lives server-side too, so a tampered
   * client cannot inject traversal paths or duplicate ids.
   */
  socket.on(EVENTS.FILE_CREATE, (payload = {}, ack) => {
    const roomId = findRoomBySocket(socket.id);
    if (!roomId) return ack?.({ ok: false, reason: 'NOT_IN_ROOM' });

    const room = getRoom(roomId);
    const user = room?.users.get(socket.id);
    if (!room || !user) return ack?.({ ok: false, reason: 'NOT_IN_ROOM' });

    if (room.files.length >= MAX_FILES_PER_ROOM) {
      const message = `A room can hold at most ${MAX_FILES_PER_ROOM} files.`;
      socket.emit(EVENTS.ERROR_MESSAGE, { message });
      return ack?.({ ok: false, reason: 'FILE_LIMIT', message });
    }

    const normalized = normalizeFilePath(payload.path);
    if (!normalized.ok) {
      socket.emit(EVENTS.ERROR_MESSAGE, { message: normalized.message });
      return ack?.({
        ok: false,
        reason: normalized.reason,
        message: normalized.message,
      });
    }

    const result = createFile({
      roomId,
      file: {
        id: normalized.path,
        name: normalized.name,
        path: normalized.path,
        folder: normalized.folder,
        language: normalized.language,
        content: '',
      },
    });

    if (!result.ok) {
      const message =
        result.reason === 'FILE_EXISTS'
          ? 'A file with that path already exists.'
          : 'Could not create the file.';
      socket.emit(EVENTS.ERROR_MESSAGE, { message });
      return ack?.({ ok: false, reason: result.reason, message });
    }

    // A newly created file becomes the creator's active file immediately.
    setPanelFile({ roomId, panel: user.role, fileId: result.file.id });
    persist(roomId, room);

    ack?.({ ok: true, file: { ...result.file }, panel: user.role });
    socket.to(roomId).emit(EVENTS.FILE_CREATED, {
      file: { ...result.file },
      panel: user.role,
      by: user.username,
    });
  });

  /**
   * FILE_RENAME: re-path a shared file. The stable `id` is preserved so live
   * edits, panel mappings and cursors keep working across the rename.
   */
  socket.on(EVENTS.FILE_RENAME, (payload = {}, ack) => {
    const roomId = findRoomBySocket(socket.id);
    if (!roomId) return ack?.({ ok: false, reason: 'NOT_IN_ROOM' });

    const room = getRoom(roomId);
    const user = room?.users.get(socket.id);
    if (!room || !user) return ack?.({ ok: false, reason: 'NOT_IN_ROOM' });

    const fileId = String(payload.fileId ?? '');
    const normalized = normalizeFilePath(payload.path);
    if (!normalized.ok) {
      socket.emit(EVENTS.ERROR_MESSAGE, { message: normalized.message });
      return ack?.({ ok: false, reason: normalized.reason, message: normalized.message });
    }

    const result = renameFile({ roomId, fileId, next: normalized });
    if (!result.ok) {
      const message =
        result.reason === 'FILE_EXISTS'
          ? 'Another file already uses that path.'
          : 'Could not rename that file.';
      socket.emit(EVENTS.ERROR_MESSAGE, { message });
      return ack?.({ ok: false, reason: result.reason, message });
    }

    const panelFiles = { ...room.panelFiles };
    saveFilesDebounced(roomId, room.files, panelFiles, (message) =>
      io.to(roomId).emit(EVENTS.ERROR_MESSAGE, { message })
    );

    ack?.({ ok: true, file: { ...result.file }, panelFiles });
    socket.to(roomId).emit(EVENTS.FILE_RENAMED, {
      file: { ...result.file },
      panelFiles,
      by: user.username,
    });
  });

  /**
   * FILE_DELETE: remove a shared file. Any panel showing it is re-pointed at
   * a surviving file, and both editors are told the new panel mapping.
   */
  socket.on(EVENTS.FILE_DELETE, (payload = {}, ack) => {
    const roomId = findRoomBySocket(socket.id);
    if (!roomId) return ack?.({ ok: false, reason: 'NOT_IN_ROOM' });

    const room = getRoom(roomId);
    const user = room?.users.get(socket.id);
    if (!room || !user) return ack?.({ ok: false, reason: 'NOT_IN_ROOM' });

    const fileId = String(payload.fileId ?? '');
    const result = deleteFile({ roomId, fileId });
    if (!result.ok) {
      const message =
        result.reason === 'LAST_FILE'
          ? 'A room must keep at least one file.'
          : 'That file no longer exists.';
      socket.emit(EVENTS.ERROR_MESSAGE, { message });
      return ack?.({ ok: false, reason: result.reason, message });
    }

    const panelFiles = { ...room.panelFiles };
    saveFilesDebounced(roomId, room.files, panelFiles, (message) =>
      io.to(roomId).emit(EVENTS.ERROR_MESSAGE, { message })
    );

    ack?.({ ok: true, fileId, panelFiles });
    socket.to(roomId).emit(EVENTS.FILE_DELETED, {
      fileId,
      panelFiles,
      by: user.username,
    });
  });

  /**
   * CODE_CHANGE: the heart of "Restrictive Editing".
   * The server enforces that a client may only write to ITS assigned panel
   * AND only to the file currently open in that panel.
   */
  socket.on(EVENTS.CODE_CHANGE, (payload = {}) => {
    const roomId = findRoomBySocket(socket.id);
    if (!roomId) return;

    const room = getRoom(roomId);
    const user = room?.users.get(socket.id);
    if (!room || !user) return;

    const { panel, fileId, code } = payload;

    // Visibility guard: unknown panel.
    if (!Object.values(PANELS).includes(panel)) {
      return socket.emit(EVENTS.ERROR_MESSAGE, { message: 'Unknown panel.' });
    }

    // Ownership guard: cannot edit a panel you do not own.
    if (panel !== user.role) {
      return socket.emit(EVENTS.ERROR_MESSAGE, {
        message: `Restricted: you can only edit the ${user.role} panel.`,
      });
    }

    const activeFileId = room.panelFiles[user.role];
    if (!activeFileId) {
      return socket.emit(EVENTS.ERROR_MESSAGE, { message: 'No file is open in your panel.' });
    }

    // The file must be the one open in the sender's panel.
    if (fileId && fileId !== activeFileId) {
      return socket.emit(EVENTS.ERROR_MESSAGE, {
        message: 'Open that file in your panel before editing it.',
      });
    }

    const nextCode = String(code ?? '');
    if (nextCode.length > MAX_CODE_CHARS) {
      return socket.emit(EVENTS.ERROR_MESSAGE, {
        message: 'That file is too large to save.',
      });
    }

    updateFileContent({ roomId, fileId: activeFileId, content: nextCode });

    // Debounced persistence - one DB write per typing burst, not per key.
    const fresh = getRoom(roomId);
    if (fresh) persist(roomId, fresh);

    // Broadcast to the other editor only; the author already has this state.
    socket.to(roomId).emit(EVENTS.CODE_UPDATE, {
      panel,
      fileId: activeFileId,
      code: nextCode,
      from: user.username,
    });
  });

  /**
   * CURSOR_UPDATE: relay the editor caret so the partner sees a live cursor.
   * Only the owner of a panel may publish its caret, and we never echo back
   * to the sender. The file id lets the client ignore carets for files it
   * is not currently showing.
   */
  socket.on(EVENTS.CURSOR_UPDATE, (payload = {}) => {
    const roomId = findRoomBySocket(socket.id);
    if (!roomId) return;

    const room = getRoom(roomId);
    const user = room?.users.get(socket.id);
    if (!room || !user) return;

    const { panel } = payload;
    if (panel !== user.role) return; // only publish carets in your own panel

    const activeFileId = room.panelFiles[user.role];
    if (!activeFileId) return;
    if (payload.fileId && payload.fileId !== activeFileId) return;

    const position = sanitizePosition(payload.position);
    if (!position) return;

    socket.to(roomId).emit(EVENTS.CURSOR_UPDATE, {
      id: user.id,
      username: user.username,
      colorIndex: user.colorIndex,
      panel,
      fileId: activeFileId,
      position,
    });
  });

  /** Explicit leave (e.g. "Leave room" button before the socket closes). */
  socket.on(EVENTS.ROOM_LEAVE, () => {
    handleDisconnect(io, socket);
  });

  /** Cleanup on tab close / network drop. */
  socket.on('disconnect', () => handleDisconnect(io, socket));
}

/** Shared disconnect logic so leave + drop stay consistent. */
function handleDisconnect(io, socket) {
  const roomId = findRoomBySocket(socket.id);
  if (!roomId) return;

  const room = leaveRoom({ roomId, socketId: socket.id });

  // If the room still exists, tell the remaining editor the new roster.
  if (room) {
    socket.to(roomId).emit(EVENTS.USERS_UPDATE, {
      users: [...room.users.values()].map(serializeUser),
    });
  }

  socket.leave(roomId);
}
