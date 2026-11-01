import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let server;
let base;
let closeApp;
let tmpDir;

test.before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbx-test-'));
  process.env.TBX_DATA_DIR = tmpDir;
  const { createApp } = await import('../server/app.js');
  const { closeDb } = await import('../server/db.js');
  closeApp = closeDb;
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  closeApp?.();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

async function call(pathname, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(base + pathname, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data, text };
}

const validLevel = () => ({
  screens: [
    {
      cells: Array.from({ length: 169 }, (_, i) => (i > 155 ? 'ground' : i === 20 ? 'coin' : null)),
    },
  ],
  character: { pixels: new Array(169).fill(null) },
  background: { pixels: new Array(169).fill(null) },
  rules: {
    coin: [{ trigger: 'enter', conditions: [], actions: [{ type: 'score', value: 3 }, { type: 'remove' }] }],
  },
  settings: { gravity: 1, speed: 1, jump: 1 },
});

test('сид-данные на месте: демо-уровень и примеры расширений', async () => {
  const res = await call('/api/stats');
  assert.equal(res.status, 200);
  assert.ok(res.data.levels >= 1);
  assert.ok(res.data.extensions >= 2);
  const levels = await call('/api/levels');
  assert.ok(levels.data.levels.some((level) => level.title === 'Первый прыжок'));
});

test('регистрация, вход и защита от повторов', async () => {
  const reg = await call('/api/auth/register', { method: 'POST', body: { name: 'Игрок', password: '1234' } });
  assert.equal(reg.status, 201);
  assert.ok(reg.data.token);

  const dup = await call('/api/auth/register', { method: 'POST', body: { name: 'игрок', password: '1234' } });
  assert.equal(dup.status, 409);

  const short = await call('/api/auth/register', { method: 'POST', body: { name: 'Второй', password: '12' } });
  assert.equal(short.status, 400);

  const login = await call('/api/auth/login', { method: 'POST', body: { name: 'Игрок', password: '1234' } });
  assert.equal(login.status, 200);

  const bad = await call('/api/auth/login', { method: 'POST', body: { name: 'Игрок', password: 'wrong' } });
  assert.equal(bad.status, 401);

  const me = await call('/api/auth/me', { token: reg.data.token });
  assert.equal(me.data.user.name, 'Игрок');
  assert.equal(me.data.user.passHash, undefined, 'хэш пароля не утекает');
});

test('уровень: создание, чтение, правка, лайк, результаты', async () => {
  const reg = await call('/api/auth/register', { method: 'POST', body: { name: 'Автор', password: '1234' } });
  const token = reg.data.token;

  const created = await call('/api/levels', {
    method: 'POST',
    token,
    body: { title: 'Мой уровень', description: 'тест', data: validLevel(), published: true, extensionIds: ['x_demo'] },
  });
  assert.equal(created.status, 201);
  const id = created.data.level.id;
  assert.equal(created.data.level.data.rules.coin[0].actions[0].value, 3);

  const anon = await call(`/api/levels/${id}`);
  assert.equal(anon.status, 200);
  assert.equal(anon.data.summary.mine, false);
  assert.ok(Array.isArray(anon.data.summary.preview));

  const updated = await call(`/api/levels/${id}`, {
    method: 'PUT',
    token,
    body: { title: 'Уровень 2', published: false },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.level.title, 'Уровень 2');

  const hidden = await call(`/api/levels/${id}`);
  assert.equal(hidden.status, 403, 'неопубликованный уровень скрыт от других');

  const mine = await call(`/api/levels/${id}`, { token });
  assert.equal(mine.status, 200, 'автор видит свой черновик');

  const like = await call(`/api/levels/${id}/like`, { method: 'POST', token });
  assert.equal(like.data.likes, 1);
  const unlike = await call(`/api/levels/${id}/like`, { method: 'POST', token });
  assert.equal(unlike.data.likes, 0);

  const score1 = await call(`/api/levels/${id}/score`, { method: 'POST', body: { score: 10, time: 500, name: 'Гость' } });
  assert.equal(score1.status, 200);
  await call(`/api/levels/${id}/score`, { method: 'POST', token, body: { score: 40, time: 400 } });
  const board = await call(`/api/levels/${id}/leaderboard`);
  assert.equal(board.data.leaderboard[0].score, 40);
  assert.equal(board.data.leaderboard.length, 2);

  const del = await call(`/api/levels/${id}`, { method: 'DELETE', token });
  assert.equal(del.status, 200);
  const gone = await call(`/api/levels/${id}`);
  assert.equal(gone.status, 404);
});

test('чужой уровень нельзя изменить', async () => {
  const a = await call('/api/auth/register', { method: 'POST', body: { name: 'Первый', password: '1234' } });
  const b = await call('/api/auth/register', { method: 'POST', body: { name: 'Второй', password: '1234' } });
  const created = await call('/api/levels', { method: 'POST', token: a.data.token, body: { title: 'x', data: validLevel() } });
  const id = created.data.level.id;
  const res = await call(`/api/levels/${id}`, { method: 'PUT', token: b.data.token, body: { title: 'взлом' } });
  assert.equal(res.status, 403);
});

test('валидация данных уровня', async () => {
  const reg = await call('/api/auth/register', { method: 'POST', body: { name: 'Валидатор', password: '1234' } });
  const token = reg.data.token;

  const noScreens = await call('/api/levels', { method: 'POST', token, body: { title: 'x', data: { screens: [] } } });
  assert.equal(noScreens.status, 400);

  const weird = await call('/api/levels', {
    method: 'POST',
    token,
    body: {
      title: 'x',
      data: {
        screens: [{ cells: Array(169).fill('<script>alert(1)</script>') }],
        rules: { coin: [{ trigger: 'hack', actions: [{ type: 'nope' }] }] },
      },
    },
  });
  assert.equal(weird.status, 201, 'мусорные клетки просто вырезаются');
  const cells = weird.data.level.data.screens[0].cells;
  assert.equal(cells.filter(Boolean).length, 0);
  assert.deepEqual(weird.data.level.data.rules, {});

  const unauth = await call('/api/levels', { method: 'POST', body: { title: 'x', data: validLevel() } });
  assert.equal(unauth.status, 401);
});

test('расширения: публикация, чтение исходника, лайки, валидация', async () => {
  const reg = await call('/api/auth/register', { method: 'POST', body: { name: 'Кодер', password: '1234' } });
  const token = reg.data.token;
  const source = "TBX.define({id:'demo',name:'Демо',blocks:[{id:'a',name:'A',color:'#fff'}]});";

  const created = await call('/api/extensions', {
    method: 'POST',
    token,
    body: { name: 'Демо-набор', version: '1.2.0', description: 'пример', source, blocks: [{ id: 'a', name: 'A', color: '#fff' }] },
  });
  assert.equal(created.status, 201);
  const id = created.data.extension.id;

  const full = await call(`/api/extensions/${id}`);
  assert.equal(full.data.extension.source, source);
  assert.equal(full.data.extension.blocks[0].id, 'a');

  const list = await call('/api/extensions');
  assert.ok(list.data.extensions.length >= 3);

  const like = await call(`/api/extensions/${id}/like`, { method: 'POST', token });
  assert.equal(like.data.likes, 1);

  const empty = await call('/api/extensions', { method: 'POST', token, body: { name: 'пусто', source: '   ' } });
  assert.equal(empty.status, 400);

  const huge = await call('/api/extensions', { method: 'POST', token, body: { name: 'huge', source: 'x'.repeat(101 * 1024) } });
  assert.equal(huge.status, 413);

  const anon = await call('/api/extensions', { method: 'POST', body: { name: 'anon', source } });
  assert.equal(anon.status, 401);

  const removed = await call(`/api/extensions/${id}`, { method: 'DELETE', token });
  assert.equal(removed.status, 200);
});

test('клиент отдаётся статикой и знает про SPA-маршруты', async () => {
  const index = await call('/');
  assert.equal(index.status, 200);
  assert.match(index.text, /TurboBloxels/);

  const deep = await call('/editor');
  assert.equal(deep.status, 200, 'SPA-fallback отдаёт index.html');

  const css = await fetch(`${base}/css/style.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);

  const spaIgnored = await call('/api/unknown-route');
  assert.equal(spaIgnored.status, 404);
  assert.ok(spaIgnored.data.error);
});
