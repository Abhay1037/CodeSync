import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { socket } from '../lib/socket.js';
import { apiLogin, apiMe, apiRegister, getStoredToken } from '../lib/api.js';

const TOKEN_KEY = 'cs_token';
const USER_KEY = 'cs_user';

const AuthContext = createContext(null);

/**
 * AuthProvider
 * ------------
 * Session state (JWT + user) persisted in localStorage and restored on load.
 * Provides login/register/logout actions used across all pages.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null');
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => getStoredToken());
  const [ready, setReady] = useState(false);

  // Restore the session by validating the stored token against the API.
  useEffect(() => {
    (async () => {
      try {
        if (token) {
          const { user: me } = await apiMe(token);
          setUser(me);
          localStorage.setItem(USER_KEY, JSON.stringify(me));
        }
      } catch {
        // Token stale/expired - drop the local session.
        setToken(null);
        setUser(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      } finally {
        setReady(true);
      }
    })();
  }, [token]);

  const persistSession = useCallback((nextToken, nextUser) => {
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
  }, []);

  const login = useCallback(
    async (email, password) => {
      const data = await apiLogin({ email, password });
      persistSession(data.token, data.user);
      return data.user;
    },
    [persistSession]
  );

  const register = useCallback(
    async (username, email, password) => {
      const data = await apiRegister({ username, email, password });
      persistSession(data.token, data.user);
      return data.user;
    },
    [persistSession]
  );

  const logout = useCallback(() => {
    socket.disconnect();
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, ready, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}