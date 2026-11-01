import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistry } from '../public/js/registry.js';
import { buildWorld } from '../public/js/game/world.js';
import { Game } from '../public/js/game/engine.js';
import { makeLevel, mockCanvas, noInput } from './helpers.js';

const registry = buildRegistry([]);

function makeGame(extraCells = {}, { rules = {}, events = [] } = {}) {
  const cells = {};
  for (let x = 0; x < 13; x++) {
    cells[`${x},12`] = 'ground';
    cells[`${x},11`] = 'ground';
  }
  const level = makeLevel({ cells: { ...cells, ...extraCells }, rules });
  const world = buildWorld(level, registry);
  const game = new Game({ canvas: mockCanvas(), world, onEvent: (event) => events.push(event) });
  // Ставим персонажа вручную, чтобы не зависеть от автоспавна.
  game.player.x = 1.1;
  game.player.y = 11 - game.player.h;
  game.prevOverlap.clear();
  return { game, world, events };
}

function tick(game, frames = 1, input = noInput) {
  for (let i = 0; i < frames; i++) game.update(1 / 120, input);
}

test('монета даёт очко и исчезает (правило по умолчанию)', () => {
  const { game, world } = makeGame({ '1,10': 'coin' });
  assert.equal(world.idAt(1, 10), 'coin');
  tick(game, 2);
  assert.equal(game.score, 1);
  assert.equal(world.idAt(1, 10), null, 'блок убран правилом remove');
});

test('правило уровня переопределяет награду монеты', () => {
  const { game } = makeGame(
    { '1,10': 'coin' },
    { rules: { coin: [{ trigger: 'enter', conditions: [], actions: [{ type: 'score', value: 9 }, { type: 'remove' }] }] } }
  );
  tick(game, 2);
  assert.equal(game.score, 9);
});

test('кристалл даёт 5 очков', () => {
  const { game } = makeGame({ '1,10': 'gem' });
  tick(game, 2);
  assert.equal(game.score, 5);
});

test('шипы отнимают сердце и дают неуязвимость', () => {
  const { game } = makeGame({ '1,10': 'spike' });
  const hearts = game.player.hearts;
  tick(game, 2);
  assert.equal(game.player.hearts, hearts - 1);
  assert.ok(game.player.invuln > 0);
  // Пока неуязвимость активна, второй урон не проходит.
  game.player.invuln = 1;
  game.player.hearts = hearts;
  tick(game, 2);
  assert.equal(game.player.hearts, hearts);
});

test('финиш завершает уровень событием win', () => {
  const events = [];
  const { game } = makeGame({ '1,10': 'goal' }, { events });
  tick(game, 2);
  assert.equal(game.state, 'won');
  const win = events.find((e) => e.type === 'win');
  assert.ok(win, 'событие win отправлено');
  assert.equal(typeof win.score, 'number');
});

test('правило с условием once срабатывает один раз', () => {
  const { game } = makeGame(
    { '1,10': 'crate' },
    {
      rules: {
        crate: [
          {
            trigger: 'touch',
            conditions: [{ type: 'once' }],
            actions: [{ type: 'score', value: 7 }],
          },
        ],
      },
    }
  );
  tick(game, 400);
  assert.equal(game.score, 7);
});

test('батут подбрасывает персонажа при приземлении', () => {
  const { game } = makeGame({ '1,11': 'bounce' });
  game.player.x = 1.1;
  game.player.y = 8;
  game.player.vy = 10;
  let maxUp = 0;
  for (let i = 0; i < 240; i++) {
    game.update(1 / 120, noInput);
    maxUp = Math.min(maxUp, game.player.vy);
  }
  assert.ok(maxUp < -10, `персонаж подброшен вверх, минимальная vy=${maxUp}`);
});

test('ящик разбивается при прыжке сверху', () => {
  const { game, world } = makeGame({ '1,11': 'crate' });
  game.player.x = 1.05;
  game.player.y = 8;
  game.player.vy = 5;
  for (let i = 0; i < 180; i++) game.update(1 / 120, noInput);
  assert.equal(world.idAt(1, 11), null, 'ящик исчез');
});

test('падение в пропасть отнимает сердце и возвращает на спавн', () => {
  const { game, world } = makeGame();
  game.player.invuln = 0;
  game.player.y = world.height + 2;
  const hearts = game.player.hearts;
  tick(game, 1);
  assert.equal(game.player.hearts, hearts - 1);
  assert.ok(game.player.y < world.height, 'персонаж вернулся в мир');
});

test('блок расширения без расширения не ломает уровень', () => {
  const { world } = makeGame({ '1,10': 'ext:missing-pack:ice' });
  const def = world.defAt(1, 10);
  assert.equal(def.missing, true);
  assert.equal(def.solid, false);
  assert.equal(world.isSolid(1, 10), false);
});

test('враг погибает от прыжка сверху и даёт очки', () => {
  const { game, world } = makeGame({ '1,10': 'enemy' });
  assert.equal(world.enemies.length, 1);
  const enemy = world.enemies[0];
  game.player.x = enemy.x;
  game.player.y = enemy.y - 1.0;
  game.player.vy = 8;
  for (let i = 0; i < 60; i++) game.update(1 / 120, noInput);
  assert.equal(enemy.alive, false);
  assert.ok(game.score >= 3);
});

test('события HUD приходят с сердцами и очками', () => {
  const events = [];
  const { game } = makeGame({ '1,10': 'coin' }, { events });
  tick(game, 2);
  const hud = events.filter((e) => e.type === 'hud');
  assert.ok(hud.length > 0);
  assert.equal(hud[hud.length - 1].score, 1);
  assert.ok(hud[hud.length - 1].maxHearts >= 3);
});

test('блок расширения шлёт события в песочницу', () => {
  const sent = [];
  const manifest = {
    id: 'pack',
    name: 'Пак',
    version: '1.0.0',
    blocks: [{ id: 'jelly', name: 'Желе', name2: '', color: '#ff8fd0', solid: true, hooks: ['enter'], rules: [] }],
    hooks: [],
    actions: [],
  };
  const registryWithExt = buildRegistry([manifest]);
  const cells = {};
  for (let x = 0; x < 13; x++) {
    cells[`${x},11`] = 'ground';
    cells[`${x},12`] = 'ground';
  }
  cells['1,10'] = 'ext:pack:jelly';
  const world = buildWorld(makeLevel({ cells }), registryWithExt);
  const game = new Game({ canvas: mockCanvas(), world, onEvent: () => {} });
  game.player.x = 1.1;
  game.player.y = 11 - game.player.h;
  const runtime = { event: (name, payload) => sent.push({ name, payload }) };
  const host = {
    items: new Map([['pack', { runtime }]]),
    get: (id) => (id === 'pack' ? { runtime } : null),
    broadcast: (name, payload) => sent.push({ name, payload }),
    dispose() {},
  };
  game.attachExtensions(host);
  for (let i = 0; i < 3; i++) game.update(1 / 120, noInput);
  const hook = sent.find((item) => item.name === 'block');
  assert.ok(hook, 'событие блока отправлено');
  assert.equal(hook.payload.block, 'jelly');
  assert.equal(hook.payload.event, 'enter');
  assert.equal(hook.payload.x, 1);
});

test('команды расширения применяются к игре', () => {
  const { game, world } = makeGame();
  game.handleCommands(
    [
      { name: 'score', payload: { value: 5 } },
      { name: 'heal', payload: { value: 2 } },
      { name: 'setBlock', payload: { x: 5, y: 10, id: 'coin' } },
      { name: 'message', payload: { text: 'привет' } },
    ],
    { extId: 'pack' }
  );
  assert.equal(game.score, 5);
  assert.equal(game.player.hearts, game.player.maxHearts);
  assert.equal(world.idAt(5, 10), 'coin');
  assert.equal(game.state, 'playing');
});
