/**
 * TurboBloxels — простое JSON-хранилище.
 * Один файл данных, атомарная запись (tmp + rename), отложенный флаш.
 * Никаких нативных зависимостей: работает везде, где есть Node 18+.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.TBX_DATA_DIR || path.join(ROOT, 'data');
export const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = () => ({
  version: 1,
  users: [],
  sessions: [],
  levels: [],
  scores: [],
  extensions: [],
  likes: [],
});

let db = null;
let flushTimer = null;
let pending = false;

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readFile() {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) return null;
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch (err) {
    // Битый файл не должен ронять сервер: откладываем копию и стартуем с чистого.
    try {
      fs.renameSync(DB_FILE, `${DB_FILE}.broken-${Date.now()}`);
    } catch {}
    console.error('[db] не удалось прочитать базу, создаю новую:', err.message);
    return null;
  }
}

export function getDb() {
  if (db) return db;
  const loaded = readFile();
  db = loaded ? { ...EMPTY(), ...loaded } : EMPTY();
  for (const key of Object.keys(EMPTY())) {
    if (!Array.isArray(db[key]) && key !== 'version') db[key] = [];
  }
  return db;
}

/** Помечает базу изменённой и планирует запись на диск. */
export function save() {
  pending = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushSync();
  }, 120);
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

export function flushSync() {
  if (!pending) return;
  pending = false;
  ensureDir();
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export function closeDb() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  flushSync();
}

export function resetDbForTests() {
  db = null;
  pending = false;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}
