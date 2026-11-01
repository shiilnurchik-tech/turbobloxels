/** Глобальное состояние клиента: пользователь, черновики, расширения. */
import { api, getToken, setToken } from './api.js';
import { ExtHost } from './ext/runtime.js';
import { buildRegistry } from './registry.js';
import { createEmptyLevel, normalizeLevel } from './game/world.js';

const INSTALLED_KEY = 'tbx.installed';
const DRAFTS_KEY = 'tbx.drafts';
const DRAFT_PREFIX = 'tbx.draft.';

export const store = {
  user: null,
  extList: [],
  installed: new Set(),
  extCache: new Map(),
  extErrors: [],
  host: null,
  hostIds: '',
  publicLevels: [],
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* переполнение localStorage не должно ломать приложение */
  }
}

// ---- пользователь ---------------------------------------------------------
export async function refreshUser() {
  try {
    const data = await api.me();
    store.user = data.user || null;
  } catch {
    store.user = null;
  }
  return store.user;
}

export async function login(name, password) {
  const data = await api.login(name, password);
  setToken(data.token);
  store.user = data.user;
  return data.user;
}

export async function register(name, password) {
  const data = await api.register(name, password);
  setToken(data.token);
  store.user = data.user;
  return data.user;
}

export async function logout() {
  try {
    await api.logout();
  } catch {
    /* уже вышли */
  }
  setToken('');
  store.user = null;
}

export function isLoggedIn() {
  return !!store.user || !!getToken();
}

// ---- черновики ------------------------------------------------------------
export function listDrafts() {
  const index = readJson(DRAFTS_KEY, []);
  return index
    .map((item) => {
      const draft = readJson(DRAFT_PREFIX + item.id, null);
      return draft ? draft : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getDraft(id) {
  return readJson(DRAFT_PREFIX + id, null);
}

export function newDraftId() {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function saveDraft(draft) {
  const next = { ...draft, updatedAt: Date.now() };
  writeJson(DRAFT_PREFIX + next.id, next);
  const index = readJson(DRAFTS_KEY, []).filter((item) => item.id !== next.id);
  index.push({ id: next.id, title: next.title, updatedAt: next.updatedAt });
  writeJson(DRAFTS_KEY, index);
  return next;
}

export function deleteDraft(id) {
  writeJson(DRAFTS_KEY, readJson(DRAFTS_KEY, []).filter((item) => item.id !== id));
  try {
    localStorage.removeItem(DRAFT_PREFIX + id);
  } catch {
    /* ignore */
  }
}

export function makeDraft(partial = {}) {
  return {
    id: partial.id || newDraftId(),
    title: partial.title || 'Новый уровень',
    description: partial.description || '',
    level: normalizeLevel(partial.level || createEmptyLevel()),
    extensionIds: partial.extensionIds || [],
    serverId: partial.serverId || null,
    updatedAt: Date.now(),
  };
}

// ---- расширения -----------------------------------------------------------
export function loadInstalled() {
  store.installed = new Set(readJson(INSTALLED_KEY, []));
  return store.installed;
}

function persistInstalled() {
  writeJson(INSTALLED_KEY, [...store.installed]);
  store.hostIds = ''; // заставим перезагрузить песочницы
}

export function isInstalled(id) {
  return store.installed.has(id);
}

export function installExtension(id) {
  store.installed.add(id);
  persistInstalled();
}

export function uninstallExtension(id) {
  store.installed.delete(id);
  persistInstalled();
}

export async function refreshExtensionList() {
  try {
    const data = await api.extensions();
    store.extList = data.extensions || [];
  } catch {
    store.extList = [];
  }
  return store.extList;
}

export async function fetchExtension(id) {
  if (store.extCache.has(id)) return store.extCache.get(id);
  const data = await api.extension(id);
  store.extCache.set(id, data.extension);
  return data.extension;
}

export function cacheExtension(ext) {
  if (!ext || !ext.id) return;
  store.extCache.set(ext.id, ext);
}

/** Загружает исходники установленных (и дополнительно указанных) расширений в песочницы. */
export async function ensureHost(extraIds = []) {
  const ids = [...new Set([...store.installed, ...extraIds])].filter(Boolean);
  const signature = ids.slice().sort().join(',');
  if (!store.host) store.host = new ExtHost();
  if (store.hostIds === signature) return store.host;

  const sources = [];
  const failed = [];
  for (const id of ids) {
    try {
      const ext = await fetchExtension(id);
      if (ext?.source) sources.push({ id, name: ext.name, source: ext.source });
    } catch (err) {
      failed.push({ id, name: id, error: err.message });
    }
  }
  // Выгружаем расширения, которые больше не нужны.
  for (const id of [...store.host.items.keys()]) {
    if (!ids.includes(id)) store.host.unload(id);
  }
  // Уже загруженные не перезагружаем без нужды.
  const loaded = new Set(store.host.items.keys());
  const toLoad = sources.filter((s) => !loaded.has(s.id));
  const result = await store.host.loadAll(toLoad);
  store.extErrors = [...failed, ...result.failed];
  store.hostIds = signature;
  return store.host;
}

export function currentRegistry() {
  const manifests = store.host ? store.host.registryManifests() : [];
  return buildRegistry(manifests);
}
