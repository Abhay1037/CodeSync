import { useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * JoinRoomModal
 * -------------
 * Collects only the guest's display name. The room id comes from the URL,
 * so asking for it again was redundant and a silent dead-end.
 * Real join is driven by `onJoin` -> useCollaboration.join().
 *
 * The card is the only element in the centering flow: the back link and the
 * helper text are absolutely positioned so the card sits exactly in the
 * middle of the viewport at every screen size.
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
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-surface p-space-lg">
      {/* Ambient glow (does not affect layout) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[520px] w-[520px] -translate-y-6 rounded-full bg-primary-fixed/30 blur-3xl" />
      </div>

      {/* Pinned to the corner, outside the centering flow */}
      <Link
        to="/dashboard"
        className="group absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest/80 px-2.5 py-1.5 font-label-md text-label-md text-on-surface-variant transition-colors hover:text-on-background"
      >
        <span className="material-symbols-outlined text-[16px] transition-transform group-hover:-translate-x-0.5">
          arrow_back
        </span>
        Dashboard
      </Link>

      <form
        onSubmit={handleSubmit}
        className="relative z-10 flex w-full max-w-md flex-col rounded-xl bg-surface-container-lowest p-8 shadow-xl"
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-space-md flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-container text-on-primary shadow-sm">
              <span className="material-symbols-outlined text-[18px]">terminal</span>
            </div>
            <span className="font-headline-sm text-headline-sm font-semibold tracking-tight text-on-background">
              CodeSync
            </span>
          </div>
          <h1 className="font-headline-md text-headline-md text-on-background">
            Collaborative Session
          </h1>
          <p className="mt-1 mb-6 font-body-sm text-body-sm text-on-surface-variant">
            Real-time collaborative editing, one panel each.
          </p>
        </div>

        <div className="mb-space-lg flex items-center justify-between rounded-lg bg-surface-container-low p-space-md">
          <div className="flex flex-col text-left">
            <span className="font-code-sm text-code-sm uppercase tracking-wider text-on-surface-variant">
              ROOM ID
            </span>
            <span className="select-all font-code-lg text-code-lg font-semibold tracking-wide text-on-background">
              {roomId}
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded bg-surface-container-lowest px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
            <span className="font-code-sm text-code-sm font-medium text-secondary">Ready</span>
            <span className="material-symbols-outlined ml-0.5 text-[14px] text-outline">lock</span>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 flex items-center gap-2 rounded-lg bg-error-container p-3 font-body-sm text-body-sm text-on-error-container"
          >
            <span className="material-symbols-outlined text-[16px] text-error">info</span>
            <span>{error}</span>
          </div>
        )}

        <div className="mb-space-lg flex flex-col text-left">
          <label
            htmlFor="display-name"
            className="mb-1.5 font-code-sm text-code-sm uppercase tracking-wider text-on-surface-variant"
          >
            YOUR NAME
          </label>
          <div className="relative flex items-center">
            <input
              id="display-name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. Harsh"
              autoComplete="off"
              maxLength={24}
              required
              className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3.5 py-2.5 font-body-md text-body-md text-on-surface shadow-sm outline-none transition placeholder:text-outline focus:border-primary focus:ring-2 focus:ring-primary-container disabled:opacity-60"
              disabled={isBusy}
            />
            <span className="material-symbols-outlined pointer-events-none absolute right-3 text-[18px] text-outline">
              badge
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={isBusy}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary-container px-4 py-2.5 font-label-md text-label-md text-on-primary shadow-sm transition-all hover:bg-primary active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>{isBusy ? 'Connecting…' : 'Join room'}</span>
          <span className="material-symbols-outlined text-[16px]">
            {isBusy ? 'progress_activity' : 'arrow_forward'}
          </span>
        </button>
      </form>

      <p className="absolute bottom-6 left-1/2 z-10 w-full max-w-md -translate-x-1/2 px-space-lg text-center font-body-sm text-body-sm text-on-surface-variant">
        Share the same Room ID with a partner to collaborate.
      </p>
    </main>
  );
}
