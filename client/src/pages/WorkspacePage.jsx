import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCollaboration } from '../hooks/useCollaboration.js';
import { useRunner } from '../hooks/useRunner.js';
import { PANELS } from '../constants/events.js';
import { RUNNABLE_LANGUAGES } from '../constants/editor.js';
import JoinRoomModal from '../components/JoinRoomModal.jsx';
import RoomHeader from '../components/RoomHeader.jsx';
import FileExplorer from '../components/FileExplorer.jsx';
import EditorPanel from '../components/EditorPanel.jsx';
import OutputConsole from '../components/OutputConsole.jsx';

/**
 * WorkspacePage
 * -------------
 * Route wrapper for /room/:roomId. Keys the inner Workspace by roomId so
 * navigating from one room to another starts a clean collaboration session.
 */
export default function WorkspacePage() {
  const { roomId } = useParams();
  return <Workspace key={roomId} roomId={roomId ?? ''} />;
}

function Workspace({ roomId }) {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const collab = useCollaboration();
  const { running, result, runError, run, clear } = useRunner();

  const [explorerOpen, setExplorerOpen] = useState(() => window.innerWidth >= 1024);
  const [outputOpen, setOutputOpen] = useState(false);

  const joinedThisRoom = collab.roomId === roomId;
  const joinStarted = useRef(false);

  // Authenticated users join automatically once the route is ready.
  // `joinStarted` guards against React StrictMode double-invoking effects.
  useEffect(() => {
    if (joinStarted.current) return;
    if (user && !joinedThisRoom && collab.status !== 'connecting') {
      joinStarted.current = true;
      collab.join({ roomId, username: user.username, token });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, joinedThisRoom, roomId]);

  const handleLeave = () => {
    collab.leave();
    navigate('/dashboard');
  };

  // --- Guest flow: not signed in and not yet seated ----------------------
  if (!user && !joinedThisRoom) {
    return (
      <div className="relative h-full">
        <div className="absolute left-4 top-4 z-10">
          <Link
            to="/dashboard"
            className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
          >
            ← Dashboard
          </Link>
        </div>
        <JoinRoomModal
          roomId={roomId}
          onJoin={(name) => collab.join({ roomId, username: name })}
          status={collab.status}
          error={collab.error}
        />
      </div>
    );
  }

  // --- Authenticated but not seated yet -----------------------------------
  if (!joinedThisRoom) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-slate-950 p-4">
        {collab.status === 'connecting' ? (
          <p className="text-sm text-slate-400">Joining room…</p>
        ) : (
          <>
            <p className="text-sm text-red-300">{collab.error ?? 'Could not join the room.'}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:text-white"
            >
              Back to dashboard
            </button>
          </>
        )}
      </div>
    );
  }

  const { role, username, users, files, panelFiles, code, remoteCursors } = collab;

  const fileFor = (panel) => files.find((file) => file.id === panelFiles[panel]) ?? null;
  const leftFile = fileFor(PANELS.LEFT);
  const rightFile = fileFor(PANELS.RIGHT);
  const currentFile = fileFor(role);
  const currentLanguage = currentFile?.language ?? 'javascript';

  const labelFor = (panel) => {
    const owner = users.find((entry) => entry.role === panel);
    const file = fileFor(panel);
    const who = !owner
      ? `Open slot · ${panel}`
      : owner.username === username
        ? 'You'
        : owner.username;
    return `${who} · ${file?.name ?? panel}`;
  };

  const canRun = Boolean(role) && RUNNABLE_LANGUAGES.has(currentLanguage);

  const runCode = (stdin = '') => {
    if (!canRun) return;
    setOutputOpen(true);
    run({ language: currentLanguage, code: code[role] ?? '', stdin });
  };

  const cursorFor = (panel) => {
    const cursor = remoteCursors[panel];
    if (!cursor) return undefined;
    return cursor.fileId === panelFiles[panel] ? cursor : undefined;
  };

  // On small screens the explorer replaces the editor view, so picking a file
  // should reveal the editor again. Desktop keeps both visible side by side.
  const handleOpenFile = (fileId) => {
    collab.openFile(fileId);
    if (window.innerWidth < 1024) setExplorerOpen(false);
  };

  const handleCreateFile = async (path) => {
    const result = await collab.createFile(path);
    if (result.ok && window.innerWidth < 1024) setExplorerOpen(false);
    return result;
  };

  // The explorer is part of the workspace chrome, so it stays mounted while
  // switching/creating files and only closes on small screens.
  return (
    <div className="flex h-full flex-col bg-slate-50">
      <RoomHeader
        roomId={roomId}
        status={collab.status}
        users={users}
        username={username}
        language={currentLanguage}
        onLeave={handleLeave}
        onToggleExplorer={() => setExplorerOpen((open) => !open)}
        explorerOpen={explorerOpen}
        onRun={runCode}
        running={running}
        canRun={canRun}
      />

      <div className="flex min-h-0 flex-1">
        {explorerOpen && (
          <FileExplorer
            files={files}
            panelFiles={panelFiles}
            role={role}
            onOpen={handleOpenFile}
            onCreate={handleCreateFile}
            onRename={collab.renameFile}
            onDelete={collab.deleteFile}
          />
        )}

        {/* Editor column: split panes + optional output console.
            On small screens this whole column is hidden while the explorer is open. */}
        <div className={`min-h-0 flex-1 flex-col ${explorerOpen ? 'hidden lg:flex' : 'flex'}`}>
          <main className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            <EditorPanel
              code={code[PANELS.LEFT]}
              language={leftFile?.language ?? 'javascript'}
              editable={role === PANELS.LEFT}
              accent={role === PANELS.LEFT}
              ownerLabel={labelFor(PANELS.LEFT)}
              remoteCursor={cursorFor(PANELS.LEFT)}
              onChange={(value) => collab.updateCode(PANELS.LEFT, value)}
              onCursorChange={(position) => collab.emitCursor(PANELS.LEFT, position)}
            />
            <EditorPanel
              code={code[PANELS.RIGHT]}
              language={rightFile?.language ?? 'javascript'}
              editable={role === PANELS.RIGHT}
              accent={role === PANELS.RIGHT}
              ownerLabel={labelFor(PANELS.RIGHT)}
              remoteCursor={cursorFor(PANELS.RIGHT)}
              onChange={(value) => collab.updateCode(PANELS.RIGHT, value)}
              onCursorChange={(position) => collab.emitCursor(PANELS.RIGHT, position)}
            />
          </main>

          {outputOpen && (
            <OutputConsole
              running={running}
              result={result}
              runError={runError}
              onRun={runCode}
              onClear={clear}
              onClose={() => setOutputOpen(false)}
              canRun={canRun}
            />
          )}
        </div>
      </div>
    </div>
  );
}
