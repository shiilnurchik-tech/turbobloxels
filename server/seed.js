/**
 * Сид-данные: демо-уровень «Первый прыжок» и два примера расширений.
 * Заполняется один раз, если база пустая.
 */
import { getDb, save } from './db.js';
import { hashPassword, newId } from './auth.js';
import { GRID } from './validate.js';

const ASCII = {
  '.': null,
  G: 'ground',
  S: 'stone',
  I: 'ice',
  W: 'water',
  L: 'lava',
  C: 'coin',
  M: 'gem',
  E: 'enemy',
  '^': 'spike',
  B: 'bounce',
  F: 'goal',
  P: 'spawn',
  '=': 'ladder',
  '#': 'crate',
};

export function gridFromAscii(rows) {
  if (rows.length !== GRID) throw new Error(`экран должен быть ${GRID} строк`);
  const cells = new Array(GRID * GRID).fill(null);
  rows.forEach((row, y) => {
    if (row.length !== GRID) throw new Error(`строка ${y} длиной ${row.length}, нужно ${GRID}`);
    for (let x = 0; x < GRID; x++) {
      const ch = row[x];
      if (!(ch in ASCII)) throw new Error(`неизвестный символ "${ch}"`);
      cells[y * GRID + x] = ASCII[ch];
    }
  });
  return { cells };
}

const SCREEN_A = [
  '.............',
  '.............',
  '.............',
  '.............',
  '.............',
  '.............',
  '.............',
  '.....CCC.....',
  '...C.....C...',
  '.............',
  'P............',
  'GGGGGG.GGGGGG',
  'GGGGGG.GGGGGG',
];

const SCREEN_B = [
  '.............',
  '.....MMM.....',
  '....GGGGG....',
  '.............',
  '..C..........',
  '..GG.........',
  '.............',
  '.............',
  '.............',
  '..E.B....WWWW',
  'GGGGG...GWWWW',
  'GGGGGLLLGGGGG',
  'GGGGGGGGGGGGG',
];

const SCREEN_C = [
  '.............',
  '.............',
  '.............',
  '.....CCC.....',
  '....GGGGG....',
  '.............',
  '.............',
  '..C.....C....',
  '.............',
  '..#.......#..',
  '...^^..F..^^.',
  'GGGGGGGGGGGGG',
  'GGGGGGGGGGGGG',
];

const ICE_PACK_SOURCE = `// "Ледяной набор" — пример расширения TurboBloxels.
// Блоки получают собственные свойства и рисунок из пиксельной сетки 13x13.
TBX.define({
  id: 'ice-pack',
  name: 'Ледяной набор',
  version: '1.0.0',
  author: 'TurboBloxels',
  description: 'Скользкий лёд, снег и сосульки. Попробуй разогнаться на льду!',

  blocks: [
    {
      id: 'ice',
      name: 'Лёд',
      color: '#a8e6ff',
      solid: true,
      friction: 0.05,       // почти без трения — персонажа несёт
      pattern: [
        '.............',
        '.............',
        '....++###....',
        '...++####+...',
        '...++#####+..',
        '...++#####+..',
        '...++#####+..',
        '...++####+...',
        '...++###++...',
        '...++##++....',
        '.............',
        '.............',
        '.............',
      ],
    },
    { id: 'snow', name: 'Снег', color: '#f2fbff', solid: true, friction: 0.9 },
    {
      id: 'icicle',
      name: 'Сосулька',
      color: '#7fd4ff',
      solid: true,
      damage: 1,
      pattern: [
        '.....###.....',
        '.....###.....',
        '....#####....',
        '....#####....',
        '.....###.....',
        '.....###.....',
        '.....###.....',
        '......#......',
        '......#......',
        '.............',
        '.............',
        '.............',
      ],
    },
  ],

  hooks: {
    onStart() {
      TBX.message('Осторожно: лёд скользкий!');
    },
  },
});
`;

const TREASURE_SOURCE = `// "Сокровища" — пример событий и команд.
// enter() вызывается, когда персонаж заходит в клетку блока.
TBX.define({
  id: 'treasure-pack',
  name: 'Сокровища',
  version: '1.0.0',
  author: 'TurboBloxels',
  description: 'Клад, аптечка и бомба-блок. Показывает команды TBX.*',

  blocks: [
    {
      id: 'treasure',
      name: 'Клад',
      color: '#ffd166',
      solid: false,
      on: {
        enter(ctx) {
          TBX.addScore(25);
          TBX.sound('coin');
          TBX.particles(ctx.x, ctx.y, '#ffd166', 14);
          TBX.setBlock(ctx.x, ctx.y, null); // блок исчезает
          TBX.log('клад найден на', ctx.x, ctx.y);
        },
      },
    },
    {
      id: 'medkit',
      name: 'Аптечка',
      color: '#7cfc9a',
      solid: false,
      on: {
        enter(ctx) {
          TBX.heal(1);
          TBX.setBlock(ctx.x, ctx.y, null);
        },
      },
    },
    {
      id: 'bomb',
      name: 'Бомба-блок',
      color: '#ff6b6b',
      solid: true,
      damage: 1,
      on: {
        tick(ctx) {
          if (Math.random() < 0.002) TBX.particles(ctx.x, ctx.y, '#ff6b6b', 3);
        },
      },
    },
  ],
});
`;

export function seedIfEmpty() {
  const db = getDb();
  if (db.levels.length > 0 || db.extensions.length > 0) return false;

  const systemUser = {
    id: newId('u_'),
    name: 'TurboBloxels',
    passHash: hashPassword(newId('nologin')),
    createdAt: Date.now(),
  };
  db.users.push(systemUser);

  const demoLevel = {
    id: newId('l_'),
    ownerId: systemUser.id,
    ownerName: systemUser.name,
    title: 'Первый прыжок',
    description:
      'Демо-уровень: монетки, враг, яма, лава и вода. Собери всё и добеги до флажка. Создай свою копию и переделай его!',
    data: {
      screens: [gridFromAscii(SCREEN_A), gridFromAscii(SCREEN_B), gridFromAscii(SCREEN_C)],
      character: { pixels: new Array(GRID * GRID).fill(null) },
      background: { pixels: new Array(GRID * GRID).fill(null) },
      settings: { gravity: 1, speed: 1, jump: 1 },
    },
    extensionIds: [],
    thumb: null,
    published: true,
    plays: 0,
    likes: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  db.levels.push(demoLevel);

  db.extensions.push(
    {
      id: 'x_ice-pack_seed01',
      ownerId: systemUser.id,
      ownerName: systemUser.name,
      name: 'Ледяной набор',
      version: '1.0.0',
      description: 'Скользкий лёд, снег и сосульки. Добавляет три новых блока на доску.',
      source: ICE_PACK_SOURCE,
      blocks: [
        { id: 'ice', name: 'Лёд', color: '#a8e6ff' },
        { id: 'snow', name: 'Снег', color: '#f2fbff' },
        { id: 'icicle', name: 'Сосулька', color: '#7fd4ff' },
      ],
      likes: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'x_treasure-pack_seed02',
      ownerId: systemUser.id,
      ownerName: systemUser.name,
      name: 'Сокровища',
      version: '1.0.0',
      description: 'Клад (+25 очков), аптечка и бомба-блок. Пример работы с событиями и командами.',
      source: TREASURE_SOURCE,
      blocks: [
        { id: 'treasure', name: 'Клад', color: '#ffd166' },
        { id: 'medkit', name: 'Аптечка', color: '#7cfc9a' },
        { id: 'bomb', name: 'Бомба-блок', color: '#ff6b6b' },
      ],
      likes: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  );

  save();
  return true;
}

export const EXAMPLE_SOURCES = {
  'ice-pack': ICE_PACK_SOURCE,
  'treasure-pack': TREASURE_SOURCE,
};
