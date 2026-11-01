/** HTTP-клиент. Токен храним в localStorage: работает и внутри iframe-превью. */
const TOKEN_KEY = 'tbx.token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* приватный режим */
  }
}

async function request(path, { method = 'GET', body, timeout = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      signal: controller.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text.slice(0, 200) };
      }
    }
    if (!response.ok) {
      const error = new Error(data?.error || `Ошибка ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Сервер не ответил. Попробуй ещё раз.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body ?? {} }),
  put: (path, body) => request(path, { method: 'PUT', body: body ?? {} }),
  del: (path) => request(path, { method: 'DELETE' }),

  // auth
  register: (name, password) => request('/auth/register', { method: 'POST', body: { name, password } }),
  login: (name, password) => request('/auth/login', { method: 'POST', body: { name, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),

  // уровни
  levels: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/levels${query ? `?${query}` : ''}`);
  },
  level: (id) => request(`/levels/${id}`),
  createLevel: (payload) => request('/levels', { method: 'POST', body: payload }),
  updateLevel: (id, payload) => request(`/levels/${id}`, { method: 'PUT', body: payload }),
  deleteLevel: (id) => request(`/levels/${id}`, { method: 'DELETE' }),
  playLevel: (id) => request(`/levels/${id}/play`, { method: 'POST' }),
  likeLevel: (id) => request(`/levels/${id}/like`, { method: 'POST' }),
  submitScore: (id, payload) => request(`/levels/${id}/score`, { method: 'POST', body: payload }),
  leaderboard: (id) => request(`/levels/${id}/leaderboard`),

  // расширения
  extensions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/extensions${query ? `?${query}` : ''}`);
  },
  extension: (id) => request(`/extensions/${id}`),
  createExtension: (payload) => request('/extensions', { method: 'POST', body: payload }),
  updateExtension: (id, payload) => request(`/extensions/${id}`, { method: 'PUT', body: payload }),
  deleteExtension: (id) => request(`/extensions/${id}`, { method: 'DELETE' }),
  likeExtension: (id) => request(`/extensions/${id}/like`, { method: 'POST' }),

  stats: () => request('/stats'),
};
