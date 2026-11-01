/**
 * HTTP-сервер TurboBloxels.
 * REST API + раздача клиента (SPA). Хранилище — JSON-файл (см. db.js).
 */
import express from 'express';
import path from 'node:path';
import { getDb, save, ROOT } from './db.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  findSessionUser,
  destroySession,
  newId,
  rateLimiter,
  publicUser,
} from './auth.js';
import { validateLevelData, clampText, slugify } from './validate.js';
import { seedIfEmpty } from './seed.js';

const MAX_SOURCE = 100 * 1024;

function readToken(req) {
  const header = req.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const cookie = req.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)tbx_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function setTokenCookie(res, token) {
  res.set('Set-Cookie', `tbx_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
}

export function createApp() {
  const app = express();
  app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    // Песочница расширений — отдельный документ с ослабленной политикой,
    // но без доступа к сети и к родительской странице (sandbox без same-origin).
    if (req.path === '/sandbox.html') {
      res.set(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'"
      );
      return next();
    }
    res.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        "connect-src 'self'",
        "frame-src 'self' blob: data:",
        "form-action 'self'",
        "base-uri 'self'",
      ].join('; ')
    );
    next();
  });

  // ---- Пользователь в контексте запроса ------------------------------------
  app.use((req, res, next) => {
    const db = getDb();
    req.token = readToken(req);
    req.user = findSessionUser(db, req.token);
    next();
  });

  const requireUser = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Нужно войти в аккаунт.' });
    next();
  };

  const api = express.Router();
  app.use('/api', api);

  const authLimit = rateLimiter({ windowMs: 60_000, max: 20 });
  const writeLimit = rateLimiter({ windowMs: 60_000, max: 60 });

  // ---- Auth ---------------------------------------------------------------
  api.post('/auth/register', authLimit, (req, res) => {
    const db = getDb();
    const name = clampText(req.body?.name, 3, 24).trim();
    const password = String(req.body?.password || '');
    if (name.length < 3) return res.status(400).json({ error: 'Имя: от 3 до 24 символов.' });
    if (!/^[\w .\-а-яА-ЯёЁ]+$/u.test(name)) return res.status(400).json({ error: 'В имени есть недопустимые символы.' });
    if (password.length < 4) return res.status(400).json({ error: 'Пароль: минимум 4 символа.' });
    if (password.length > 200) return res.status(400).json({ error: 'Слишком длинный пароль.' });
    const exists = db.users.find((u) => u.name.toLowerCase() === name.toLowerCase());
    if (exists) return res.status(409).json({ error: 'Такое имя уже занято.' });

    const user = {
      id: newId('u_'),
      name,
      passHash: hashPassword(password),
      createdAt: Date.now(),
    };
    db.users.push(user);
    const token = createSession(db, user.id);
    save();
    setTokenCookie(res, token);
    res.status(201).json({ user: publicUser(user), token });
  });

  api.post('/auth/login', authLimit, (req, res) => {
    const db = getDb();
    const name = String(req.body?.name || '').trim();
    const password = String(req.body?.password || '');
    const user = db.users.find((u) => u.name.toLowerCase() === name.toLowerCase());
    if (!user || !verifyPassword(password, user.passHash)) {
      return res.status(401).json({ error: 'Неверное имя или пароль.' });
    }
    const token = createSession(db, user.id);
    save();
    setTokenCookie(res, token);
    res.json({ user: publicUser(user), token });
  });

  api.post('/auth/logout', (req, res) => {
    const db = getDb();
    destroySession(db, req.token);
    save();
    res.set('Set-Cookie', 'tbx_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.json({ ok: true });
  });

  api.get('/auth/me', (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  // ---- Уровни -------------------------------------------------------------
  const levelSummary = (level, user) => {
    const scores = getDb().scores.filter((s) => s.levelId === level.id);
    const best = scores.reduce((max, s) => Math.max(max, s.score), 0);
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
      liked: user ? getDb().likes.some((l) => l.levelId === level.id && l.userId === user.id) : false,
      mine: user ? level.ownerId === user.id : false,
      thumb: level.thumb || null,
      preview: level.data?.screens?.[0]?.cells || null,
      rules: level.data?.rules || {},
    };
  };

  api.get('/levels', (req, res) => {
    const db = getDb();
    const q = String(req.query.q || '').trim().toLowerCase();
    const sort = String(req.query.sort || 'recent');
    const mine = req.query.mine === '1';
    let list = db.levels.slice();
    if (mine) {
      if (!req.user) return res.status(401).json({ error: 'Нужно войти в аккаунт.' });
      list = list.filter((l) => l.ownerId === req.user.id);
    } else {
      list = list.filter((l) => l.published);
    }
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
    res.json({ levels: list.slice(0, 60).map((l) => levelSummary(l, req.user)) });
  });

  api.get('/levels/:id', (req, res) => {
    const db = getDb();
    const level = db.levels.find((l) => l.id === req.params.id);
    if (!level) return res.status(404).json({ error: 'Уровень не найден.' });
    const isOwner = req.user && level.ownerId === req.user.id;
    if (!level.published && !isOwner) return res.status(403).json({ error: 'Уровень не опубликован.' });
    res.json({ level, summary: levelSummary(level, req.user) });
  });

  api.post('/levels', writeLimit, requireUser, (req, res) => {
    const db = getDb();
    const title = clampText(req.body?.title, 1, 60).trim() || 'Без названия';
    const description = clampText(req.body?.description, 0, 400);
    const parsed = validateLevelData(req.body?.data);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const extensionIds = Array.isArray(req.body?.extensionIds)
      ? req.body.extensionIds.slice(0, 12).map((v) => clampText(v, 1, 60))
      : [];
    const level = {
      id: newId('l_'),
      ownerId: req.user.id,
      ownerName: req.user.name,
      title,
      description,
      data: parsed.data,
      extensionIds,
      thumb: typeof req.body?.thumb === 'string' && req.body.thumb.startsWith('data:image/') ? req.body.thumb.slice(0, 120_000) : null,
      published: req.body?.published === true,
      plays: 0,
      likes: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    db.levels.push(level);
    save();
    res.status(201).json({ level, summary: levelSummary(level, req.user) });
  });

  api.put('/levels/:id', writeLimit, requireUser, (req, res) => {
    const db = getDb();
    const level = db.levels.find((l) => l.id === req.params.id);
    if (!level) return res.status(404).json({ error: 'Уровень не найден.' });
    if (level.ownerId !== req.user.id) return res.status(403).json({ error: 'Это не твой уровень.' });

    if (req.body?.title !== undefined) level.title = clampText(req.body.title, 1, 60).trim() || level.title;
    if (req.body?.description !== undefined) level.description = clampText(req.body.description, 0, 400);
    if (req.body?.data !== undefined) {
      const parsed = validateLevelData(req.body.data);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      level.data = parsed.data;
    }
    if (Array.isArray(req.body?.extensionIds)) {
      level.extensionIds = req.body.extensionIds.slice(0, 12).map((v) => clampText(v, 1, 60));
    }
    if (typeof req.body?.thumb === 'string' && req.body.thumb.startsWith('data:image/')) {
      level.thumb = req.body.thumb.slice(0, 120_000);
    }
    if (typeof req.body?.published === 'boolean') level.published = req.body.published;
    level.updatedAt = Date.now();
    save();
    res.json({ level, summary: levelSummary(level, req.user) });
  });

  api.delete('/levels/:id', writeLimit, requireUser, (req, res) => {
    const db = getDb();
    const idx = db.levels.findIndex((l) => l.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Уровень не найден.' });
    if (db.levels[idx].ownerId !== req.user.id) return res.status(403).json({ error: 'Это не твой уровень.' });
    db.levels.splice(idx, 1);
    db.scores = db.scores.filter((s) => s.levelId !== req.params.id);
    db.likes = db.likes.filter((l) => l.levelId !== req.params.id);
    save();
    res.json({ ok: true });
  });

  api.post('/levels/:id/play', (req, res) => {
    const db = getDb();
    const level = db.levels.find((l) => l.id === req.params.id);
    if (!level) return res.status(404).json({ error: 'Уровень не найден.' });
    level.plays += 1;
    save();
    res.json({ plays: level.plays });
  });

  api.post('/levels/:id/like', writeLimit, requireUser, (req, res) => {
    const db = getDb();
    const level = db.levels.find((l) => l.id === req.params.id);
    if (!level) return res.status(404).json({ error: 'Уровень не найден.' });
    const existing = db.likes.findIndex((l) => l.levelId === level.id && l.userId === req.user.id);
    if (existing >= 0) {
      db.likes.splice(existing, 1);
      level.likes = Math.max(0, level.likes - 1);
    } else {
      db.likes.push({ levelId: level.id, userId: req.user.id, at: Date.now() });
      level.likes += 1;
    }
    save();
    res.json({ likes: level.likes, liked: existing < 0 });
  });

  api.post('/levels/:id/score', writeLimit, (req, res) => {
    const db = getDb();
    const level = db.levels.find((l) => l.id === req.params.id);
    if (!level) return res.status(404).json({ error: 'Уровень не найден.' });
    const score = Math.max(0, Math.min(9_999_999, Math.round(Number(req.body?.score) || 0)));
    const time = Math.max(0, Math.min(10_000_000, Math.round(Number(req.body?.time) || 0)));
    const name = req.user ? req.user.name : clampText(req.body?.name, 1, 24).trim() || 'Гость';
    db.scores.push({
      id: newId('s_'),
      levelId: level.id,
      userId: req.user?.id || null,
      name,
      score,
      time,
      at: Date.now(),
    });
    // Держим только топ-200 на уровень.
    const forLevel = db.scores.filter((s) => s.levelId === level.id).sort((a, b) => b.score - a.score);
    if (forLevel.length > 200) {
      const keep = new Set(forLevel.slice(0, 200).map((s) => s.id));
      db.scores = db.scores.filter((s) => s.levelId !== level.id || keep.has(s.id));
    }
    save();
    res.json({ leaderboard: leaderboard(level.id) });
  });

  function leaderboard(levelId) {
    const db = getDb();
    const rows = db.scores.filter((s) => s.levelId === levelId);
    const best = new Map();
    for (const row of rows) {
      const key = row.userId || `guest:${row.name}`;
      const prev = best.get(key);
      if (!prev || row.score > prev.score || (row.score === prev.score && row.time < prev.time)) best.set(key, row);
    }
    return [...best.values()].sort((a, b) => b.score - a.score || a.time - b.time).slice(0, 20);
  }

  api.get('/levels/:id/leaderboard', (req, res) => {
    res.json({ leaderboard: leaderboard(req.params.id) });
  });

  // ---- Расширения ---------------------------------------------------------
  const extSummary = (ext, user) => ({
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
    liked: user ? getDb().likes.some((l) => l.extId === ext.id && l.userId === user.id) : false,
    mine: user ? ext.ownerId === user.id : false,
  });

  api.get('/extensions', (req, res) => {
    const db = getDb();
    const q = String(req.query.q || '').trim().toLowerCase();
    let list = db.extensions.slice();
    if (q) {
      list = list.filter(
        (e) => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.ownerName.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => b.likes - a.likes || b.updatedAt - a.updatedAt);
    res.json({ extensions: list.map((e) => extSummary(e, req.user)) });
  });

  api.get('/extensions/:id', (req, res) => {
    const db = getDb();
    const ext = db.extensions.find((e) => e.id === req.params.id);
    if (!ext) return res.status(404).json({ error: 'Расширение не найдено.' });
    res.json({ extension: { ...extSummary(ext, req.user), source: ext.source } });
  });

  api.post('/extensions', writeLimit, requireUser, (req, res) => {
    const db = getDb();
    const source = typeof req.body?.source === 'string' ? req.body.source : '';
    if (!source.trim()) return res.status(400).json({ error: 'Пустой исходный код.' });
    if (source.length > MAX_SOURCE) return res.status(413).json({ error: 'Код больше 100 КБ.' });
    const name = clampText(req.body?.name, 1, 60).trim();
    if (!name) return res.status(400).json({ error: 'Нужно название расширения.' });
    const description = clampText(req.body?.description, 0, 500);
    const version = clampText(req.body?.version || '1.0.0', 1, 20);
    const id = `x_${slugify(name).slice(0, 24)}_${newId().slice(0, 6)}`;

    // Сводка блоков от клиента (только для витрины; исполняется всегда source).
    const blocks = Array.isArray(req.body?.blocks)
      ? req.body.blocks.slice(0, 60).map((b) => ({
          id: clampText(b?.id, 1, 40),
          name: clampText(b?.name || b?.id, 1, 40),
          color: /^#[0-9a-fA-F]{3,8}$/.test(String(b?.color)) ? String(b.color) : '#9aa4b2',
        }))
      : [];

    const ext = {
      id,
      ownerId: req.user.id,
      ownerName: req.user.name,
      name,
      version,
      description,
      source,
      blocks,
      likes: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    db.extensions.push(ext);
    if (db.extensions.length > 2000) db.extensions = db.extensions.slice(-2000);
    save();
    res.status(201).json({ extension: extSummary(ext, req.user) });
  });

  api.put('/extensions/:id', writeLimit, requireUser, (req, res) => {
    const db = getDb();
    const ext = db.extensions.find((e) => e.id === req.params.id);
    if (!ext) return res.status(404).json({ error: 'Расширение не найдено.' });
    if (ext.ownerId !== req.user.id) return res.status(403).json({ error: 'Это не твоё расширение.' });
    if (typeof req.body?.source === 'string') {
      if (req.body.source.length > MAX_SOURCE) return res.status(413).json({ error: 'Код больше 100 КБ.' });
      ext.source = req.body.source;
    }
    if (req.body?.name !== undefined) ext.name = clampText(req.body.name, 1, 60).trim() || ext.name;
    if (req.body?.description !== undefined) ext.description = clampText(req.body.description, 0, 500);
    if (req.body?.version !== undefined) ext.version = clampText(req.body.version, 1, 20);
    if (Array.isArray(req.body?.blocks)) {
      ext.blocks = req.body.blocks.slice(0, 60).map((b) => ({
        id: clampText(b?.id, 1, 40),
        name: clampText(b?.name || b?.id, 1, 40),
        color: /^#[0-9a-fA-F]{3,8}$/.test(String(b?.color)) ? String(b.color) : '#9aa4b2',
      }));
    }
    ext.updatedAt = Date.now();
    save();
    res.json({ extension: extSummary(ext, req.user) });
  });

  api.delete('/extensions/:id', writeLimit, requireUser, (req, res) => {
    const db = getDb();
    const idx = db.extensions.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Расширение не найдено.' });
    if (db.extensions[idx].ownerId !== req.user.id) return res.status(403).json({ error: 'Это не твоё расширение.' });
    db.extensions.splice(idx, 1);
    db.likes = db.likes.filter((l) => l.extId !== req.params.id);
    save();
    res.json({ ok: true });
  });

  api.post('/extensions/:id/like', writeLimit, requireUser, (req, res) => {
    const db = getDb();
    const ext = db.extensions.find((e) => e.id === req.params.id);
    if (!ext) return res.status(404).json({ error: 'Расширение не найдено.' });
    const existing = db.likes.findIndex((l) => l.extId === ext.id && l.userId === req.user.id);
    if (existing >= 0) {
      db.likes.splice(existing, 1);
      ext.likes = Math.max(0, ext.likes - 1);
    } else {
      db.likes.push({ extId: ext.id, userId: req.user.id, asExt: true, at: Date.now() });
      ext.likes += 1;
    }
    save();
    res.json({ likes: ext.likes, liked: existing < 0 });
  });

  // ---- Статистика ---------------------------------------------------------
  api.get('/stats', (req, res) => {
    const db = getDb();
    res.json({
      levels: db.levels.filter((l) => l.published).length,
      users: db.users.length,
      extensions: db.extensions.length,
      plays: db.levels.reduce((sum, l) => sum + l.plays, 0),
    });
  });

  api.use((req, res) => res.status(404).json({ error: 'Неизвестный маршрут API.' }));

  // ---- Статика клиента ----------------------------------------------------
  const publicDir = path.join(ROOT, 'public');
  app.use(
    express.static(publicDir, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-cache');
        else res.set('Cache-Control', 'public, max-age=60');
      },
    })
  );

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Слишком большой запрос.' });
    console.error('[server]', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  });

  seedIfEmpty();
  return app;
}
