import { useState } from 'react';
import { colorFor } from '../constants/editor.js';

/** Small coloured dot that reflects the socket connection state. */
function StatusDot({ status }) {
  const tone =
    status === 'connected'
      ? 'bg-emerald-400'
      : status === 'connecting'
        ? 'bg-amber-400 animate-pulse'
        : 'bg-red-500';

  return (
    <span className="flex items-center gap-2 text-xs text-slate-400">
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
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold tracking-tight text-slate-900">
          Code<span className="text-brand-600">Sync</span>
        </h1>

        <button
          onClick={copyRoomId}
          title="Copy room id"
          className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:border-brand-500/60 hover:text-slate-900"
        >
          <span className="text-slate-500">room</span>
          <span className="font-mono">{roomId}</span>
          <span className="text-brand-600">{copied ? 'copied!' : 'copy'}</span>
        </button>

        <StatusDot status={status} />
      </div>

      <div className="flex items-center gap-3">
        {/* Run own panel */}
        {onRun && (
          <button
            onClick={() => onRun()}
            disabled={!canRun || running}
            title="Run your panel's code"
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? 'Running…' : '▶ Run'}
          </button>
        )}

        {/* Participants */}
        <div className="hidden items-center gap-2 sm:flex">
          {users.map((user) => (
            <span
              key={user.id}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                user.username === username
                  ? 'bg-brand-100 text-brand-700'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: colorFor(user.colorIndex ?? 0) }}
              />
              {user.username}
              <span className="text-slate-500">· {user.role}</span>
            </span>
          ))}
        </div>

        {/* Active file language (derived from the open file) */}
        <span
          title="Language of the file open in your panel"
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
        >
          {language}
        </span>

        {/* File explorer toggle (mainly for small screens) */}
        {onToggleExplorer && (
          <button
            onClick={onToggleExplorer}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              explorerOpen
                ? 'border-brand-500/60 bg-brand-50 text-brand-700'
                : 'border-slate-300 bg-white text-slate-700 hover:text-slate-900'
            }`}
          >
            Files
          </button>
        )}

        <button
          onClick={onLeave}
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
        >
          Leave
        </button>
      </div>
    </header>
  );
}
