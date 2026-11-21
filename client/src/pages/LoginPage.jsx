import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * LoginPage
 * ---------
 * Combined login / register form plus a "continue as guest" escape hatch.
 * Material 3 styled surface, wired to the real auth endpoints.
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

  const fieldClass =
    'w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 font-body-md text-body-md text-on-surface placeholder:text-outline outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-container disabled:opacity-60';
  const labelClass =
    'mb-1.5 block font-code-sm text-code-sm uppercase tracking-wider text-on-surface-variant';

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-space-lg">
      <div className="relative flex w-full max-w-md flex-col items-center justify-center py-10">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <div className="h-[520px] w-[520px] -translate-y-6 rounded-full bg-primary-fixed/30 blur-3xl" />
        </div>

        <form
          onSubmit={handleSubmit}
          className="relative z-10 flex w-full flex-col rounded-xl bg-surface-container-lowest p-8 shadow-xl"
        >
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-space-md flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-container text-on-primary shadow-sm">
                <span className="material-symbols-outlined text-[18px]">terminal</span>
              </div>
              <span className="font-headline-sm text-headline-sm font-semibold tracking-tight text-on-background">
                CodeSync
              </span>
            </div>
            <h1 className="font-headline-md text-headline-md text-on-background">
              {mode === 'login' ? 'Welcome back.' : 'Create your account.'}
            </h1>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              {mode === 'login'
                ? 'Sign in to start a collaborative session.'
                : 'One account for all your rooms.'}
            </p>
          </div>

          {mode === 'register' && (
            <label className="mb-4 block text-left">
              <span className={labelClass}>Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. harsh"
                autoComplete="username"
                maxLength={24}
                required
                className={fieldClass}
              />
            </label>
          )}

          <label className="mb-4 block text-left">
            <span className={labelClass}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@college.edu"
              autoComplete="email"
              required
              className={fieldClass}
            />
          </label>

          <label className="mb-6 block text-left">
            <span className={labelClass}>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 6 : undefined}
              required
              className={fieldClass}
            />
          </label>

          {error && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-outline-variant bg-error-container px-3 py-2 font-body-sm text-body-sm text-on-error-container"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-container px-4 py-2.5 font-label-md text-label-md text-on-primary shadow-sm transition hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
            {!busy && <span className="material-symbols-outlined text-[16px]">arrow_forward</span>}
          </button>

          <div className="mt-4 flex items-center justify-between font-label-sm text-label-sm">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
              }}
              className="text-primary-container hover:text-primary"
            >
              {mode === 'login'
                ? "Don't have an account? Register"
                : 'Already have an account? Log in'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="text-on-surface-variant hover:text-on-background"
            >
              Continue as guest →
            </button>
          </div>
        </form>

        <p className="relative z-10 mt-space-lg font-code-sm text-code-sm text-outline">
          Real-time collaborative editing, one panel each.
        </p>
      </div>
    </main>
  );
}
