/**
 * Встроенные блоки, палитры и способности персонажа.
 * Файл без DOM-зависимостей: им пользуются и редактор, и движок, и тесты.
 */

export const GRID = 13;
export const CELL = 32; // пикселей на клетку в игре

/** 13 цветов «карандашей» для персонажа и фона. */
export const CHAR_COLORS = [
  { id: 'green', hex: '#3ddc84', name: 'Зелёный', power: 'jump' },
  { id: 'lime', hex: '#a8f05a', name: 'Лаймовый' },
  { id: 'yellow', hex: '#ffd93d', name: 'Жёлтый', power: 'double' },
  { id: 'orange', hex: '#ff9f43', name: 'Оранжевый' },
  { id: 'red', hex: '#ff5d73', name: 'Красный', power: 'dash' },
  { id: 'pink', hex: '#ff8fd0', name: 'Розовый', power: 'heart' },
  { id: 'purple', hex: '#b07cff', name: 'Фиолетовый', power: 'speed' },
  { id: 'blue', hex: '#4c9aff', name: 'Синий' },
  { id: 'cyan', hex: '#4ce0e0', name: 'Голубой', power: 'swim' },
  { id: 'teal', hex: '#2bb3a3', name: 'Бирюзовый' },
  { id: 'white', hex: '#f4f8ff', name: 'Белый' },
  { id: 'gray', hex: '#94a3b8', name: 'Серый' },
  { id: 'brown', hex: '#a1704b', name: 'Коричневый' },
];

export const COLOR_MAP = Object.fromEntries(CHAR_COLORS.map((c) => [c.id, c]));

export const POWERS = {
  jump: { id: 'jump', name: 'Высокий прыжок', icon: '⤒', desc: '+20% к высоте прыжка', color: '#3ddc84' },
  double: { id: 'double', name: 'Двойной прыжок', icon: '⇈', desc: 'можно прыгнуть второй раз в воздухе', color: '#ffd93d' },
  dash: { id: 'dash', name: 'Рывок', icon: '»', desc: 'Shift — рывок, сбивает врагов', color: '#ff5d73' },
  swim: { id: 'swim', name: 'Плавание', icon: '≈', desc: 'быстро плавает в воде', color: '#4ce0e0' },
  speed: { id: 'speed', name: 'Скорость', icon: '⚡', desc: '+20% к скорости бега', color: '#b07cff' },
  heart: { id: 'heart', name: 'Запасное сердце', icon: '♥', desc: '+1 сердце', color: '#ff8fd0' },
};

export const BLOCK_GROUPS = [
  { id: 'terrain', name: 'Земля' },
  { id: 'special', name: 'Особые' },
  { id: 'pickup', name: 'Собираемое' },
  { id: 'hazard', name: 'Опасное' },
  { id: 'entity', name: 'Существа и старт' },
  { id: 'ext', name: 'Из расширений' },
];

const scoreRule = (value, sound, color) => ({
  trigger: 'enter',
  conditions: [],
  actions: [
    { type: 'score', value },
    { type: 'sound', value: sound },
    { type: 'particles', value: color },
    { type: 'remove' },
  ],
});

/**
 * Каждый блок: физика (solid/liquid/climbable/friction/restitution) + стиль + правила.
 * Правила можно переписать в «Книге правил» — они хранятся в данных уровня.
 */
export const BLOCKS = [
  {
    id: 'ground',
    name: 'Земля',
    color: '#4caf50',
    group: 'terrain',
    solid: true,
    friction: 0.92,
    style: 'solid',
    desc: 'Обычная твёрдая земля. Основа любого уровня.',
    rules: [],
  },
  {
    id: 'stone',
    name: 'Камень',
    color: '#8b98a8',
    group: 'terrain',
    solid: true,
    friction: 0.98,
    style: 'solid',
    desc: 'Твёрдый камень, чуть темнее земли.',
    rules: [],
  },
  {
    id: 'crate',
    name: 'Ящик',
    color: '#b07a4f',
    group: 'terrain',
    solid: true,
    friction: 0.9,
    style: 'crate',
    desc: 'Ящик. Можно разбить, прыгнув сверху.',
    rules: [
      {
        trigger: 'stomp',
        conditions: [],
        actions: [
          { type: 'sound', value: 'hit' },
          { type: 'particles', value: '#b07a4f' },
          { type: 'remove' },
        ],
      },
    ],
  },
  {
    id: 'brick',
    name: 'Кирпич',
    color: '#e2725b',
    group: 'terrain',
    solid: true,
    friction: 0.92,
    style: 'brick',
    desc: 'Кирпичная кладка.',
    rules: [],
  },
  {
    id: 'ice',
    name: 'Лёд',
    color: '#a8e6ff',
    group: 'terrain',
    solid: true,
    friction: 0.08,
    style: 'solid',
    desc: 'Скользкий: разгон и торможение почти не работают.',
    rules: [],
  },
  {
    id: 'sand',
    name: 'Песок',
    color: '#e8d38a',
    group: 'terrain',
    solid: true,
    friction: 0.75,
    style: 'solid',
    desc: 'Рыхлый песок.',
    rules: [],
  },
  {
    id: 'bounce',
    name: 'Батут',
    color: '#22d3ee',
    group: 'special',
    solid: true,
    friction: 0.9,
    restitution: 1,
    style: 'bounce',
    desc: 'Подбрасывает вверх при приземлении.',
    rules: [
      {
        trigger: 'stomp',
        conditions: [],
        actions: [
          { type: 'bounce', value: 17 },
          { type: 'sound', value: 'bounce' },
          { type: 'particles', value: '#22d3ee' },
        ],
      },
    ],
  },
  {
    id: 'ladder',
    name: 'Лестница',
    color: '#c98f4a',
    group: 'special',
    climbable: true,
    style: 'ladder',
    desc: 'По ней можно лазить вверх и вниз.',
    rules: [],
  },
  {
    id: 'water',
    name: 'Вода',
    color: '#2f7df6',
    group: 'special',
    liquid: true,
    style: 'liquid',
    desc: 'Плавание: падение медленнее, можно плыть вверх.',
    rules: [],
  },
  {
    id: 'cloud',
    name: 'Облако',
    color: '#dbeafe',
    group: 'special',
    solid: true,
    friction: 0.9,
    style: 'solid',
    desc: 'Мягкая платформа (просто красивый блок).',
    rules: [],
  },
  {
    id: 'coin',
    name: 'Монета',
    color: '#ffd93d',
    group: 'pickup',
    style: 'coin',
    desc: '+1 очко.',
    rules: [scoreRule(1, 'coin', '#ffd93d')],
  },
  {
    id: 'gem',
    name: 'Кристалл',
    color: '#c084fc',
    group: 'pickup',
    style: 'gem',
    desc: '+5 очков.',
    rules: [scoreRule(5, 'gem', '#c084fc')],
  },
  {
    id: 'heart',
    name: 'Сердце',
    color: '#ff5d73',
    group: 'pickup',
    style: 'heart',
    desc: '+1 сердце.',
    rules: [
      {
        trigger: 'enter',
        conditions: [],
        actions: [
          { type: 'heal', value: 1 },
          { type: 'sound', value: 'gem' },
          { type: 'particles', value: '#ff5d73' },
          { type: 'remove' },
        ],
      },
    ],
  },
  {
    id: 'spike',
    name: 'Шипы',
    color: '#cbd5e1',
    group: 'hazard',
    solid: true,
    friction: 0.9,
    style: 'spike',
    desc: 'Ранит при касании.',
    rules: [
      {
        trigger: 'touch',
        conditions: [],
        actions: [
          { type: 'damage', value: 1 },
          { type: 'sound', value: 'hit' },
        ],
      },
    ],
  },
  {
    id: 'lava',
    name: 'Лава',
    color: '#ff7a1a',
    group: 'hazard',
    solid: true,
    friction: 0.9,
    style: 'lava',
    desc: 'Очень горячо: отнимает сердце.',
    rules: [
      {
        trigger: 'touch',
        conditions: [],
        actions: [
          { type: 'damage', value: 1 },
          { type: 'sound', value: 'hit' },
          { type: 'particles', value: '#ff7a1a' },
        ],
      },
    ],
  },
  {
    id: 'enemy',
    name: 'Враг',
    color: '#ff9f43',
    group: 'entity',
    style: 'enemy',
    spawn: 'walker',
    desc: 'Ходит туда-сюда. Прыгни сверху — победишь.',
    rules: [
      {
        trigger: 'touch',
        conditions: [],
        actions: [{ type: 'damage', value: 1 }],
      },
    ],
  },
  {
    id: 'spawn',
    name: 'Старт',
    color: '#f4f8ff',
    group: 'entity',
    style: 'spawn',
    desc: 'Здесь появляется персонаж.',
    rules: [],
  },
  {
    id: 'goal',
    name: 'Финиш',
    color: '#ff4d94',
    group: 'entity',
    style: 'goal',
    desc: 'Флажок: коснись — уровень пройден.',
    rules: [
      {
        trigger: 'touch',
        conditions: [],
        actions: [
          { type: 'win' },
          { type: 'sound', value: 'win' },
        ],
      },
    ],
  },
];

export const BLOCK_MAP = Object.fromEntries(BLOCKS.map((b) => [b.id, b]));

export const DEFAULT_CHARACTER = [
  '.............',
  '.............',
  '....ggggg....',
  '...glllllg...',
  '..glllllllg..',
  '..glwlllwlg..',
  '..glllllllg..',
  '...glllllg...',
  '....ggggg....',
  '...g.g.g.g...',
  '....g...g....',
  '...gg...gg...',
  '.............',
];

export const DEFAULT_CHAR_MAP = { g: 'green', l: 'lime', w: 'white' };

/** Превращает пиксельную карту в 169 значений цвета. */
export function pixelsFromPattern(rows, charMap = DEFAULT_CHAR_MAP) {
  const out = new Array(GRID * GRID).fill(null);
  rows.slice(0, GRID).forEach((row, y) => {
    for (let x = 0; x < GRID; x++) {
      const ch = row[x];
      if (ch && ch !== '.' && charMap[ch]) out[y * GRID + x] = charMap[ch];
    }
  });
  return out;
}

export function defaultCharacterPixels() {
  return pixelsFromPattern(DEFAULT_CHARACTER);
}

/** Способности по использованным цветам персонажа. */
export function powersFromPixels(pixels) {
  const used = new Set((pixels || []).filter(Boolean));
  const powers = [];
  for (const color of CHAR_COLORS) {
    if (color.power && used.has(color.id)) powers.push(color.power);
  }
  return [...new Set(powers)];
}

export function defaultRulesFor(blockId) {
  const block = BLOCK_MAP[blockId];
  return block ? JSON.parse(JSON.stringify(block.rules || [])) : [];
}
