import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistry } from '../public/js/registry.js';
import { buildWorld } from '../public/js/game/world.js';
import { stepPlayer, stepEnemy, makePlayer, PHYS, tilesUnder } from '../public/js/game/physics.js';
import { makeLevel, noInput } from './helpers.js';

const registry = buildRegistry([]);

function world(extra = {}) {
  const cells = {};
  for (let x = 0; x < 13; x++) {
    cells[`${x},12`] = 'ground';
    cells[`${x},11`] = 'ground';
  }
  return buildWorld(makeLevel({ cells: { ...cells, ...extra }, pixels: null }), registry);
}

function run(game, player, worldRef, frames, input = noInput) {
  for (let i = 0; i < frames; i++) stepPlayer(player, worldRef, input, 1 / 120);
}

test('персонаж падает и приземляется на землю', () => {
  const w = world();
  const player = makePlayer({ x: 1, y: 0 }, w);
  assert.equal(player.onGround, false);
  run(null, player, w, 240);
  assert.ok(player.onGround, 'должен стоять на земле');
  assert.ok(Math.abs(player.y + player.h - 11) < 0.06, `низ персонажа на линии земли, получили ${player.y + player.h}`);
  assert.equal(player.vy, 0);
  const tiles = tilesUnder(player, w);
  assert.equal(tiles[0].def.id, 'ground');
});

test('прыжок поднимает персонажа и уважает силу прыжка', () => {
  const w = world();
  const player = makePlayer({ x: 1, y: 0 }, w);
  run(null, player, w, 240);
  const startY = player.y;
  const jumpInput = { ...noInput, jump: true, jumpPressed: true };
  stepPlayer(player, w, jumpInput, 1 / 120);
  assert.ok(player.vy < -10, 'вертикальная скорость вверх');
  for (let i = 0; i < 60; i++) stepPlayer(player, w, { ...noInput, jump: true }, 1 / 120);
  assert.ok(player.y < startY - 2, 'персонаж должен подняться больше двух клеток');
});

test('широкий прыжок: переменная высота прыжка работает', () => {
  const w = world();
  const shortJumper = makePlayer({ x: 1, y: 0 }, w);
  const longJumper = makePlayer({ x: 5, y: 0 }, w);
  run(null, shortJumper, w, 240);
  run(null, longJumper, w, 240);

  let s = shortJumper;
  let l = longJumper;
  const base = s.y;
  for (let i = 0; i < 40; i++) {
    stepPlayer(s, w, { ...noInput, jump: i === 0, jumpPressed: i === 0 }, 1 / 120);
    stepPlayer(l, w, { ...noInput, jump: true, jumpPressed: i === 0 }, 1 / 120);
  }
  assert.ok(l.y < s.y - 0.5, 'удержание прыжка поднимает выше');
  void base;
});

test('стена останавливает движение', () => {
  const cells = { '4,10': 'stone', '4,11': 'stone', '4,9': 'stone' };
  const w = world(cells);
  const player = makePlayer({ x: 1, y: 10.9 }, w);
  player.y = 10.9;
  for (let i = 0; i < 240; i++) stepPlayer(player, w, { ...noInput, right: true }, 1 / 120);
  assert.ok(player.x + player.w <= 4.001, `персонаж не проходит стену, x=${player.x}`);
  assert.ok(player.x > 3, 'но и доходит до неё');
});

test('вода замедляет падение', () => {
  const cells = {};
  for (let x = 0; x < 13; x++) {
    for (let y = 6; y < 11; y++) cells[`${x},${y}`] = 'water';
  }
  const w = world(cells);
  const player = makePlayer({ x: 6, y: 5 }, w);
  run(null, player, w, 90);
  assert.ok(player.vy <= PHYS.waterMaxFall + 0.01, `скорость падения в воде ограничена, vy=${player.vy}`);
});

test('шипы по умолчанию описаны правилом «касание → урон»', () => {
  const w = world({ '6,10': 'spike' });
  assert.equal(w.idAt(6, 10), 'spike');
  assert.equal(w.isSolid(6, 10), true);
});

test('враг разворачивается у края платформы', () => {
  const cells = {};
  for (let x = 0; x < 5; x++) cells[`${x},12`] = 'ground';
  const w = buildWorld(makeLevel({ cells }), registry);
  const enemy = { x: 0.5, y: 10.9, w: 0.8, h: 0.8, vx: -2, vy: 0, alive: true, onGround: false, anim: 0 };
  for (let i = 0; i < 120; i++) stepEnemy(enemy, w, 1 / 120);
  assert.ok(enemy.x >= 0, 'враг не улетел за левый край');
  assert.ok(enemy.x < 5, 'враг остался на платформе');
});

test('автоспавн ищет свободную клетку над землёй', () => {
  const w = world({ '0,10': 'stone', '1,10': 'stone', '2,10': 'stone' });
  const spawn = w.spawn;
  assert.ok(spawn, 'спавн найден');
  assert.equal(w.idAt(Math.floor(spawn.x), spawn.y), null, 'клетка спавна свободна');
  assert.equal(w.isSolid(Math.floor(spawn.x), spawn.y + 1), true, 'под спавном есть опора');
});
