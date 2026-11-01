import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRules, describeRule, checkConditions, rulesForBlock, makeRule } from '../public/js/rules.js';
import { BLOCK_MAP, defaultRulesFor } from '../public/js/blocks.js';

test('normalizeRules выкидывает мусор и чистит значения', () => {
  const rules = normalizeRules({
    coin: [
      { trigger: 'enter', conditions: [], actions: [{ type: 'score', value: 5 }, { type: 'unknown' }] },
      { trigger: 'nope', actions: [{ type: 'score', value: 1 }] },
      { trigger: 'tick', every: '0.5', actions: [{ type: 'message', value: 'x'.repeat(500) }] },
    ],
    'bad id!': [{ trigger: 'enter', actions: [{ type: 'score', value: 1 }] }],
    'ext:pack:ice': [{ trigger: 'touch', actions: [{ type: 'damage', value: 99 }] }],
  });
  assert.equal(rules.coin.length, 2);
  assert.deepEqual(rules.coin[0].actions, [{ type: 'score', value: 5 }]);
  assert.equal(rules.coin[1].every, 0.5);
  assert.ok(rules.coin[1].actions[0].value.length <= 120);
  assert.equal(rules['bad id!'], undefined);
  assert.equal(rules['ext:pack:ice'][0].actions[0].value, 9, 'урон ограничен 9');
});

test('normalizeRules сохраняет setBlock и выкидывает битые ссылки', () => {
  const rules = normalizeRules({
    ice: [
      { trigger: 'stomp', actions: [{ type: 'setBlock', value: 'ground' }, { type: 'setBlock', value: '' }] },
    ],
  });
  assert.deepEqual(rules.ice[0].actions, [{ type: 'setBlock', value: 'ground' }]);
});

test('checkConditions проверяет способности, очки и шанс', () => {
  const ctx = { score: 5, hearts: 2, powers: ['jump', 'dash'] };
  assert.equal(checkConditions([], ctx), true);
  assert.equal(checkConditions([{ type: 'power', value: 'jump' }], ctx), true);
  assert.equal(checkConditions([{ type: 'power', value: 'swim' }], ctx), false);
  assert.equal(checkConditions([{ type: 'scoreAtLeast', value: 5 }], ctx), true);
  assert.equal(checkConditions([{ type: 'scoreAtLeast', value: 6 }], ctx), false);
  assert.equal(checkConditions([{ type: 'chance', value: 100 }], ctx, () => 0), true);
  assert.equal(checkConditions([{ type: 'chance', value: 10 }], ctx, () => 0.5), false);
  assert.equal(checkConditions([{ type: 'heartsBelow', value: 3 }], ctx), true);
});

test('описания правил читаемы', () => {
  const info = describeRule(
    {
      trigger: 'enter',
      conditions: [{ type: 'once' }],
      actions: [
        { type: 'score', value: 5 },
        { type: 'sound', value: 'gem' },
      ],
    },
    'Кристалл'
  );
  assert.match(info.text, /КОГДА персонаж входит в блок/);
  assert.match(info.text, /только один раз/);
  assert.match(info.text, /\+5 очк/);
});

test('правила уровня перекрывают правила блока по умолчанию', () => {
  const coin = BLOCK_MAP.coin;
  const defaultRules = rulesForBlock(coin, {});
  assert.equal(defaultRules.length, 1);
  const custom = [{ trigger: 'enter', actions: [{ type: 'score', value: 100 }] }];
  const overridden = rulesForBlock(coin, { coin: custom });
  assert.deepEqual(overridden, custom);
});

test('у встроенных блоков есть осмысленные правила', () => {
  const coinRules = defaultRulesFor('coin');
  const actions = coinRules[0].actions.map((a) => a.type);
  assert.ok(actions.includes('score'));
  assert.ok(actions.includes('remove'));

  const spikeRules = defaultRulesFor('spike');
  assert.equal(spikeRules[0].trigger, 'touch');
  assert.deepEqual(spikeRules[0].actions[0], { type: 'damage', value: 1 });

  assert.equal(defaultRulesFor('ground').length, 0);
  assert.ok(makeRule('enter').actions.length > 0);
});
