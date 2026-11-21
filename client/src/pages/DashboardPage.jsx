import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { apiCreateRoom, apiDeleteRoom, apiListRooms } from '../lib/api.js';

/**
 * DashboardPage
 * -------------
 * Room hub: create/list rooms (authenticated) and jump into a room by id.
 * Material 3 styled, wired to the real REST endpoints.
 */
export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(user ? true : false);
  const [creating, setCreating] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [error, setError] = useState(null);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const { rooms: list } = await apiListRooms();
      setRooms(list);
    } catch {
      /* token stale - AuthProvider handles the session */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadRooms();
  }, [user, loadRooms]);

  const handleCreate = async (event) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const { room } = await apiCreateRoom({ roomId: roomIdInput.trim() || undefined });
      navigate(`/room/${room.roomId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = (event) => {
    event.preventDefault();
    const id = joinId.trim();
    if (!id) return;
    navigate(`/room/${id}`);
  };

  const handleDeleteRoom = async (room) => {
    const confirmed = window.confirm(
      `Delete room "${room.roomId}"? Its files will be removed for everyone.`
    );
    if (!confirmed) return;

    setError(null);
    try {
      await apiDeleteRoom(room.roomId);
      setRooms((prev) => prev.filter((entry) => entry.roomId !== room.roomId));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const inputClass =
    'w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 font-body-md text-body-md text-on-surface placeholder:text-outline outline-none transition focus:bg-surface-container-lowest focus:border-primary focus:ring-2 focus:ring-primary-container disabled:opacity-60';

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      {/* Single top bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-space-lg py-3">
        <div className="flex items-center gap-space-sm">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-container font-code-md text-code-md font-semibold text-on-primary">
            &lt;/&gt;
          </div>
          <span className="font-headline-sm text-headline-sm font-semibold tracking-tight text-on-surface">
            CodeSync
          </span>
        </div>

        {user ? (
          <div className="flex items-center gap-space-sm">
            <span className="hidden font-body-md text-body-md text-on-surface-variant sm:inline">
              Signed in as <strong className="font-semibold text-on-surface">{user.username}</strong>
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg bg-error-container px-2.5 py-1 font-label-md text-label-md text-on-error-container transition-opacity hover:opacity-90"
            >
              Log out
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="rounded-lg bg-primary-container px-3 py-1.5 font-label-md text-label-md text-on-primary transition-colors hover:bg-primary"
          >
            Log in / Register
          </button>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-space-lg">
        <div className="mx-auto flex w-full max-w-[768px] flex-col gap-6 py-4">
          {/* Actions */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {user && (
              <form
                onSubmit={handleCreate}
                className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-5 shadow-sm"
              >
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">
                      Create a room
                    </h2>
                    <span className="material-symbols-outlined text-[20px] text-primary-container">
                      add_circle
                    </span>
                  </div>
                  <p className="mb-4 font-body-sm text-body-sm text-on-surface-variant">
                    Start a new real-time collaboration session.
                  </p>
                  <input
                    value={roomIdInput}
                    onChange={(e) => setRoomIdInput(e.target.value)}
                    placeholder="Optional custom id (letters/numbers)"
                    maxLength={64}
                    className={`${inputClass} mb-3`}
                  />
                </div>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md text-on-primary transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-[16px]">bolt</span>
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </form>
            )}

            <form
              onSubmit={handleJoin}
              className={`flex flex-col justify-between rounded-xl bg-surface-container-lowest p-5 shadow-sm ${
                !user ? 'mx-auto w-full max-w-md' : ''
              }`}
            >
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Join a room</h2>
                  <span className="material-symbols-outlined text-[20px] text-secondary">
                    group_add
                  </span>
                </div>
                <p className="mb-4 font-body-sm text-body-sm text-on-surface-variant">
                  Enter an existing room code or invite hash.
                </p>
                <input
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value)}
                  placeholder="Room id (from an invite link)"
                  maxLength={64}
                  className={`${inputClass} mb-3`}
                />
              </div>
              <button
                type="submit"
                disabled={!joinId.trim()}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-secondary px-4 py-2 font-label-md text-label-md text-on-secondary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">login</span>
                Join
              </button>
            </form>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-center justify-between rounded-lg bg-error-container p-3 font-body-sm text-body-sm text-on-error-container"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-error">error</span>
                <span>{error}</span>
              </div>
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => setError(null)}
                className="transition-opacity hover:opacity-70"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          )}

          {/* Rooms list (authenticated only) */}
          {user && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Your rooms</h3>
                {!loading && rooms.length > 0 && (
                  <span className="font-code-sm text-code-sm text-on-surface-variant">
                    {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}
                  </span>
                )}
              </div>

              {loading ? (
                <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>
              ) : rooms.length === 0 ? (
                <p className="rounded-xl border border-dashed border-outline-variant p-6 text-center font-body-sm text-body-sm text-on-surface-variant">
                  No rooms yet. Create one to start collaborating. Anyone with the room id can join.
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {rooms.map((room) => (
                    <div
                      key={room.roomId}
                      className="flex items-center justify-between rounded-xl bg-surface-container-lowest p-4 shadow-sm transition-colors hover:bg-surface-container-low"
                    >
                      <div className="flex min-w-0 flex-col">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-surface-container px-2 py-0.5 font-code-md text-code-md font-medium text-on-surface">
                            {room.roomId}
                          </span>
                          {room.owner === user.id && (
                            <span className="rounded-full bg-primary-fixed px-2 py-0.5 font-label-sm text-label-sm font-semibold text-on-primary-fixed-variant">
                              owner
                            </span>
                          )}
                        </div>
                        <span className="mt-1.5 font-code-sm text-code-sm text-on-surface-variant">
                          {room.language ?? 'javascript'} · last active{' '}
                          {new Date(room.lastActiveAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/room/${room.roomId}`)}
                          className="flex items-center gap-1 font-label-md text-label-md font-semibold text-primary-container transition-colors hover:text-primary"
                        >
                          Open →
                        </button>
                        {room.owner === user.id && (
                          <button
                            type="button"
                            onClick={() => handleDeleteRoom(room)}
                            title={`Delete room ${room.roomId}`}
                            className="ml-2 rounded bg-error-container px-2.5 py-1 font-label-sm text-label-sm text-on-error-container transition-opacity hover:opacity-80"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {!user && (
            <div className="rounded-xl bg-surface-container p-4 text-center shadow-sm">
              <div className="mb-1 flex items-center justify-center gap-1.5 font-label-md text-label-md font-semibold text-on-surface">
                <span className="material-symbols-outlined text-[16px]">info</span>
                Guest Access Information
              </div>
              <p className="mx-auto max-w-lg font-body-sm text-body-sm text-on-surface-variant">
                Guests can join any room by id without an account. Log in to create rooms, save
                history and keep your rooms list.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
