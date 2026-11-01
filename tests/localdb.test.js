/**
 * Локальный режим (GitHub Pages без сервера): REST-контракт поверх localStorage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

const { localRequest, resetLocalDb } = await import('../public/js/localdb.js');

const level = (extra = {}) => ({
  screens: [{ cells: Array.from({ length: 169 }, (_, i) => (i > 150 ? 'ground' : i === 20 ? 'coin' : null)) }],
  character: { pixels: new Array(169).fill(null) },
  background: { pixels: new Array(169).fill(null) },
  rules: {},
  settings: {},
  ...extra,
});

const call = (method, path, body) => localRequest(method, path, body);

test('пустая база заполняется демо-уровнем и примерами', () => {
  resetLocalDb();
  const levels = call('GET', '/levels');
  assert.equal(levels.levels.length, 1);
  assert.equal(levels.levels[0].title, 'Первый прыжок');
  assert.ok(levels.levels[0].preview.length >= 169);
  const exts = call('GET', '/extensions');
  assert.equal(exts.extensions.length, 2);
  assert.ok(exts.extensions[0].blocks.length > 0);
  const stats = call('GET', '/stats');
  assert.equal(stats.local, true);
  assert.equal(stats.levels, 1);
});

test('локальный аккаунт: регистрация, me, выход', () => {
  resetLocalDb();
  assert.equal(call('GET', '/auth/me').user, null);
  const reg = call('POST', '/auth/register', { name: 'Мастер', password: '1234' });
  assert.equal(reg.user.name, 'Мастер');
  assert.equal(call('GET', '/auth/me').user.name, 'Мастер');
  assert.throws(() => call('POST', '/auth/register', { name: 'Мастер', password: '1234' }), /занято/);
  assert.throws(() => call('POST', '/auth/register', { name: 'X', password: '1234' }), /Имя/);
  call('POST', '/auth/logout');
  assert.equal(call('GET', '/auth/me').user, null);
});

test('уровни: создание, чтение, правка, лайк и результаты', () => {
  resetLocalDb();
  assert.throws(() => call('POST', '/levels', { title: 'x', data: level() }), /войти/);
  call('POST', '/auth/register', { name: 'Автор', password: '1234' });

  const created = call('POST', '/levels', { title: 'Мой', data: level(), published: true });
  assert.equal(created.level.title, 'Мой');
  assert.equal(created.summary.mine, true);
  const id = created.level.id;

  const listed = call('GET', '/levels');
  assert.equal(listed.levels.length, 2);
  assert.equal(listed.levels.find((l) => l.id === id).title, 'Мой');

  const one = call('GET', `/levels/${id}`);
  assert.equal(one.level.data.screens[0].cells.length, 169);

  const updated = call('PUT', `/levels/${id}`, { title: 'Новый', published: false });
  assert.equal(updated.level.title, 'Новый');

  const like = call('POST', `/levels/${id}/like`);
  assert.equal(like.likes, 1);
  assert.equal(call('POST', `/levels/${id}/like`).likes, 0);

  call('POST', `/levels/${id}/play`);
  call('POST', `/levels/${id}/play`);
  assert.equal(call('GET', `/levels/${id}`).level.plays, 2);

  call('POST', `/levels/${id}/score`, { score: 12, time: 300 });
  const board = call('GET', `/levels/${id}/leaderboard`);
  assert.equal(board.leaderboard[0].score, 12);
  assert.equal(board.leaderboard[0].name, 'Автор');

  assert.equal(call('DELETE', `/levels/${id}`).ok, true);
  assert.throws(() => call('GET', `/levels/${id}`), /не найден/);
});

test('валидация и права в локальном режиме', () => {
  resetLocalDb();
  call('POST', '/auth/register', { name: 'Первый', password: '1234' });
  assert.throws(() => call('POST', '/levels', { title: 'x', data: { screens: [] } }), /экран/);
  const created = call('POST', '/levels', { title: 'ok', data: level() });

  call('POST', '/auth/logout');
  call('POST', '/auth/register', { name: 'Второй', password: '1234' });
  assert.throws(() => call('PUT', `/levels/${created.level.id}`, { title: 'взлом' }), /не твой/);
  assert.throws(() => call('DELETE', `/levels/${created.level.id}`), /не твой/);
  assert.throws(() => call('GET', `/levels/${created.level.id}`), /не опубликован/);
});

test('расширения: публикация, исходник, лайки, удаление', () => {
  resetLocalDb();
  call('POST', '/auth/register', { name: 'Кодер', password: '1234' });
  const source = "TBX.define({id:'demo',name:'Демо',blocks:[{id:'a',name:'A'}]});";
  const created = call('POST', '/extensions', {
    name: 'Демо-набор',
    version: '1.1.0',
    source,
    blocks: [{ id: 'a', name: 'A', color: '#fff' }],
  });
  const id = created.extension.id;
  assert.equal(created.extension.mine, true);

  const full = call('GET', `/extensions/${id}`);
  assert.equal(full.extension.source, source);
  assert.equal(call('GET', '/extensions').extensions.length, 3);

  assert.equal(call('POST', `/extensions/${id}/like`).likes, 1);
  assert.throws(() => call('POST', '/extensions', { name: 'пусто', source: '  ' }), /Пустой/);
  assert.throws(() => call('POST', '/extensions', { name: 'huge', source: 'x'.repeat(101 * 1024) }), /100 КБ/);
  assert.equal(call('DELETE', `/extensions/${id}`).ok, true);
  assert.equal(call('GET', '/extensions').extensions.length, 2);
});

test('неизвестные маршруты дают 404', () => {
  resetLocalDb();
  assert.throws(() => call('GET', '/nope'), /Неизвестный/);
  assert.throws(() => call('GET', '/levels/xxx/unknown'), /Неизвестный/);
});
