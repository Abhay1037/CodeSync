import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * LoginPage
 * ---------
 * Combined login / register form plus a "continue as guest" escape hatch.
 */
export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (mode === 'login'
        ? login(email, password)
        : register(username, email, password));
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
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
            {mode === 'login' ? 'Welcome back.' : 'Create your account.'}
          </p>
        </div>

        {mode === 'register' && (
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
              Username
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. harsh"
              autoComplete="username"
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
            />
          </label>
        )}

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@college.edu"
            autoComplete="email"
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
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
          disabled={busy}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>

        <div className="mt-4 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="text-brand-600 hover:text-brand-700"
          >
            {mode === 'login'
              ? "Don't have an account? Register"
              : 'Already have an account? Log in'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="text-slate-600 hover:text-slate-900"
          >
            Continue as guest →
          </button>
        </div>
      </form>
    </div>
  );
}