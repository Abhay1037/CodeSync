import { useState } from 'react';

/**
 * JoinRoomModal
 * -------------
 * Collects only the guest's display name. The room id already comes from the
 * URL (`/room/:roomId`), so asking for it again was both redundant and a
 * silent dead-end when the second field was left empty.
 */
export default function JoinRoomModal({ roomId, onJoin, status, error }) {
  const [username, setUsername] = useState('');
  const isBusy = status === 'connecting';

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!username.trim() || isBusy) return;
    onJoin(username.trim());
  };

  return (
    <div className="flex h-full items-center justify-center bg-slate-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl"
      >
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Code<span className="text-brand-600">Sync</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Real-time collaborative editing, one panel each.
          </p>
        </div>

        <div className="mb-4 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-600">
            Room ID
          </span>
          <span className="font-mono text-sm text-slate-900">{roomId}</span>
        </div>

        <label className="mb-6 block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
            Your name
          </span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. Harsh"
            autoComplete="off"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
          />
        </label>

        {error && (
          <p className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isBusy}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isBusy ? 'Connecting…' : 'Join room'}
        </button>

        <p className="mt-4 text-center text-xs text-slate-500">
          Share the same Room ID with a partner to collaborate.
        </p>
      </form>
    </div>
  );
}
