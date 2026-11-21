import { useState } from 'react';
import { colorFor } from '../constants/editor.js';

/** Small coloured dot that reflects the socket connection state. */
function StatusDot({ status }) {
  const tone =
    status === 'connected'
      ? 'bg-secondary'
      : status === 'connecting'
        ? 'bg-tertiary-fixed-dim animate-pulse'
        : 'bg-error';

  return (
    <span className="flex items-center gap-2 font-code-sm text-code-sm text-on-surface-variant">
      <span className={`h-2 w-2 rounded-full ${tone}`} />
      {status}
    </span>
  );
}

/**
 * RoomHeader
 * ----------
 * Top toolbar: brand, room id (copyable), live connection status,
 * participant roster, active-file language and a leave button.
 */
export default function RoomHeader({
  roomId,
  status,
  users,
  username,
  language,
  onLeave,
  onToggleExplorer,
  explorerOpen,
  onRun,
  running,
  canRun,
}) {
  const [copied, setCopied] = useState(false);

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (http/insecure context) - silently ignore */
    }
  };

  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-space-lg py-3">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-container font-code-md text-code-md font-semibold text-on-primary">
            &lt;/&gt;
          </div>
          <span className="font-headline-sm text-headline-sm font-semibold tracking-tight text-on-surface">
            CodeSync
          </span>
        </div>

        <button
          type="button"
          onClick={copyRoomId}
          title="Copy room id"
          className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-1.5 font-code-sm text-code-sm text-on-surface transition hover:border-primary/60"
        >
          <span className="text-on-surface-variant">room</span>
          <span className="font-mono">{roomId}</span>
          <span className="text-primary-container">{copied ? 'copied!' : 'copy'}</span>
        </button>

        <StatusDot status={status} />
      </div>

      <div className="flex items-center gap-3">
        {onRun && (
          <button
            type="button"
            onClick={() => onRun()}
            disabled={!canRun || running}
            title="Run your panel's code"
            className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 font-label-md text-label-md font-semibold text-on-secondary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[15px]">play_arrow</span>
            {running ? 'Running…' : 'Run'}
          </button>
        )}

        <div className="hidden items-center gap-2 sm:flex">
          {users.map((user) => (
            <span
              key={user.id}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-label-sm text-label-sm font-medium ${
                user.username === username
                  ? 'bg-primary-container text-on-primary-container'
                  : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: colorFor(user.colorIndex ?? 0) }}
              />
              {user.username}
              <span className="text-outline">· {user.role}</span>
            </span>
          ))}
        </div>

        <span
          title="Language of the file open in your panel"
          className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 font-label-md text-label-md font-medium text-on-surface"
        >
          {language}
        </span>

        {onToggleExplorer && (
          <button
            type="button"
            onClick={onToggleExplorer}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-label-md text-label-md font-medium transition ${
              explorerOpen
                ? 'border-primary/60 bg-primary-fixed text-on-primary-fixed'
                : 'border-outline-variant bg-surface-container-lowest text-on-surface hover:text-on-background'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">folder_open</span>
            Files
          </button>
        )}

        <button
          type="button"
          onClick={onLeave}
          className="rounded-lg bg-error-container px-3 py-1.5 font-label-md text-label-md font-medium text-on-error-container transition-opacity hover:opacity-90"
        >
          Leave
        </button>
      </div>
    </header>
  );
}
