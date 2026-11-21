import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket.js';
import { EVENTS, PANELS } from '../constants/events.js';

const EMPTY_PANEL_FILES = { [PANELS.LEFT]: null, [PANELS.RIGHT]: null };
const EMPTY_CODE = { [PANELS.LEFT]: '', [PANELS.RIGHT]: '' };

/**
 * useCollaboration
 * -----------------
 * Encapsulates all Socket.io wiring so components stay presentational.
 *
 * Exposes:
 *   status        - 'idle' | 'connecting' | 'connected' | 'disconnected'
 *   role          - 'left' | 'right' | null (the panel THIS user may edit)
 *   files         - shared room file tree (id, path, language, content)
 *   panelFiles    - { left: fileId, right: fileId } currently open per panel
 *   code          - { left, right } live content of the open panel files
 *   users         - connected participants (with colour index)
 *   remoteCursors - { [panel]: { position, fileId, username, colorIndex } }
 *   + join/leave/openFile/updateCode/emitCursor helpers
 */
export function useCollaboration() {
  const [status, setStatus] = useState('idle');
  const [role, setRole] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [username, setUsername] = useState(null);
  const [users, setUsers] = useState([]);
  const [files, setFiles] = useState([]);
  const [panelFiles, setPanelFiles] = useState(EMPTY_PANEL_FILES);
  const [code, setCode] = useState(EMPTY_CODE);
  const [remoteCursors, setRemoteCursors] = useState({});
  const [error, setError] = useState(null);

  // Refs mirror state values that socket callbacks (attached once) need to
  // read without going stale. Socket events can arrive back-to-back, so the
  // "commit" helpers below update the ref synchronously before React renders.
  const roleRef = useRef(role);
  const usernameRef = useRef(username);
  const roomIdRef = useRef(null); // the INTENDED room (survives reconnects)
  const filesRef = useRef(files);
  const panelFilesRef = useRef(panelFiles);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);
  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  const commitFiles = useCallback((nextFiles) => {
    filesRef.current = nextFiles;
    setFiles(nextFiles);
  }, []);

  const commitPanelFile = useCallback((panel, fileId, content) => {
    const nextPanelFiles = { ...panelFilesRef.current, [panel]: fileId };
    panelFilesRef.current = nextPanelFiles;
    setPanelFiles(nextPanelFiles);
    setCode((prev) => ({ ...prev, [panel]: content ?? '' }));

    // A caret from the previous file is no longer meaningful.
    setRemoteCursors((prev) => {
      if (!prev[panel]) return prev;
      const next = { ...prev };
      delete next[panel];
      return next;
    });
  }, []);

  /** Sync the server-owned panel map after a delete/rename repair. */
  const applyPanelFiles = useCallback((nextPanelFiles) => {
    const merged = {
      [PANELS.LEFT]: nextPanelFiles?.[PANELS.LEFT] ?? null,
      [PANELS.RIGHT]: nextPanelFiles?.[PANELS.RIGHT] ?? null,
    };
    const prev = panelFilesRef.current;
    panelFilesRef.current = merged;
    setPanelFiles(merged);

    // Panels that switched file need the new file's content in `code`.
    setCode((current) => {
      const next = { ...current };
      for (const panel of [PANELS.LEFT, PANELS.RIGHT]) {
        if (prev[panel] === merged[panel]) continue;
        const file = filesRef.current.find((entry) => entry.id === merged[panel]);
        next[panel] = file?.content ?? '';
      }
      return next;
    });

    // A caret is meaningless once its panel shows a different file.
    setRemoteCursors((prevCursors) => {
      const next = { ...prevCursors };
      for (const panel of [PANELS.LEFT, PANELS.RIGHT]) {
        if (prev[panel] !== merged[panel]) delete next[panel];
      }
      return next;
    });
  }, []);

  /** Emit a file action that expects an ack (rename/delete). */
  const requestFileAction = useCallback(
    (event, payload) =>
      new Promise((resolve) => {
        if (!socket.connected || !roleRef.current) {
          resolve({ ok: false, error: 'Not connected to the room.' });
          return;
        }

        let settled = false;
        const timer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve({ ok: false, error: 'Server did not respond. Try again.' });
        }, 10000);

        socket.emit(event, payload, (res) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          resolve(res ?? { ok: false, error: 'Unexpected server response.' });
        });
      }),
    []
  );

  /** Emit the join request and fold the server response into state. */
  const joinRequest = useCallback(() => {
    const id = roomIdRef.current;
    const name = usernameRef.current;
    if (!id || !name) return;

    socket.emit(EVENTS.ROOM_JOIN, { roomId: id, username: name }, (res) => {
      if (!res?.ok) {
        setError(
          res?.reason === 'ROOM_FULL'
            ? 'This room already has two editors.'
            : 'Could not join the room.'
        );
        setStatus('disconnected');
        roomIdRef.current = null;
        setRoomId(null);
        return;
      }

      const state = res.state ?? {};
      const nextFiles = Array.isArray(state.files) ? state.files : [];
      const nextPanelFiles = {
        [PANELS.LEFT]: state.panelFiles?.[PANELS.LEFT] ?? null,
        [PANELS.RIGHT]: state.panelFiles?.[PANELS.RIGHT] ?? null,
      };

      const contentFor = (fileId) =>
        nextFiles.find((file) => file.id === fileId)?.content ?? '';

      filesRef.current = nextFiles;
      panelFilesRef.current = nextPanelFiles;

      // Mark the room as joined only after the server confirms the seat.
      // WorkspacePage uses this to switch from the join modal to the panes.
      setRoomId(id);
      setRole(res.role);
      setFiles(nextFiles);
      setPanelFiles(nextPanelFiles);
      setCode({
        [PANELS.LEFT]: contentFor(nextPanelFiles[PANELS.LEFT]),
        [PANELS.RIGHT]: contentFor(nextPanelFiles[PANELS.RIGHT]),
      });
      setUsers(state.users ?? []);
      setStatus('connected');
    });
  }, []);

  // --- Global socket listeners (attached once) --------------------------
  useEffect(() => {
    function onConnect() {
      setStatus('connected');
      setError(null);
      // Seats the user on first connect AND re-seats them after a drop.
      if (roomIdRef.current) joinRequest();
    }
    function onDisconnect() {
      setStatus('disconnected');
    }
    function onConnectError(err) {
      setError(`Cannot reach server: ${err.message}`);
      setStatus('disconnected');
    }
    function onCodeUpdate({ panel, fileId, code: incoming }) {
      const nextFiles = filesRef.current.map((file) =>
        file.id === fileId ? { ...file, content: incoming } : file
      );
      commitFiles(nextFiles);

      if (panelFilesRef.current[panel] === fileId) {
        setCode((prev) => ({ ...prev, [panel]: incoming }));
      }
    }
    function onFileOpened({ panel, fileId }) {
      const file = filesRef.current.find((entry) => entry.id === fileId);
      if (file) commitPanelFile(panel, fileId, file.content);
    }
    function onFileCreated({ file, panel }) {
      if (!file?.id) return;
      const exists = filesRef.current.some((entry) => entry.id === file.id);
      if (!exists) commitFiles([...filesRef.current, file]);
      // The creator's panel now points at the new file, so mirror it here too.
      commitPanelFile(panel, file.id, file.content ?? '');
    }
    function onFileRenamed({ file, panelFiles: nextPanelFiles }) {
      if (!file?.id) return;
      commitFiles(
        filesRef.current.map((entry) => (entry.id === file.id ? { ...entry, ...file } : entry))
      );
      if (nextPanelFiles) applyPanelFiles(nextPanelFiles);
    }
    function onFileDeleted({ fileId, panelFiles: nextPanelFiles }) {
      commitFiles(filesRef.current.filter((entry) => entry.id !== fileId));
      applyPanelFiles(nextPanelFiles ?? {});
    }
    function onUsersUpdate({ users: nextUsers }) {
      setUsers(nextUsers);
      // Drop carets belonging to users who just left.
      const present = new Set(nextUsers.map((user) => user.username));
      setRemoteCursors((prev) => {
        const next = {};
        for (const [panel, cursor] of Object.entries(prev)) {
          if (cursor && present.has(cursor.username)) next[panel] = cursor;
        }
        return next;
      });
    }
    function onCursorUpdate(cursor) {
      setRemoteCursors((prev) => ({ ...prev, [cursor.panel]: cursor }));
    }
    function onRoomFull({ message }) {
      setError(message ?? 'Room is full.');
      setStatus('disconnected');
      // Stop the reconnect loop from re-joining a room we cannot enter.
      roomIdRef.current = null;
      setRoomId(null);
    }
    function onRoomDeleted({ message }) {
      setError(message ?? 'This room was deleted by its owner.');
      setStatus('disconnected');
      roomIdRef.current = null;
      setRoomId(null);
    }
    function onErrorMessage({ message }) {
      setError(message ?? 'Something went wrong.');
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on(EVENTS.CODE_UPDATE, onCodeUpdate);
    socket.on(EVENTS.FILE_OPENED, onFileOpened);
    socket.on(EVENTS.FILE_CREATED, onFileCreated);
    socket.on(EVENTS.FILE_RENAMED, onFileRenamed);
    socket.on(EVENTS.FILE_DELETED, onFileDeleted);
    socket.on(EVENTS.USERS_UPDATE, onUsersUpdate);
    socket.on(EVENTS.CURSOR_UPDATE, onCursorUpdate);
    socket.on(EVENTS.ROOM_FULL, onRoomFull);
    socket.on(EVENTS.ROOM_DELETED, onRoomDeleted);
    socket.on(EVENTS.ERROR_MESSAGE, onErrorMessage);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off(EVENTS.CODE_UPDATE, onCodeUpdate);
      socket.off(EVENTS.FILE_OPENED, onFileOpened);
      socket.off(EVENTS.FILE_CREATED, onFileCreated);
      socket.off(EVENTS.FILE_RENAMED, onFileRenamed);
      socket.off(EVENTS.FILE_DELETED, onFileDeleted);
      socket.off(EVENTS.USERS_UPDATE, onUsersUpdate);
      socket.off(EVENTS.CURSOR_UPDATE, onCursorUpdate);
      socket.off(EVENTS.ROOM_FULL, onRoomFull);
      socket.off(EVENTS.ROOM_DELETED, onRoomDeleted);
      socket.off(EVENTS.ERROR_MESSAGE, onErrorMessage);
    };
  }, [joinRequest, commitFiles, commitPanelFile, applyPanelFiles]);

  /** Connect (if needed) and join a room, resolving the assigned panel. */
  const join = useCallback(
    ({ roomId: id, username: name, token }) => {
      roomIdRef.current = id;
      usernameRef.current = name;
      setUsername(name);
      setStatus('connecting');
      setError(null);

      // Attach the JWT to the (re)connection handshake; guests send none.
      socket.auth = token ? { token } : {};
      if (socket.connected) joinRequest();
      else socket.connect();
    },
    [joinRequest]
  );

  /** Leave the room and tear down the socket connection. */
  const leave = useCallback(() => {
    if (socket.connected) socket.emit(EVENTS.ROOM_LEAVE);
    socket.disconnect();

    roomIdRef.current = null;
    filesRef.current = [];
    panelFilesRef.current = EMPTY_PANEL_FILES;
    setStatus('idle');
    setRole(null);
    setRoomId(null);
    setUsername(null);
    setUsers([]);
    setFiles([]);
    setPanelFiles(EMPTY_PANEL_FILES);
    setCode(EMPTY_CODE);
    setRemoteCursors({});
    setError(null);
  }, []);

  /** Switch the file shown in THIS user's panel. */
  const openFile = useCallback(
    (fileId) => {
      const file = filesRef.current.find((entry) => entry.id === fileId);
      const currentRole = roleRef.current;
      if (!file || !currentRole) return;
      if (panelFilesRef.current[currentRole] === fileId) return;

      const previousFileId = panelFilesRef.current[currentRole];
      commitPanelFile(currentRole, fileId, file.content);

      if (!socket.connected) return;
      socket.emit(EVENTS.FILE_OPEN, { fileId }, (res) => {
        // Reconcile with the server if it refused the switch, otherwise the
        // local panel would keep showing a file the server never opened.
        if (res?.ok || !previousFileId) return;
        const previous = filesRef.current.find((entry) => entry.id === previousFileId);
        commitPanelFile(currentRole, previousFileId, previous?.content ?? '');
      });
    },
    [commitPanelFile]
  );

  /**
   * Create a new file in the room and open it in our own panel.
   * Resolves with `{ ok: true, file }` or `{ ok: false, error }` so the
   * explorer can show validation errors from the server.
   */
  const createFile = useCallback(
    (path) =>
      new Promise((resolve) => {
        if (!socket.connected || !roleRef.current) {
          resolve({ ok: false, error: 'Not connected to the room.' });
          return;
        }

        let settled = false;
        const timer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve({ ok: false, error: 'Server did not respond. Try again.' });
        }, 10000);

        socket.emit(EVENTS.FILE_CREATE, { path }, (res) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);

          if (!res?.ok || !res.file?.id) {
            resolve({
              ok: false,
              error: res?.message ?? 'Could not create the file.',
            });
            return;
          }

          const file = res.file;
          const exists = filesRef.current.some((entry) => entry.id === file.id);
          if (!exists) commitFiles([...filesRef.current, file]);
          if (roleRef.current) {
            commitPanelFile(roleRef.current, file.id, file.content ?? '');
          }

          resolve({ ok: true, file });
        });
      }),
    [commitFiles, commitPanelFile]
  );

  /**
   * Rename (re-path) a shared file. The file id is stable, so panels, live
   * code and cursors survive the rename untouched.
   */
  const renameFile = useCallback(
    async (fileId, path) => {
      const res = await requestFileAction(EVENTS.FILE_RENAME, { fileId, path });
      if (!res.ok) {
        return { ok: false, error: res.message ?? 'Could not rename the file.' };
      }

      const file = res.file;
      if (file?.id) {
        commitFiles(
          filesRef.current.map((entry) => (entry.id === file.id ? { ...entry, ...file } : entry))
        );
      }
      if (res.panelFiles) applyPanelFiles(res.panelFiles);

      return { ok: true, file };
    },
    [applyPanelFiles, commitFiles, requestFileAction]
  );

  /** Delete a shared file; the server re-points panels that had it open. */
  const deleteFile = useCallback(
    async (fileId) => {
      const res = await requestFileAction(EVENTS.FILE_DELETE, { fileId });
      if (!res.ok) {
        return { ok: false, error: res.message ?? 'Could not delete the file.' };
      }

      commitFiles(filesRef.current.filter((entry) => entry.id !== fileId));
      applyPanelFiles(res.panelFiles ?? {});

      return { ok: true };
    },
    [applyPanelFiles, commitFiles, requestFileAction]
  );

  /**
   * Apply a local edit.
   * Updates UI immediately (optimistic) and, only when the edited panel is
   * OURS, forwards it to the server. The read-only panel never emits.
   */
  const updateCode = useCallback(
    (panel, value) => {
      setCode((prev) => ({ ...prev, [panel]: value }));

      const fileId = panelFilesRef.current[panel];
      if (fileId) {
        commitFiles(
          filesRef.current.map((file) =>
            file.id === fileId ? { ...file, content: value } : file
          )
        );
      }

      if (panel === roleRef.current && socket.connected && fileId) {
        socket.emit(EVENTS.CODE_CHANGE, { panel, fileId, code: value });
      }
    },
    [commitFiles]
  );

  // --- Cursor broadcast (throttled with a trailing edge) ----------------
  const lastCursorAt = useRef(0);
  const pendingCursor = useRef(null);
  const cursorTimer = useRef(null);

  const flushCursor = useCallback(() => {
    cursorTimer.current = null;
    if (pendingCursor.current && socket.connected) {
      socket.emit(EVENTS.CURSOR_UPDATE, pendingCursor.current);
      pendingCursor.current = null;
      lastCursorAt.current = Date.now();
    }
  }, []);

  /** Publish our caret position ~20x/second (trailing throttle). */
  const emitCursor = useCallback(
    (panel, position) => {
      const fileId = panelFilesRef.current[panel];
      if (!fileId) return;

      pendingCursor.current = { panel, fileId, position };
      const elapsed = Date.now() - lastCursorAt.current;
      const wait = 50;
      if (elapsed >= wait) flushCursor();
      else if (!cursorTimer.current) {
        cursorTimer.current = window.setTimeout(flushCursor, wait - elapsed);
      }
    },
    [flushCursor]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    status,
    role,
    roomId,
    username,
    users,
    files,
    panelFiles,
    code,
    remoteCursors,
    error,
    clearError,
    join,
    leave,
    createFile,
    renameFile,
    deleteFile,
    openFile,
    updateCode,
    emitCursor,
  };
}
