import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { apiCreateRoom, apiDeleteRoom, apiListRooms } from '../lib/api.js';
import { socket } from '../lib/socket.js';

/**
 * DashboardPage
 * -------------
 * Room hub: create/list rooms (authenticated) and jump into a room by id
 * (works for guests too, who are asked for a name inside the workspace).
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
    if (id) navigate(`/room/${id}`);
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

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <h1 className="text-lg font-bold tracking-tight text-slate-900">
          Code<span className="text-brand-600">Sync</span>
        </h1>
        {user ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">
              Signed in as <span className="font-medium text-slate-900">{user.username}</span>
            </span>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              Log out
            </button>
          </div>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500"
          >
            Log in / Register
          </button>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Actions */}
          <div className="grid gap-4 sm:grid-cols-2">
            {user && (
              <form
                onSubmit={handleCreate}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <h2 className="mb-3 text-sm font-semibold text-slate-900">Create a room</h2>
                <input
                  value={roomIdInput}
                  onChange={(e) => setRoomIdInput(e.target.value)}
                  placeholder="Optional custom id (letters/numbers)"
                  maxLength={64}
                  className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500"
                />
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </form>
            )}

            <form
              onSubmit={handleJoin}
              className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${!user ? 'mx-auto w-full max-w-md' : ''}`}
            >
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Join a room</h2>
              <input
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                placeholder="Room id (from an invite link)"
                maxLength={64}
                className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={!joinId.trim()}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Join
              </button>
            </form>
          </div>

          {error && (
            <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {/* Rooms list */}
          {user && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-slate-700">Your rooms</h2>
              {loading ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : rooms.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  No rooms yet. Create one to start collaborating. Anyone with the room id can
                  join.
                </p>
              ) : (
                <ul className="space-y-2">
                  {rooms.map((room) => (
                    <li key={room.roomId} className="flex items-stretch gap-2">
                      <button
                        onClick={() => navigate(`/room/${room.roomId}`)}
                        className="flex flex-1 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-brand-500/50"
                      >
                        <div>
                          <p className="font-mono text-sm text-slate-900">
                            {room.roomId}
                            {room.owner === user.id && (
                              <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] text-brand-700">
                                owner
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">
                            {room.language ?? 'javascript'} · last active{' '}
                            {new Date(room.lastActiveAt).toLocaleString()}
                          </p>
                        </div>
                        <span className="text-xs text-brand-600">Open →</span>
                      </button>
                      {room.owner === user.id && (
                        <button
                          onClick={() => handleDeleteRoom(room)}
                          title={`Delete room ${room.roomId}`}
                          className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-700 transition hover:bg-red-100"
                        >
                          Delete
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {!user && (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              Guests can join any room by id without an account. Log in to create rooms, save
              history and keep your rooms list.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}