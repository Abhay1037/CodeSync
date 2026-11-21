import {
  DEFAULT_FILES,
  DEFAULT_PANEL_FILES,
  PANELS,
  MAX_USERS_PER_ROOM,
} from '../constants/events.js';

/**
 * In-memory room registry (hot cache in front of MongoDB).
 *
 * For a college project a Map is perfectly adequate. In production you would
 * swap this for Redis (with the Socket.io Redis adapter) so state survives
 * restarts and scales across multiple Node processes.
 *
 * Shape:
 *   Map<roomId, {
 *     id: string,
 *     createdAt: number,
 *     hydrated: boolean,                       // loaded from MongoDB yet?
 *     files: Array<{ id, name, path, folder, language, content }>,
 *     panelFiles: { left: fileId, right: fileId },
 *     users: Map<socketId, { id, username, role, colorIndex }>
 *   }>
 */
const rooms = new Map();

/** Deep-ish copy of the seed files so rooms never share mutable objects. */
function cloneFiles(files) {
  return files.map((file) => ({ ...file }));
}

/** Turn the legacy two-panel `code` document into the file tree. */
function filesFromLegacyCode(code) {
  return DEFAULT_FILES.map((file) => {
    let content = file.content;
    if (file.id === DEFAULT_PANEL_FILES.left) content = code?.left ?? content;
    if (file.id === DEFAULT_PANEL_FILES.right) content = code?.right ?? content;
    return { ...file, content };
  });
}

/** Normalise a persisted/cached file list, migrating old rooms if needed. */
function normalizeFiles(files, legacyCode) {
  if (Array.isArray(files) && files.length > 0) {
    return files.map((file) => ({
      id: String(file.id),
      name: String(file.name ?? file.path?.split('/').pop() ?? file.id),
      path: String(file.path ?? file.id),
      folder: String(file.folder ?? ''),
      language: String(file.language ?? 'javascript'),
      content: String(file.content ?? ''),
    }));
  }

  return filesFromLegacyCode(legacyCode);
}

/** Validate the panel -> file mapping and fill in sane defaults. */
function normalizePanelFiles(panelFiles, files) {
  const ids = new Set(files.map((file) => file.id));

  const fallbackFor = (panel) => {
    if (files.length === 0) return null;
    const preferred = DEFAULT_PANEL_FILES[panel];
    if (ids.has(preferred)) return preferred;
    const index = panel === PANELS.RIGHT && files.length > 1 ? 1 : 0;
    return files[index].id;
  };

  return {
    [PANELS.LEFT]: ids.has(panelFiles?.[PANELS.LEFT])
      ? panelFiles[PANELS.LEFT]
      : fallbackFor(PANELS.LEFT),
    [PANELS.RIGHT]: ids.has(panelFiles?.[PANELS.RIGHT])
      ? panelFiles[PANELS.RIGHT]
      : fallbackFor(PANELS.RIGHT),
  };
}

/** Return the room or create it on first access (lazy initialisation). */
function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      createdAt: Date.now(),
      hydrated: false,
      files: cloneFiles(DEFAULT_FILES),
      panelFiles: { ...DEFAULT_PANEL_FILES },
      users: new Map(),
    });
  }
  return rooms.get(roomId);
}

/** Overwrite the cache from the persisted document (once, on first join). */
export function hydrateRoom(roomId, { code, files, panelFiles } = {}) {
  const room = getOrCreateRoom(roomId);
  room.files = normalizeFiles(files, code);
  room.panelFiles = normalizePanelFiles(panelFiles, room.files);
  room.hydrated = true;
  return room;
}

export function hasRoom(roomId) {
  return rooms.has(roomId);
}

/** Colour index is derived from the panel for a stable, intuitive mapping. */
function colorIndexForRole(role) {
  return role === PANELS.LEFT ? 0 : 1;
}

/** Pick the first free panel; returns null when the room is full. */
function assignRole(room) {
  const taken = new Set([...room.users.values()].map((user) => user.role));
  if (!taken.has(PANELS.LEFT)) return PANELS.LEFT;
  if (!taken.has(PANELS.RIGHT)) return PANELS.RIGHT;
  return null;
}

/** Ensure a panel points at a file that still exists. */
export function ensurePanelFile(room, panel) {
  const current = room.panelFiles[panel];
  if (current && room.files.some((file) => file.id === current)) return current;

  const preferred = DEFAULT_PANEL_FILES[panel];
  const fallback =
    room.files.find((file) => file.id === preferred) ??
    room.files[panel === PANELS.RIGHT && room.files.length > 1 ? 1 : 0] ??
    null;

  room.panelFiles[panel] = fallback?.id ?? null;
  return room.panelFiles[panel];
}

/**
 * Attempt to seat a user in a room.
 * @returns {{ ok: true, room, user } | { ok: false, reason: string }}
 */
export function joinRoom({ roomId, socketId, username }) {
  const room = getOrCreateRoom(roomId);

  // Idempotent re-join: a socket that already owns a seat keeps it. This
  // makes React StrictMode's double-effect and client retries harmless.
  if (room.users.has(socketId)) {
    ensurePanelFile(room, room.users.get(socketId).role);
    return { ok: true, room, user: room.users.get(socketId) };
  }

  if (room.users.size >= MAX_USERS_PER_ROOM) {
    return { ok: false, reason: 'ROOM_FULL' };
  }

  const role = assignRole(room);
  if (!role) return { ok: false, reason: 'ROOM_FULL' };

  const user = { id: socketId, username, role, colorIndex: colorIndexForRole(role) };
  room.users.set(socketId, user);
  ensurePanelFile(room, role);

  return { ok: true, room, user };
}

/** Remove a user; delete the room once it becomes empty (frees memory). */
export function leaveRoom({ roomId, socketId }) {
  const room = rooms.get(roomId);
  if (!room) return null;

  room.users.delete(socketId);
  if (room.users.size === 0) rooms.delete(roomId);

  return room;
}

/** Point a panel at a file that exists in the room. */
export function setPanelFile({ roomId, panel, fileId }) {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (!room.files.some((file) => file.id === fileId)) return null;

  room.panelFiles[panel] = fileId;
  return room;
}

/** Add a new file to the room (id/path/name/folder/language pre-validated). */
export function createFile({ roomId, file }) {
  const room = rooms.get(roomId);
  if (!room) return { ok: false, reason: 'NOT_IN_ROOM' };

  // Paths (not ids) must be unique: renaming keeps the stable id, so the id
  // alone can no longer be used as the uniqueness key.
  const duplicate = room.files.some(
    (entry) => String(entry.path ?? entry.id).toLowerCase() === String(file.path).toLowerCase()
  );
  if (duplicate) return { ok: false, reason: 'FILE_EXISTS' };

  room.files.push({ ...file });
  return { ok: true, room, file: room.files[room.files.length - 1] };
}

/**
 * Re-path a file. The `id` stays stable (panels and live code keep pointing at
 * it); only the display path/name/folder/language change.
 */
export function renameFile({ roomId, fileId, next }) {
  const room = rooms.get(roomId);
  if (!room) return { ok: false, reason: 'NOT_IN_ROOM' };

  const file = room.files.find((entry) => entry.id === fileId);
  if (!file) return { ok: false, reason: 'UNKNOWN_FILE' };

  const clash = room.files.some(
    (entry) =>
      entry.id !== fileId &&
      String(entry.path ?? entry.id).toLowerCase() === String(next.path).toLowerCase()
  );
  if (clash) return { ok: false, reason: 'FILE_EXISTS' };

  file.path = next.path;
  file.name = next.name;
  file.folder = next.folder;
  file.language = next.language;

  return { ok: true, room, file };
}

/**
 * Remove a file and repair any panel that had it open (falls back to another
 * existing file). Rooms always keep at least one file.
 */
export function deleteFile({ roomId, fileId }) {
  const room = rooms.get(roomId);
  if (!room) return { ok: false, reason: 'NOT_IN_ROOM' };
  if (room.files.length <= 1) return { ok: false, reason: 'LAST_FILE' };

  const index = room.files.findIndex((entry) => entry.id === fileId);
  if (index === -1) return { ok: false, reason: 'UNKNOWN_FILE' };

  const [removed] = room.files.splice(index, 1);

  for (const panel of Object.values(PANELS)) {
    if (room.panelFiles[panel] === fileId) room.panelFiles[panel] = null;
    ensurePanelFile(room, panel);
  }

  return { ok: true, room, removed };
}

/** Apply an edit to a specific file. */
export function updateFileContent({ roomId, fileId, content }) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const file = room.files.find((entry) => entry.id === fileId);
  if (!file) return null;

  file.content = content;
  return room;
}

/** Find which room a socket currently belongs to (used on disconnect). */
export function findRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.users.has(socketId)) return room.id;
  }
  return null;
}

export function getRoom(roomId) {
  return rooms.get(roomId) ?? null;
}

export function getRoomCount() {
  return rooms.size;
}

/** Drop a room from the hot cache after it has been deleted from MongoDB. */
export function evictRoom(roomId) {
  return rooms.delete(roomId);
}
