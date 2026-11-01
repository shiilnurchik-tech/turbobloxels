/**
 * Пароли, токены сессий и небольшие утилиты валидации.
 */
import crypto from 'node:crypto';

const SESSION_TTL = 1000 * 60 * 60 * 24 * 30; // 30 дней

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [algo, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 32);
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== candidate.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function createSession(db, userId) {
  const token = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  db.sessions = db.sessions.filter((s) => s.expiresAt > now);
  db.sessions.push({ tokenHash: sha256(token), userId, createdAt: now, expiresAt: now + SESSION_TTL });
  // Не даём списку сессий расти бесконечно.
  if (db.sessions.length > 5000) db.sessions = db.sessions.slice(-5000);
  return token;
}

export function findSessionUser(db, token) {
  if (!token) return null;
  const hash = sha256(token);
  const now = Date.now();
  const session = db.sessions.find((s) => s.tokenHash === hash && s.expiresAt > now);
  if (!session) return null;
  return db.users.find((u) => u.id === session.userId) || null;
}

export function destroySession(db, token) {
  if (!token) return;
  const hash = sha256(token);
  db.sessions = db.sessions.filter((s) => s.tokenHash !== hash);
}

export function newId(prefix = '') {
  return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

/** Простая защита от флуда: N запросов за окно с одного IP. */
export function rateLimiter({ windowMs = 60_000, max = 30 } = {}) {
  const hits = new Map();
  return function limit(req, res, next) {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now > entry.reset) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      const retry = Math.ceil((entry.reset - now) / 1000);
      res.set('Retry-After', String(retry));
      return res.status(429).json({ error: 'Слишком много запросов. Попробуй позже.' });
    }
    return next();
  };
}

export function publicUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, createdAt: user.createdAt };
}
