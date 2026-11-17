const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:5000';

const TOKEN_KEY = 'cs_token';

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Core REST helper. Attaches the bearer token automatically, normalises JSON,
 * and turns HTTP errors into throwable Errors for the UI to display.
 */
async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const authToken = token ?? getStoredToken();
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch(`${SERVER_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  return data;
}

// --- Auth -----------------------------------------------------------------
export const apiRegister = (payload) =>
  request('/api/auth/register', { method: 'POST', body: payload });
export const apiLogin = (payload) => request('/api/auth/login', { method: 'POST', body: payload });
export const apiMe = (token) => request('/api/auth/me', { token });

// --- Rooms ----------------------------------------------------------------
export const apiListRooms = () => request('/api/rooms');
export const apiCreateRoom = (payload = {}) =>
  request('/api/rooms', { method: 'POST', body: payload });
export const apiGetRoom = (roomId) => request(`/api/rooms/${roomId}`);

// --- Code execution -------------------------------------------------------
export async function executeCode({ language, code, stdin = '' }) {
  return request('/api/execute', {
    method: 'POST',
    body: { language, code, stdin },
  });
}