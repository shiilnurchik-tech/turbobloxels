/**
 * Книга правил TurboBloxels.
 *
 * Блок на доске — это не просто картинка: у него есть набор ПРАВИЛ.
 * Правило = «КОГДА <событие> [И <условие>] ТО <действия>».
 * Файл не зависит от DOM и браузера: используется и клиентом, и сервером
 * (для валидации), и тестами.
 */

export const TRIGGERS = [
  { id: 'enter', label: 'персонаж входит в блок', hint: 'срабатывает один раз при входе в клетку', value: 'none' },
  { id: 'touch', label: 'персонаж касается блока', hint: 'повторяется не чаще 2 раз в секунду', value: 'none' },
  { id: 'stand', label: 'персонаж стоит на блоке', hint: 'каждый кадр, пока стоит сверху', value: 'none' },
  { id: 'stomp', label: 'персонаж приземляется на блок', hint: 'удар сверху', value: 'none' },
  { id: 'hit', label: 'персонаж бьётся об блок снизу', hint: 'прыжок головой', value: 'none' },
  { id: 'tick', label: 'каждые N секунд', hint: 'тикающее правило', value: 'number', def: 1, min: 0.2, max: 60 },
  { id: 'use', label: 'нажата кнопка E рядом с блоком', hint: 'действие по кнопке', value: 'none' },
  { id: 'start', label: 'в начале уровня', hint: 'один раз при старте', value: 'none' },
];

export const CONDITIONS = [
  { id: 'once', label: 'только один раз за прохождение', value: 'none' },
  { id: 'power', label: 'у персонажа есть способность', value: 'power' },
  { id: 'scoreAtLeast', label: 'очков не меньше', value: 'number', def: 10, min: 0, max: 999999 },
  { id: 'heartsAtLeast', label: 'сердец не меньше', value: 'number', def: 2, min: 1, max: 9 },
  { id: 'heartsBelow', label: 'сердец меньше', value: 'number', def: 2, min: 1, max: 9 },
  { id: 'chance', label: 'с вероятностью, %', value: 'number', def: 50, min: 1, max: 100 },
];

export const ACTIONS = [
  { id: 'score', label: 'начислить очки', value: 'number', def: 1, min: -9999, max: 9999 },
  { id: 'damage', label: 'отнять сердца', value: 'number', def: 1, min: 1, max: 9 },
  { id: 'heal', label: 'добавить сердца', value: 'number', def: 1, min: 1, max: 9 },
  { id: 'bounce', label: 'подбросить персонажа', value: 'number', def: 15, min: 1, max: 40 },
  { id: 'speed', label: 'ускорение на секунды', value: 'number', def: 4, min: 0.5, max: 30 },
  { id: 'invincible', label: 'неуязвимость на секунды', value: 'number', def: 3, min: 0.5, max: 30 },
  { id: 'remove', label: 'убрать блок', value: 'none' },
  { id: 'setBlock', label: 'превратить в блок', value: 'block' },
  { id: 'message', label: 'показать сообщение', value: 'text', def: 'Привет!' },
  { id: 'sound', label: 'проиграть звук', value: 'select', def: 'coin', options: ['coin', 'gem', 'jump', 'hit', 'bounce', 'win', 'lose', 'step', 'zap'] },
  { id: 'particles', label: 'выпустить частицы', value: 'color', def: '#ffd166' },
  { id: 'teleport', label: 'телепортировать к блоку', value: 'block' },
  { id: 'spawnEnemy', label: 'выпустить врага', value: 'none' },
  { id: 'win', label: 'победа: уровень пройден', value: 'none' },
  { id: 'lose', label: 'поражение', value: 'none' },
  { id: 'ext', label: 'действие расширения', value: 'extAction' },
];

export const TRIGGER_MAP = Object.fromEntries(TRIGGERS.map((t) => [t.id, t]));
export const ACTION_MAP = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));
export const CONDITION_MAP = Object.fromEntries(CONDITIONS.map((c) => [c.id, c]));

export const MAX_RULES_PER_BLOCK = 12;
export const MAX_ACTIONS_PER_RULE = 8;
export const MAX_CONDITIONS_PER_RULE = 6;

const ID_RE = /^[a-z0-9_:\-.]{1,64}$/i;

export function makeRule(trigger = 'enter') {
  return { trigger, conditions: [], actions: [{ type: 'score', value: 1 }], enabled: true };
}

function normalizeValue(def, raw) {
  if (!def) return undefined;
  switch (def.value) {
    case 'none':
      return undefined;
    case 'number': {
      const n = Number(raw);
      const def0 = def.def ?? 1;
      const value = Number.isFinite(n) ? n : def0;
      const min = def.min ?? -1e6;
      const max = def.max ?? 1e6;
      return Math.min(max, Math.max(min, Math.round(value * 100) / 100));
    }
    case 'power':
      return typeof raw === 'string' && raw.length <= 24 ? raw : 'jump';
    case 'text':
      return String(raw ?? def.def ?? '').slice(0, 120);
    case 'color':
      return /^#[0-9a-f]{3,8}$/i.test(String(raw)) ? String(raw) : def.def;
    case 'select':
      return (def.options || []).includes(raw) ? raw : def.def;
    case 'block':
      return typeof raw === 'string' && ID_RE.test(raw) ? raw : null;
    case 'extAction':
      return typeof raw === 'string' && ID_RE.test(raw) ? raw : null;
    default:
      return raw;
  }
}

/** Приводит произвольный объект правил к безопасной схеме. */
export function normalizeRules(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const entries = Object.entries(raw).slice(0, 120);
  for (const [blockId, list] of entries) {
    if (!ID_RE.test(blockId) || !Array.isArray(list)) continue;
    const rules = [];
    for (const rule of list.slice(0, MAX_RULES_PER_BLOCK)) {
      const trigger = TRIGGER_MAP[rule?.trigger?.id || rule?.trigger];
      if (!trigger) continue;
      const conditions = [];
      for (const cond of (Array.isArray(rule.conditions) ? rule.conditions : []).slice(0, MAX_CONDITIONS_PER_RULE)) {
        const def = CONDITION_MAP[cond?.type || cond?.id];
        if (!def) continue;
        const value = normalizeValue(def, cond.value);
        conditions.push(value === undefined ? { type: def.id } : { type: def.id, value });
      }
      const actions = [];
      for (const act of (Array.isArray(rule.actions) ? rule.actions : []).slice(0, MAX_ACTIONS_PER_RULE)) {
        const def = ACTION_MAP[act?.type || act?.id];
        if (!def) continue;
        const value = normalizeValue(def, act.value);
        if ((def.id === 'setBlock' || def.id === 'teleport') && !value) continue;
        if (def.id === 'ext' && !value) continue;
        actions.push(value === undefined ? { type: def.id } : { type: def.id, value });
      }
      if (!actions.length) continue;
      const normalized = { trigger: trigger.id, conditions, actions };
      if (trigger.value === 'number') normalized.every = normalizeValue(trigger, rule.every);
      if (rule.enabled === false) normalized.enabled = false;
      rules.push(normalized);
    }
    if (rules.length) out[blockId] = rules;
  }
  return out;
}

/** Проверка условий правила. rnd — функция [0,1) для тестов. */
export function checkConditions(conditions, ctx, rnd = Math.random) {
  for (const cond of conditions || []) {
    switch (cond.type) {
      case 'once':
        if (ctx.firedOnce) return false;
        break;
      case 'power':
        if (!ctx.powers || !ctx.powers.includes(cond.value)) return false;
        break;
      case 'scoreAtLeast':
        if (!(ctx.score >= cond.value)) return false;
        break;
      case 'heartsAtLeast':
        if (!(ctx.hearts >= cond.value)) return false;
        break;
      case 'heartsBelow':
        if (!(ctx.hearts < cond.value)) return false;
        break;
      case 'chance':
        if (rnd() * 100 >= cond.value) return false;
        break;
      default:
        break;
    }
  }
  return true;
}

const POWER_LABELS = {
  jump: 'высокий прыжок',
  double: 'двойной прыжок',
  swim: 'плавание',
  dash: 'рывок',
  speed: 'скорость',
  heart: 'доп. сердце',
};

function valueLabel(def, action) {
  if (!def) return '';
  switch (def.value) {
    case 'none':
      return '';
    case 'number':
      return String(action.value ?? def.def ?? '');
    case 'power':
      return POWER_LABELS[action.value] || action.value || '';
    case 'text':
      return `«${action.value || def.def || ''}»`;
    case 'select':
      return action.value || def.def || '';
    case 'color':
      return action.value || def.def || '';
    case 'block':
      return action.value || '?';
    case 'extAction':
      return action.value || '?';
    default:
      return String(action.value ?? '');
  }
}

/** Человекочитаемое описание правила для книги правил. */
export function describeRule(rule, blockName = 'блок') {
  const trigger = TRIGGER_MAP[rule.trigger];
  let when = trigger ? trigger.label : String(rule.trigger);
  if (trigger?.id === 'tick') when = `каждые ${rule.every ?? trigger.def} с`;

  const conds = (rule.conditions || [])
    .map((c) => {
      const def = CONDITION_MAP[c.type];
      if (!def) return null;
      if (def.value === 'none') return def.label;
      return `${def.label} ${valueLabel(def, c)}`.replace('сердец не меньше ', 'сердец ≥ ').replace('сердец меньше ', 'сердец < ').replace('очков не меньше ', 'очков ≥ ').replace('с вероятностью, % ', 'шанс ');
    })
    .filter(Boolean);

  const acts = (rule.actions || []).map((a) => {
    const def = ACTION_MAP[a.type];
    if (!def) return null;
    const v = valueLabel(def, a);
    if (a.type === 'score') return `${Number(a.value) >= 0 ? '+' : ''}${a.value} очк.`;
    if (a.type === 'damage') return `−${a.value} ♥`;
    if (a.type === 'heal') return `+${a.value} ♥`;
    if (a.type === 'setBlock') return `стать «${a.value}»`;
    if (a.type === 'teleport') return `телепорт к «${a.value}»`;
    if (a.type === 'ext') return `расширение: ${a.value}`;
    return v ? `${def.label} ${v}` : def.label;
  }).filter(Boolean);

  return {
    block: blockName,
    when: `когда ${when}`,
    conds,
    actions: acts,
    text: `КОГДА ${when}${conds.length ? ` И ${conds.join(' И ')}` : ''} → ${acts.join(', ') || '—'}`,
  };
}

/** Полный набор правил блока: правила уровня перекрывают правила по умолчанию. */
export function rulesForBlock(blockDef, levelRules) {
  const custom = levelRules?.[blockDef.id];
  const base = blockDef.rules || [];
  const list = Array.isArray(custom) ? custom : base;
  return (list || []).filter((r) => r && r.enabled !== false);
}
