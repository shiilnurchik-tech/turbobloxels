/** Документация: правила, API расширений, формат уровня, REST. */
import { el, mount } from '../dom.js';

const BLOCK_EXAMPLE = `TBX.define({
  id: 'ice-pack',                 // id расширения: a-z, 0-9, -, _
  name: 'Ледяной набор',
  version: '1.0.0',
  description: 'Скользкий лёд и сосульки',

  blocks: [
    {
      id: 'ice',
      name: 'Лёд',
      color: '#a8e6ff',
      solid: true,                // твёрдый блок
      friction: 0.05,             // 0 — совсем скользко, 1 — как асфальт
      restitution: 0,             // 1 — батут
      pattern: [                  // необязательный рисунок 13×13
        '.............',
        '....++###....',
        '...++####+...',
        '.............',
      ],
      rules: [
        {
          trigger: 'stomp',       // персонаж приземлился сверху
          conditions: [],         // можно добавить: once, power, chance…
          actions: [
            { type: 'bounce', value: 12 },
            { type: 'sound', value: 'bounce' },
          ],
        },
      ],
      on: {
        // обычный JS: вызывается, когда персонаж заходит в блок
        enter(ctx) {
          TBX.log('лёд на', ctx.x, ctx.y);
        },
      },
    },
  ],

  hooks: {
    onStart(ctx) { TBX.message('Осторожно, лёд!'); },
    onTick(ctx) { /* ~4 раза в секунду */ },
  },
});`;

const CMD_EXAMPLE = `// Команды игре (можно звать из любого обработчика)
TBX.addScore(10);            // +10 очков
TBX.damage(1);               // отнять сердце
TBX.heal(1);                 // добавить сердце
TBX.setBlock(3, 7, null);    // стереть блок в клетке (x, y)
TBX.setBlock(3, 7, 'ice');   // поставить блок
TBX.particles(3, 7, '#fff', 12);
TBX.sound('coin');
TBX.bounce(18);
TBX.teleport(0, 10);
TBX.speed(4);                // ускорение на 4 секунды
TBX.invincible(3);
TBX.message('Привет!');
TBX.win();  TBX.lose();
TBX.log('отладка', { any: 'объект' });`;

const ACTION_EXAMPLE = `// Своё действие для книги правил
TBX.action({
  id: 'quake',
  name: 'землетрясение',
  value: 'number',   // none | number | text | color | block | select
  run(ctx, value) {
    TBX.message('Землетрясение ' + value + '!');
    TBX.sound('hit');
    for (let i = 0; i < 12; i++) {
      TBX.particles(ctx.x + Math.random() * 6 - 3, ctx.y, '#ff9f43', 2);
    }
  },
});

// …и потом в правилах блока:
// { trigger: 'use', actions: [{ type: 'ext', value: 'my-pack:quake' }] }`;

export async function docsView(root) {
  const page = el('div', { class: 'page doc' });
  mount(root, page);

  page.append(
    el('h1', {}, 'Документация TurboBloxels'),
    el(
      'p',
      { class: 'muted' },
      'Здесь всё, что нужно знать про доску, книгу правил, расширения и API сервера. ',
      'Разделы кликабельны в оглавлении.'
    ),
    el(
      'div',
      { class: 'card', style: { marginBottom: '20px' } },
      el('b', {}, 'Оглавление: '),
      ...[
        ['#basics', 'Как играть'],
        ['#rules', 'Книга правил'],
        ['#ext', 'Расширения'],
        ['#api', 'API расширений'],
        ['#format', 'Формат уровня'],
        ['#rest', 'REST API'],
        ['#self', 'Запуск у себя'],
      ].map(([href, label], index) =>
        el('span', {}, index ? ' · ' : '', el('a', { href }, label))
      )
    )
  );

  const section = (id, title, ...children) => {
    const node = el('section', { id }, el('h2', { style: { marginTop: '28px' } }, title), ...children);
    page.appendChild(node);
    return node;
  };

  section(
    'basics',
    'Как играть и создавать',
    el('p', {}, 'Уровень — это одна или несколько досок 13×13. Каждая клетка — блок: земля, шипы, монета, враг, финиш. Блоки «собираются» в экраны, экраны идут слева направо, камера едет за персонажем.'),
    el('h4', {}, 'Управление в игре'),
    el(
      'table',
      {},
      el('tr', {}, el('th', {}, 'Действие'), el('th', {}, 'Клавиши')),
      el('tr', {}, el('td', {}, 'Бег'), el('td', {}, el('kbd', {}, '←'), ' ', el('kbd', {}, '→'), ' или ', el('kbd', {}, 'A'), ' ', el('kbd', {}, 'D'))),
      el('tr', {}, el('td', {}, 'Прыжок'), el('td', {}, el('kbd', {}, 'Space'), ' / ', el('kbd', {}, 'Z'))),
      el('tr', {}, el('td', {}, 'Действие рядом с блоком'), el('td', {}, el('kbd', {}, 'E'))),
      el('tr', {}, el('td', {}, 'Рывок (со способностью)'), el('td', {}, el('kbd', {}, 'Shift'), ' / ', el('kbd', {}, 'J'))),
      el('tr', {}, el('td', {}, 'Пауза'), el('td', {}, el('kbd', {}, 'Esc'), ' / ', el('kbd', {}, 'P')))
    ),
    el('h4', {}, 'Способности персонажа'),
    el('p', {}, 'Цвет пикселя в рисунке персонажа даёт способность: зелёный — высокий прыжок, жёлтый — двойной прыжок, голубой — плавание, красный — рывок, фиолетовый — скорость, розовый — дополнительное сердце.'),
    el('h4', {}, 'Редактор'),
    el('p', {}, 'ЛКМ рисует, ПКМ стирает. ', el('kbd', {}, 'B'), ' кисть, ', el('kbd', {}, 'E'), ' ластик, ', el('kbd', {}, 'F'), ' заливка, ', el('kbd', {}, 'I'), ' пипетка, ', el('kbd', {}, 'Ctrl+Z'), ' отмена. Черновики хранятся в браузере, «Опубликовать» отправляет уровень на сервер.')
  );

  section(
    'rules',
    'Книга правил',
    el('p', {}, 'Блок — это не только картинка. Поведение задаётся правилами вида «КОГДА событие ЕСЛИ условия ТО действия». Правила по умолчанию есть у каждого блока, а в «Книге правил» их можно переписать — они сохраняются вместе с уровнем.'),
    el('h4', {}, 'События (КОГДА)'),
    el(
      'table',
      {},
      el('tr', {}, el('th', {}, 'Событие'), el('th', {}, 'Когда срабатывает')),
      el('tr', {}, el('td', {}, 'вход'), el('td', {}, 'персонаж зашёл в клетку блока')),
      el('tr', {}, el('td', {}, 'касание'), el('td', {}, 'любой контакт, не чаще 2 раз в секунду')),
      el('tr', {}, el('td', {}, 'стоит'), el('td', {}, 'персонаж стоит на блоке')),
      el('tr', {}, el('td', {}, 'приземление'), el('td', {}, 'удар сверху с высоты')),
      el('tr', {}, el('td', {}, 'удар снизу'), el('td', {}, 'прыжок головой в блок')),
      el('tr', {}, el('td', {}, 'каждые N секунд'), el('td', {}, 'таймер')),
      el('tr', {}, el('td', {}, 'кнопка E'), el('td', {}, 'нажатие E рядом с блоком')),
      el('tr', {}, el('td', {}, 'старт'), el('td', {}, 'в начале уровня'))
    ),
    el('h4', {}, 'Условия (ЕСЛИ)'),
    el('p', {}, 'только один раз за прохождение · есть способность · очков ≥ N · сердец ≥ N · сердец < N · шанс N%'),
    el('h4', {}, 'Действия (ТО)'),
    el('p', {}, 'очки · отнять/добавить сердца · подбросить · ускорение · неуязвимость · убрать блок · превратить в блок · сообщение · звук · частицы · телепорт к блоку · выпустить врага · победа · поражение · действие расширения')
  );

  section(
    'ext',
    'Расширения',
    el('p', {}, 'Расширение — JS-файл, который вызывает ', el('code', {}, 'TBX.define({...})'), '. Внутри объявляются блоки (с физикой, узором и правилами) и хуки игры.'),
    el('pre', {}, el('code', {}, BLOCK_EXAMPLE)),
    el('h4', {}, 'Как это исполняется'),
    el('p', {}, 'Каждое расширение живёт в отдельном iframe с ', el('code', {}, 'sandbox="allow-scripts"'), ' — без доступа к странице, cookie и localStorage. CSP внутри запрещает сеть. Общение только через ', el('code', {}, 'postMessage'), ' командами из белого списка, значения проверяются на стороне игры.'),
    el('h4', {}, 'Поля блока'),
    el(
      'table',
      {},
      el('tr', {}, el('th', {}, 'Поле'), el('th', {}, 'Смысл')),
      el('tr', {}, el('td', {}, 'id'), el('td', {}, 'латиница, цифры, - и _; уникально внутри расширения')),
      el('tr', {}, el('td', {}, 'name, color'), el('td', {}, 'название и цвет (hex) для палитры')),
      el('tr', {}, el('td', {}, 'solid'), el('td', {}, 'твёрдый ли блок (по умолчанию true)')),
      el('tr', {}, el('td', {}, 'friction'), el('td', {}, '0…1, трение поверхности')),
      el('tr', {}, el('td', {}, 'restitution'), el('td', {}, 'прыгучесть 0…1.4')),
      el('tr', {}, el('td', {}, 'liquid, climbable'), el('td', {}, 'вода / лестница')),
      el('tr', {}, el('td', {}, 'damage'), el('td', {}, 'если > 0, добавляется правило «касание → отнять сердца»')),
      el('tr', {}, el('td', {}, 'pattern'), el('td', {}, '13 строк по 13 символов: # цвет, + светлее, - темнее, . пусто')),
      el('tr', {}, el('td', {}, 'rules'), el('td', {}, 'массив правил (та же схема, что в книге правил)')),
      el('tr', {}, el('td', {}, 'on'), el('td', {}, 'JS-обработчики: enter, leave, touch, stand, stomp, hit, tick, use, start'))
    ),
    el('h4', {}, 'Хуки игры'),
    el('p', {}, 'onStart(ctx) · onTick(ctx) (≈4 раза в секунду) · onWin(ctx) · onLose(ctx). В ', el('code', {}, 'ctx'), ' приходят очки, сердца, способности и позиция персонажа.')
  );

  section(
    'api',
    'API расширений: TBX.*',
    el('pre', {}, el('code', {}, CMD_EXAMPLE)),
    el('h4', {}, 'Своё действие для книги правил'),
    el('pre', {}, el('code', {}, ACTION_EXAMPLE)),
    el(
      'p',
      { class: 'small muted' },
      'Действие расширения появляется в списке «действие расширения» у любого блока. Значение хранится как ',
      el('code', {}, 'extId:actionId'),
      '.'
    )
  );

  section(
    'format',
    'Формат уровня (JSON)',
    el(
      'pre',
      {},
      el(
        'code',
        {},
        `{
  "screens": [
    { "cells": [null, "ground", "coin", … 169 значений] }
  ],
  "character": { "pixels": [null, "green", "lime", … 169] },
  "background": { "pixels": [ … ] },
  "rules": {
    "coin": [
      { "trigger": "enter",
        "conditions": [],
        "actions": [{ "type": "score", "value": 1 }, { "type": "remove" }] }
    ],
    "ext:ice-pack:ice": [ … ]
  },
  "settings": { "gravity": 1, "speed": 1, "jump": 1 }
}`
      )
    ),
    el('p', {}, 'Блок расширения в клетке записывается как ', el('code', {}, 'ext:<idРасширения>:<idБлока>'), '. Если расширение не установлено, блок рисуется как «?» и ничего не делает — уровень не ломается.')
  );

  section(
    'rest',
    'REST API сервера',
    el(
      'table',
      {},
      el('tr', {}, el('th', {}, 'Метод'), el('th', {}, 'Путь'), el('th', {}, 'Что делает')),
      el('tr', {}, el('td', {}, 'POST'), el('td', {}, '/api/auth/register'), el('td', {}, 'регистрация, выдаёт токен')),
      el('tr', {}, el('td', {}, 'POST'), el('td', {}, '/api/auth/login'), el('td', {}, 'вход')),
      el('tr', {}, el('td', {}, 'GET'), el('td', {}, '/api/levels'), el('td', {}, 'каталог (?mine=1, ?q=, ?sort=)')),
      el('tr', {}, el('td', {}, 'POST/PUT/DELETE'), el('td', {}, '/api/levels/:id'), el('td', {}, 'создать / изменить / удалить')),
      el('tr', {}, el('td', {}, 'POST'), el('td', {}, '/api/levels/:id/play|like|score'), el('td', {}, 'прохождения, лайки, результаты')),
      el('tr', {}, el('td', {}, 'GET'), el('td', {}, '/api/levels/:id/leaderboard'), el('td', {}, 'таблица результатов')),
      el('tr', {}, el('td', {}, 'GET/POST'), el('td', {}, '/api/extensions'), el('td', {}, 'каталог и публикация расширений')),
      el('tr', {}, el('td', {}, 'GET'), el('td', {}, '/api/extensions/:id'), el('td', {}, 'расширение с исходником')),
      el('tr', {}, el('td', {}, 'GET'), el('td', {}, '/api/stats'), el('td', {}, 'счётчики для главной'))
    ),
    el('p', { class: 'small muted' }, 'Авторизация: ', el('code', {}, 'Authorization: Bearer <token>'), ' (токен выдаётся при входе) или cookie ', el('code', {}, 'tbx_token'), '.')
  );

  section(
    'self',
    'Запуск у себя',
    el('pre', {}, el('code', {}, `git clone https://github.com/shiilnurchik-tech/turbobloxels
cd turbobloxels
npm install
npm start            # http://localhost:3000
npm test             # тесты сервера и движка`)),
    el('p', {}, 'Данные лежат в ', el('code', {}, 'data/db.json'), '. Порт меняется через ', el('code', {}, 'PORT'), ', каталог данных — через ', el('code', {}, 'TBX_DATA_DIR'), '.'),
    el(
      'p',
      { class: 'small dim' },
      'Проект распространяется по лицензии AGPL-3.0. Это самостоятельная реализация в духе конструктора Bloxels: ',
      'клиент на чистом JavaScript без сборки, сервер на Node.js + Express, расширения в песочнице.'
    )
  );

  return {};
}
