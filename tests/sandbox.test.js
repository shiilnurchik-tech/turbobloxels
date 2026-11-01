/**
 * Песочница расширений: исполняем её код в vm-контексте с поддельным window
 * и проверяем протокол postMessage снаружи.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '../public/sandbox.html'), 'utf8');

function bootSandbox() {
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, 'в sandbox.html есть скрипт');
  const posted = [];
  const listeners = [];
  const parent = { postMessage: (message) => posted.push(message) };
  const fakeWindow = {
    parent,
    addEventListener: (type, fn) => listeners.push(fn),
  };
  const context = vm.createContext({
    window: fakeWindow,
    setTimeout,
    clearTimeout,
    console,
  });
  vm.runInContext(script[1], context);
  return {
    posted,
    send(data) {
      for (const listener of listeners) listener({ source: parent, data: { tbx: 1, type: 'event', ...data } });
    },
    last(type) {
      return [...posted].reverse().find((message) => message.type === type);
    },
  };
}

const EXT = `TBX.define({
  id: 'my-pack',
  name: 'Мой набор',
  version: '1.2.3',
  description: 'тест',
  blocks: [
    {
      id: 'jelly',
      name: 'Желе',
      color: '#ff8fd0',
      solid: true,
      friction: 0.4,
      damage: 2,
      pattern: ['.............', '....+++......'],
      rules: [{ trigger: 'stomp', actions: [{ type: 'bounce', value: 18 }] }],
      on: {
        enter(ctx) { TBX.log('вошёл', ctx.x, ctx.y); },
        tick(ctx) { TBX.particles(ctx.x, ctx.y, '#fff', 2); },
      },
    },
  ],
  hooks: {
    onStart(ctx) { TBX.message('старт ' + ctx.hearts); },
    onTick() { TBX.addScore(1); },
  },
});`;

test('песочница объявляет себя и возвращает манифест', () => {
  const box = bootSandbox();
  assert.equal(box.last('ready')?.type, 'ready');
  box.send({ type: 'load', source: EXT });
  const loaded = box.last('loaded');
  assert.ok(loaded, 'пришёл манифест');
  assert.equal(loaded.manifest.id, 'my-pack');
  assert.equal(loaded.manifest.version, '1.2.3');
  assert.equal(loaded.manifest.blocks.length, 1);
  const block = loaded.manifest.blocks[0];
  assert.equal(block.id, 'jelly');
  assert.equal(block.color, '#ff8fd0');
  assert.equal(block.friction, 0.4);
  assert.equal(block.pattern.length, 2);
  assert.ok(block.hooks.includes('enter') && block.hooks.includes('tick'));
  assert.equal(loaded.manifest.hooks.slice().sort().join(','), 'start,tick');
  // damage превращается в правило «касание → урон»
  const damageRule = block.rules.find((rule) => rule.trigger === 'touch');
  assert.equal(damageRule.actions[0].value, 2);
});

test('события вызывают коллбеки и команды уходят пакетом', async () => {
  const box = bootSandbox();
  box.send({ type: 'load', source: EXT });
  box.send({ name: 'game', ctx: { event: 'start', hearts: 3 } });
  box.send({ name: 'block', ctx: { block: 'jelly', event: 'enter', x: 2, y: 5 } });
  box.send({ name: 'game', ctx: { event: 'tick' } });
  await new Promise((resolve) => setTimeout(resolve, 10));

  const commands = box.posted.filter((message) => message.type === 'commands').flatMap((message) => message.commands);
  const names = commands.map((command) => command.name);
  assert.ok(names.includes('message'), 'старт отправляет сообщение');
  assert.ok(names.includes('score'), 'тик добавляет очки');
  const log = box.posted.find((message) => message.type === 'log');
  assert.match(log.text, /вошёл 2 5/);
});

test('обработчики в правилах расширения работают через event/action', async () => {
  const box = bootSandbox();
  box.send({
    type: 'load',
    source: `TBX.action({ id: 'boom', name: 'взрыв', value: 'number', run(ctx, value) { TBX.damage(value); } });
TBX.define({ id: 'pack', name: 'P', blocks: [{ id: 'a', name: 'A', color: '#fff' }] });`,
  });
  box.send({ name: 'action', ctx: { action: 'boom', args: 2, ctx: { x: 1, y: 1 } } });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const commands = box.posted.filter((message) => message.type === 'commands').flatMap((message) => message.commands);
  assert.equal(commands.find((command) => command.name === 'damage').payload.value, 2);
  const actions = box.posted.filter((message) => message.type === 'actions').pop();
  assert.equal(actions.actions[0].id, 'boom');
});

test('ошибки в коде расширения не ломают хост', () => {
  const box = bootSandbox();
  box.send({ type: 'load', source: 'TBX.define({ id: "плохой id", blocks: [] })' });
  const error = box.last('error');
  assert.ok(error, 'ошибка вернулась');
  assert.match(error.message, /id расширения/);

  const box2 = bootSandbox();
  box2.send({ type: 'load', source: 'this is not javascript' });
  assert.ok(box2.last('error'));
  assert.match(box2.last('error').message, /SyntaxError|Unexpected/i);
});

test('расширение без TB\.define сообщает об ошибке', () => {
  const box = bootSandbox();
  box.send({ type: 'load', source: 'var x = 1;' });
  assert.match(box.last('error').message, /не вызвало TBX\.define/);
});

test('чужие сообщения игнорируются', () => {
  const box = bootSandbox();
  const before = box.posted.length;
  box.send({ type: 'load', source: EXT, tbx: 0 });
  assert.equal(box.posted.length, before, 'без метки tbx сообщение игнорируется');
});
