/**
 * Локальный «сервер» для статического размещения (GitHub Pages и т.п.).
 *
 * Повторяет тот же REST-контракт, что и Node-сервер, но хранит всё
 * в localStorage браузера. Уровни, расширения, лайки и результаты живут
 * только на этом устройстве — это режим «без сервера».
 */
import { validateLevelData, clampText, slugify } from './validate.js';
import { buildDemoLevelData, DEMO_TITLE, DEMO_DESCRIPTION, EXAMPLE_EXTENSIONS } from './seed-data.js';

const DB_KEY = 'tbx.localdb.v1';
const MAX_SOURCE = 100 * 1024;

function now() {
  return Date.now();
}

function rid(prefix) {
  return `${prefix}${now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readRaw() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeRaw(db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    return true;
  } catch {
    // Переполнение localStorage: чистим историю результатов, но не падаем.
    try {
      db.scores = db.scores.slice(-50);
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch {
      /* остаёмся в памяти */
    }
    return false;
  }
}

function seedDb() {
  const db = {
    version: 1,
    profile: null,
    levels: [],
    extensions: [],
    likes: [],
    scores: [],
  };
  db.levels.push({
    id: 'l_demo_local',
    ownerId: 'u_system',
    ownerName: 'TurboBloxels',
    title: DEMO_TITLE,
    description: DEMO_DESCRIPTION,
    data: buildDemoLevelData(),
    extensionIds: [],
    thumb: null,
    published: true,
    plays: 0,
    likes: 0,
    createdAt: now(),
    updatedAt: now(),
  });
  for (const example of EXAMPLE_EXTENSIONS) {
    db.extensions.push({
      id: example.id,
      ownerId: 'u_system',
      ownerName: 'TurboBloxels',
      name: example.name,
      version: example.version,
      description: example.description,
      source: example.source,
      blocks: example.blocks,
      likes: 0,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  writeRaw(db);
  return db;
}

let cache = null;

export function getLocalDb() {
  if (cache) return cache;
  const raw = readRaw();
  if (raw && Array.isArray(raw.levels)) {
    cache = { version: 1, profile: null, levels: [], extensions: [], likes: [], scores: [], ...raw };
    return cache;
  }
  cache = seedDb();
  return cache;
}

function persist() {
  if (cache) writeRaw(cache);
}

export function resetLocalDb() {
  cache = null;
  try {
    localStorage.removeItem(DB_KEY);
  } catch {
    /* ignore */
  }
  return getLocalDb();
}

function me() {
  const db = getLocalDb();
  return db.profile ? { id: db.profile.id, name: db.profile.name, createdAt: db.profile.createdAt } : null;
}

function levelSummary(level) {
  const db = getLocalDb();
  const user = me();
  const best = db.scores.filter((s) => s.levelId === level.id).reduce((max, s) => Math.max(max, s.score), 0);
  return {
    id: level.id,
    title: level.title,
    description: level.description,
    ownerName: level.ownerName,
    ownerId: level.ownerId,
    plays: level.plays,
    likes: level.likes,
    screens: level.data?.screens?.length || 0,
    extensionIds: level.extensionIds || [],
    createdAt: level.createdAt,
    updatedAt: level.updatedAt,
    bestScore: best,
    liked: user ? db.likes.some((l) => l.levelId === level.id && l.userId === user.id) : false,
    mine: user ? level.ownerId === user.id : false,
    thumb: level.thumb || null,
    preview: level.data?.screens?.[0]?.cells || null,
    rules: level.data?.rules || {},
    local: true,
  };
}

function extSummary(ext) {
  const user = me();
  const db = getLocalDb();
  return {
    id: ext.id,
    name: ext.name,
    version: ext.version,
    description: ext.description,
    author: ext.ownerName,
    ownerId: ext.ownerId,
    blocks: ext.blocks || [],
    likes: ext.likes,
    sourceBytes: (ext.source || '').length,
    createdAt: ext.createdAt,
    updatedAt: ext.updatedAt,
    liked: user ? db.likes.some((l) => l.extId === ext.id && l.userId === user.id) : false,
    mine: user ? ext.ownerId === user.id : false,
    local: true,
  };
}

function leaderboard(levelId) {
  const db = getLocalDb();
  const rows = db.scores.filter((s) => s.levelId === levelId);
  const best = new Map();
  for (const row of rows) {
    const key = row.userId || `guest:${row.name}`;
    const prev = best.get(key);
    if (!prev || row.score > prev.score) best.set(key, row);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.time - b.time).slice(0, 20);
}

function requireProfile() {
  const user = me();
  if (!user) throw fail(401, 'Нужно войти в аккаунт (в локальном режиме — просто имя).');
  return user;
}

function normalizeLevelPayload(body, owner) {
  const parsed = validateLevelData(body?.data);
  if (!parsed.ok) throw fail(400, parsed.error);
  return {
    title: clampText(body?.title, 1, 60).trim() || 'Без названия',
    description: clampText(body?.description, 0, 400),
    data: parsed.data,
    extensionIds: Array.isArray(body?.extensionIds) ? body.extensionIds.slice(0, 12).map((v) => clampText(v, 1, 60)) : [],
    thumb: typeof body?.thumb === 'string' && body.thumb.startsWith('data:image/') ? body.thumb.slice(0, 120_000) : null,
    published: body?.published === true,
    ownerId: owner.id,
    ownerName: owner.name,
  };
}

/**
 * Мини-роутер в стиле REST. Возвращает данные или бросает Error со `status`.
 * @param {string} method
 * @param {string} path — путь без /api, например "/levels/abc?sort=popular"
 * @param {object} [body]
 */
export function localRequest(method, path, body) {
  const db = getLocalDb();
  const [pathname, queryString] = String(path).split('?');
  const query = new URLSearchParams(queryString || '');
  const parts = pathname.split('/').filter(Boolean);
  const m = method.toUpperCase();

  // ---- auth ---------------------------------------------------------------
  if (parts[0] === 'auth') {
    if (parts[1] === 'me' && m === 'GET') return { user: me() };
    if (parts[1] === 'register' && m === 'POST') {
      const name = clampText(body?.name, 3, 24).trim();
      if (name.length < 3) throw fail(400, 'Имя: от 3 до 24 символов.');
      if (String(body?.password || '').length < 4) throw fail(400, 'Пароль: минимум 4 символа.');
      if (db.profile && db.profile.name.toLowerCase() === name.toLowerCase()) throw fail(409, 'Такое имя уже занято.');
      db.profile = { id: rid('u_'), name, createdAt: now() };
      persist();
      return { user: me(), token: 'local' };
    }
    if (parts[1] === 'login' && m === 'POST') {
      const name = clampText(body?.name, 1, 24).trim() || 'Игрок';
      if (!db.profile) {
        db.profile = { id: rid('u_'), name, createdAt: now() };
        persist();
      } else if (db.profile.name.toLowerCase() !== name.toLowerCase()) {
        // Локальный профиль один: просто переименовываем его.
        db.profile.name = name;
        persist();
      }
      return { user: me(), token: 'local' };
    }
    if (parts[1] === 'logout' && m === 'POST') {
      db.profile = null;
      persist();
      return { ok: true };
    }
    throw fail(404, 'Неизвестный маршрут.');
  }

  // ---- статистика ---------------------------------------------------------
  if (parts[0] === 'stats' && m === 'GET') {
    return {
      levels: db.levels.filter((l) => l.published).length,
      users: db.profile ? 1 : 0,
      extensions: db.extensions.length,
      plays: db.levels.reduce((sum, l) => sum + l.plays, 0),
      local: true,
    };
  }

  // ---- уровни -------------------------------------------------------------
  if (parts[0] === 'levels') {
    const id = parts[1];
    const action = parts[2];

    if (!id && m === 'GET') {
      const user = me();
      const q = String(query.get('q') || '').trim().toLowerCase();
      const sort = query.get('sort') || 'recent';
      const mine = query.get('mine') === '1';
      if (mine && !user) throw fail(401, 'Нужно войти в аккаунт.');
      let list = db.levels.slice();
      list = mine && user ? list.filter((l) => l.ownerId === user.id) : list.filter((l) => l.published);
      if (q) {
        list = list.filter(
          (l) =>
            l.title.toLowerCase().includes(q) ||
            l.description.toLowerCase().includes(q) ||
            l.ownerName.toLowerCase().includes(q)
        );
      }
      if (sort === 'popular') list.sort((a, b) => b.plays + b.likes * 3 - (a.plays + a.likes * 3));
      else if (sort === 'best') list.sort((a, b) => b.likes - a.likes || b.plays - a.plays);
      else list.sort((a, b) => b.updatedAt - a.updatedAt);
      return { levels: list.slice(0, 60).map(levelSummary) };
    }

    if (!id && m === 'POST') {
      const user = requireProfile();
      const payload = normalizeLevelPayload(body, user);
      const level = {
        id: rid('l_'),
        ...payload,
        plays: 0,
        likes: 0,
        createdAt: now(),
        updatedAt: now(),
      };
      db.levels.push(level);
      persist();
      return { level, summary: levelSummary(level) };
    }

    const level = id ? db.levels.find((l) => l.id === id) : null;

    if (id && !action && m === 'GET') {
      if (!level) throw fail(404, 'Уровень не найден.');
      const user = me();
      const isOwner = user && level.ownerId === user.id;
      if (!level.published && !isOwner) throw fail(403, 'Уровень не опубликован.');
      return { level, summary: levelSummary(level) };
    }

    if (id && !action && m === 'PUT') {
      const user = requireProfile();
      if (!level) throw fail(404, 'Уровень не найден.');
      if (level.ownerId !== user.id) throw fail(403, 'Это не твой уровень.');
      if (body?.data !== undefined) {
        const parsed = validateLevelData(body.data);
        if (!parsed.ok) throw fail(400, parsed.error);
        level.data = parsed.data;
      }
      if (body?.title !== undefined) level.title = clampText(body.title, 1, 60).trim() || level.title;
      if (body?.description !== undefined) level.description = clampText(body.description, 0, 400);
      if (Array.isArray(body?.extensionIds)) level.extensionIds = body.extensionIds.slice(0, 12).map((v) => clampText(v, 1, 60));
      if (typeof body?.thumb === 'string' && body.thumb.startsWith('data:image/')) level.thumb = body.thumb.slice(0, 120_000);
      if (typeof body?.published === 'boolean') level.published = body.published;
      level.updatedAt = now();
      persist();
      return { level, summary: levelSummary(level) };
    }

    if (id && !action && m === 'DELETE') {
      const user = requireProfile();
      if (!level) throw fail(404, 'Уровень не найден.');
      if (level.ownerId !== user.id) throw fail(403, 'Это не твой уровень.');
      db.levels = db.levels.filter((l) => l.id !== id);
      db.scores = db.scores.filter((s) => s.levelId !== id);
      db.likes = db.likes.filter((l) => l.levelId !== id);
      persist();
      return { ok: true };
    }

    if (id && action === 'play' && m === 'POST') {
      if (!level) throw fail(404, 'Уровень не найден.');
      level.plays += 1;
      persist();
      return { plays: level.plays };
    }

    if (id && action === 'like' && m === 'POST') {
      const user = requireProfile();
      if (!level) throw fail(404, 'Уровень не найден.');
      const index = db.likes.findIndex((l) => l.levelId === id && l.userId === user.id && !l.extId);
      if (index >= 0) {
        db.likes.splice(index, 1);
        level.likes = Math.max(0, level.likes - 1);
      } else {
        db.likes.push({ levelId: id, userId: user.id, at: now() });
        level.likes += 1;
      }
      persist();
      return { likes: level.likes, liked: index < 0 };
    }

    if (id && action === 'score' && m === 'POST') {
      if (!level) throw fail(404, 'Уровень не найден.');
      const user = me();
      const score = Math.max(0, Math.min(9_999_999, Math.round(Number(body?.score) || 0)));
      const time = Math.max(0, Math.min(10_000_000, Math.round(Number(body?.time) || 0)));
      db.scores.push({
        id: rid('s_'),
        levelId: id,
        userId: user?.id || null,
        name: user?.name || clampText(body?.name, 1, 24).trim() || 'Гость',
        score,
        time,
        at: now(),
      });
      if (db.scores.length > 500) db.scores = db.scores.slice(-500);
      persist();
      return { leaderboard: leaderboard(id) };
    }

    if (id && action === 'leaderboard' && m === 'GET') {
      return { leaderboard: leaderboard(id) };
    }

    throw fail(404, 'Неизвестный маршрут.');
  }

  // ---- расширения ---------------------------------------------------------
  if (parts[0] === 'extensions') {
    const id = parts[1];
    const action = parts[2];

    if (!id && m === 'GET') {
      const q = String(query.get('q') || '').trim().toLowerCase();
      let list = db.extensions.slice();
      if (q) {
        list = list.filter(
          (e) =>
            e.name.toLowerCase().includes(q) ||
            (e.description || '').toLowerCase().includes(q) ||
            e.ownerName.toLowerCase().includes(q)
        );
      }
      list.sort((a, b) => b.likes - a.likes || b.updatedAt - a.updatedAt);
      return { extensions: list.map(extSummary) };
    }

    if (!id && m === 'POST') {
      const user = requireProfile();
      const source = typeof body?.source === 'string' ? body.source : '';
      if (!source.trim()) throw fail(400, 'Пустой исходный код.');
      if (source.length > MAX_SOURCE) throw fail(413, 'Код больше 100 КБ.');
      const name = clampText(body?.name, 1, 60).trim();
      if (!name) throw fail(400, 'Нужно название расширения.');
      const ext = {
        id: `x_${slugify(name).slice(0, 24)}_${rid('').slice(0, 6)}`,
        ownerId: user.id,
        ownerName: user.name,
        name,
        version: clampText(body?.version || '1.0.0', 1, 20),
        description: clampText(body?.description, 0, 500),
        source,
        blocks: Array.isArray(body?.blocks)
          ? body.blocks.slice(0, 60).map((b) => ({
              id: clampText(b?.id, 1, 40),
              name: clampText(b?.name || b?.id, 1, 40),
              color: /^#[0-9a-fA-F]{3,8}$/.test(String(b?.color)) ? String(b.color) : '#9aa4b2',
            }))
          : [],
        likes: 0,
        createdAt: now(),
        updatedAt: now(),
      };
      db.extensions.push(ext);
      persist();
      return { extension: extSummary(ext) };
    }

    const ext = id ? db.extensions.find((e) => e.id === id) : null;

    if (id && !action && m === 'GET') {
      if (!ext) throw fail(404, 'Расширение не найдено.');
      return { extension: { ...extSummary(ext), source: ext.source } };
    }

    if (id && !action && m === 'PUT') {
      const user = requireProfile();
      if (!ext) throw fail(404, 'Расширение не найдено.');
      if (ext.ownerId !== user.id) throw fail(403, 'Это не твоё расширение.');
      if (typeof body?.source === 'string') {
        if (body.source.length > MAX_SOURCE) throw fail(413, 'Код больше 100 КБ.');
        ext.source = body.source;
      }
      if (body?.name !== undefined) ext.name = clampText(body.name, 1, 60).trim() || ext.name;
      if (body?.description !== undefined) ext.description = clampText(body.description, 0, 500);
      if (body?.version !== undefined) ext.version = clampText(body.version, 1, 20);
      if (Array.isArray(body?.blocks)) {
        ext.blocks = body.blocks.slice(0, 60).map((b) => ({
          id: clampText(b?.id, 1, 40),
          name: clampText(b?.name || b?.id, 1, 40),
          color: /^#[0-9a-fA-F]{3,8}$/.test(String(b?.color)) ? String(b.color) : '#9aa4b2',
        }));
      }
      ext.updatedAt = now();
      persist();
      return { extension: extSummary(ext) };
    }

    if (id && !action && m === 'DELETE') {
      const user = requireProfile();
      if (!ext) throw fail(404, 'Расширение не найдено.');
      if (ext.ownerId !== user.id) throw fail(403, 'Это не твоё расширение.');
      db.extensions = db.extensions.filter((e) => e.id !== id);
      db.likes = db.likes.filter((l) => l.extId !== id);
      persist();
      return { ok: true };
    }

    if (id && action === 'like' && m === 'POST') {
      const user = requireProfile();
      if (!ext) throw fail(404, 'Расширение не найдено.');
      const index = db.likes.findIndex((l) => l.extId === id && l.userId === user.id);
      if (index >= 0) {
        db.likes.splice(index, 1);
        ext.likes = Math.max(0, ext.likes - 1);
      } else {
        db.likes.push({ extId: id, userId: user.id, asExt: true, at: now() });
        ext.likes += 1;
      }
      persist();
      return { likes: ext.likes, liked: index < 0 };
    }

    throw fail(404, 'Неизвестный маршрут.');
  }

  throw fail(404, 'Неизвестный маршрут.');
}

export function localDbStats() {
  const db = getLocalDb();
  return { levels: db.levels.length, extensions: db.extensions.length, scores: db.scores.length };
}
