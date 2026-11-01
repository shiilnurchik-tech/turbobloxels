/**
 * HTTP-клиент. Токен храним в localStorage: работает и внутри iframe-превью.
 *
 * Если рядом нет сервера (GitHub Pages, file://), клиент автоматически
 * переключается в локальный режим: те же REST-вызовы обслуживает localdb.js
 * поверх localStorage.
 */
import { localRequest } from './localdb.js';

const TOKEN_KEY = 'tbx.token';
const API_BASE = (typeof window !== 'undefined' && window.TBX_API_BASE ? String(window.TBX_API_BASE) : '/api').replace(/\/+$/, '');

let mode = null;

/** 'remote' | 'local' | null (ещё не проверяли). */
export function apiMode() {
  return mode;
}

export function setApiMode(next) {
  mode = next === 'remote' || next === 'local' ? next : null;
  return mode;
}

/** Определяет, есть ли поблизости сервер. Один раз за сессию. */
export async function detectMode() {
  if (mode) return mode;
  try {
    if (new URLSearchParams(location.search).get('local') === '1') {
      mode = 'local';
      return mode;
    }
  } catch {
    /* не браузер */
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${API_BASE}/stats`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const type = response.headers.get('content-type') || '';
    mode = response.ok && type.includes('application/json') ? 'remote' : 'local';
  } catch {
    mode = 'local';
  }
  return mode;
}

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
  if (!mode) await detectMode();
  if (mode === 'local') return localRequest(method, path, body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetch(`${API_BASE}${path}`, {
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
