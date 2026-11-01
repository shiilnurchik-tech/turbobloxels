/**
 * Валидация данных уровня. Одна и та же схема используется клиентом и сервером,
 * чтобы формат не разъезжался.
 */
import { normalizeRules } from '../public/js/rules.js';

export const GRID = 13;
export const MAX_SCREENS = 12;
export const CELL_RE = /^[a-z0-9_:\-.]{1,48}$/i;

export function clampText(value, min = 0, max = 200) {
  const text = typeof value === 'string' ? value : value == null ? '' : String(value);
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max);
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'ext';
}

function normalizeGrid(grid, { maxLen = 48 } = {}) {
  const out = new Array(GRID * GRID).fill(null);
  const cells = Array.isArray(grid) ? grid : [];
  for (let i = 0; i < GRID * GRID && i < cells.length; i++) {
    const value = cells[i];
    if (value == null) continue;
    if (typeof value !== 'string') continue;
    if (value.length > maxLen) continue;
    if (!CELL_RE.test(value)) continue;
    out[i] = value;
  }
  return out;
}

function normalizeSettings(settings) {
  const src = settings && typeof settings === 'object' ? settings : {};
  const num = (v, def, min, max) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
  };
  return {
    gravity: num(src.gravity, 1, 0.4, 2),
    speed: num(src.speed, 1, 0.5, 2),
    jump: num(src.jump, 1, 0.5, 2),
  };
}

/** Возвращает {ok, data} либо {ok:false, error}. */
export function validateLevelData(data) {
  if (!data || typeof data !== 'object') return { ok: false, error: 'Нет данных уровня.' };
  const screens = Array.isArray(data.screens) ? data.screens.slice(0, MAX_SCREENS) : [];
  if (screens.length === 0) return { ok: false, error: 'Нужен хотя бы один экран доски.' };
  const normalizedScreens = screens.map((screen) => ({
    cells: normalizeGrid(screen?.cells),
  }));
  const result = {
    screens: normalizedScreens,
    character: { pixels: normalizeGrid(data.character?.pixels, { maxLen: 24 }) },
    background: { pixels: normalizeGrid(data.background?.pixels, { maxLen: 24 }) },
    rules: normalizeRules(data.rules),
    settings: normalizeSettings(data.settings),
  };
  const size = JSON.stringify(result).length;
  if (size > 300_000) return { ok: false, error: 'Уровень слишком большой.' };
  return { ok: true, data: result };
}
