# Расширения TurboBloxels — справочник

Расширение добавляет в игру новые блоки, их правила и JS-обработчики. Один файл = одно
расширение. Файл загружается в мастерской (`/#/extensions`), кнопка **«Проверить»**
прогоняет его в песочнице, **«Опубликовать»** отправляет на сервер.

---

## 1. Минимальный пример

```js
TBX.define({
  id: 'hello-pack',      // a-z, 0-9, «-», «_», 2–40 символов — уникальный id
  name: 'Привет, мир',   // до 60 символов
  version: '1.0.0',
  description: 'Один блок и одно правило',

  blocks: [
    {
      id: 'flag',
      name: 'Флажок',
      color: '#ffd93d',
      solid: false,
      rules: [
        { trigger: 'enter', actions: [{ type: 'score', value: 3 }, { type: 'remove' }] },
      ],
    },
  ],
});
```

После установки блок «Флажок» появляется в палитре редактора (группа «Из расширений»),
а его правила — в «Книге правил». В данных уровня такой блок записывается как
`ext:hello-pack:flag`.

---

## 2. Поля расширения

| Поле | Тип | Обязательно | Описание |
| --- | --- | --- | --- |
| `id` | string | да | `^[a-z0-9_-]{2,40}$`. Блоки живут под `ext:<id>:<block>` |
| `name` | string | нет | Название (по умолчанию = `id`) |
| `version` | string | нет | Например `1.0.0` |
| `description` | string | нет | До 400 символов, показывается в каталоге |
| `author` | string | нет | Подпись автора |
| `blocks` | array | да | Минимум один блок |
| `hooks` | object | нет | `onStart`, `onTick`, `onWin`, `onLose` |
| `actions` | — | — | Регистрируются через `TBX.action()`, в `define` не пишутся |

---

## 3. Блок

| Поле | Тип | По умолчанию | Описание |
| --- | --- | --- | --- |
| `id` | string | — | `^[a-z0-9_-]{1,40}$`, уникален внутри расширения |
| `name` | string | `id` | Название в палитре |
| `color` | `#rrggbb` | `#9aa4b2` | Цвет плитки |
| `solid` | boolean | `true` | Твёрдый: в него нельзя войти |
| `liquid` | boolean | `false` | Вода: медленное падение, можно плыть |
| `climbable` | boolean | `false` | Лестница |
| `friction` | 0…1 | `0.9` | Трение поверхности (0.05 — лёд) |
| `restitution` | 0…1.4 | `0` | Прыгучесть |
| `damage` | number | `0` | Если > 0, добавляется правило «касание → урон» |
| `pattern` | string[13] | — | Рисунок 13×13: `#` цвет, `+` светлее, `-` темнее, `.` прозрачно |
| `desc` | string | — | Подсказка в палитре / книге правил |
| `rules` | array | `[]` | Правила (та же схема, что в книге правил) |
| `on` | object | — | JS-обработчики (см. ниже) |

### Обработчики блока (`on`)

| Ключ | Когда вызывается |
| --- | --- |
| `enter` | персонаж вошёл в клетку блока |
| `touch` | касание (не чаще ~6 раз в секунду) |
| `stand` | стоит на блоке |
| `stomp` | приземлился на блок сверху |
| `hit` | ударился головой снизу |
| `tick` | раз в секунду |
| `start` | в начале уровня |
| `use` | рядом нажата клавиша **E** |

Аргумент `ctx`:

```js
{
  block: 'flag',        // id блока
  event: 'enter',       // имя события
  trigger: 'enter',
  x: 4, y: 7,          // клетка
  score: 12, hearts: 3,
  powers: ['jump', 'dash']
}
```

---

## 4. Хуки игры

```js
hooks: {
  onStart(ctx) {},   // { screen, hearts, powers }
  onTick(ctx) {},    // { time, score, hearts, powers, player: {x,y,vx,vy} } — 4 раза в секунду
  onWin(ctx) {},     // { score, time, hearts }
  onLose(ctx) {},
}
```

`TBX.on('start', fn)` — то же самое, если удобнее регистрировать вручную.

---

## 5. Команды `TBX.*`

| Команда | Что делает |
| --- | --- |
| `TBX.addScore(n)` | изменить очки (можно отрицательное) |
| `TBX.damage(n)` / `TBX.heal(n)` | отнять / добавить сердца |
| `TBX.bounce(power)` | подбросить персонажа |
| `TBX.teleport(x, y)` | перенести в клетку (в тайлах) |
| `TBX.setBlock(x, y, id)` | поставить/стереть блок (`null` — стереть) |
| `TBX.particles(x, y, color, count)` | частицы |
| `TBX.sound(name)` | `coin`, `gem`, `jump`, `hit`, `bounce`, `win`, `lose`, `step`, `zap` |
| `TBX.speed(seconds)` | ускорение |
| `TBX.invincible(seconds)` | неуязвимость |
| `TBX.message(text)` | всплывающее сообщение |
| `TBX.win()` / `TBX.lose()` | завершить уровень |
| `TBX.log(...)` / `TBX.warn(...)` / `TBX.error(...)` | вывод в лог мастерской |
| `TBX.report(data)` | отправить отладочные данные в лог |

Команды копятся и уходят пачкой; значения проверяются игрой (числа ограничиваются,
id блоков — до 48 символов, максимум 60 команд за тик).

---

## 6. Свои действия для книги правил

```js
TBX.action({
  id: 'quake',            // a-z, 0-9, -, _
  name: 'землетрясение',  // как показывать в списке
  value: 'number',        // none | number | text | color | block | select
  run(ctx, value) {
    TBX.message('Землетрясение ' + value);
  },
});
```

В правиле действие записывается так:

```js
{ trigger: 'use', actions: [{ type: 'ext', value: 'my-pack:quake' }] }
```

`ctx` в `run` содержит `x`, `y`, `trigger`, `score`, `hearts`.

---

## 7. Правила (схема)

```js
{
  trigger: 'enter' | 'touch' | 'stand' | 'stomp' | 'hit' | 'tick' | 'use' | 'start',
  every: 1.0,                 // только для trigger: 'tick'
  conditions: [ ... ],
  actions: [ ... ],
  enabled: true
}
```

**Условия**

```js
{ type: 'once' }
{ type: 'power', value: 'jump' }        // jump, double, swim, dash, speed, heart
{ type: 'scoreAtLeast', value: 10 }
{ type: 'heartsAtLeast', value: 2 }
{ type: 'heartsBelow', value: 2 }
{ type: 'chance', value: 25 }           // проценты
```

**Действия**

```js
{ type: 'score', value: 5 }
{ type: 'damage', value: 1 }
{ type: 'heal', value: 1 }
{ type: 'bounce', value: 18 }
{ type: 'speed', value: 4 }
{ type: 'invincible', value: 3 }
{ type: 'remove' }
{ type: 'setBlock', value: 'ground' }   // id блока, в т.ч. ext:pack:block
{ type: 'message', value: 'Текст' }
{ type: 'sound', value: 'coin' }
{ type: 'particles', value: '#ffd166' }
{ type: 'teleport', value: 'goal' }
{ type: 'spawnEnemy' }
{ type: 'win' }  { type: 'lose' }
{ type: 'ext', value: 'my-pack:quake' }
```

Правила из `TBX.define` — это значения по умолчанию: автор уровня может переписать их
в «Книге правил», и они сохранятся в `data.rules[<blockId>]`.

---

## 8. Песочница и ограничения

* отдельный `iframe` c `sandbox="allow-scripts"` на каждое расширение → нет доступа к DOM,
  cookie, `localStorage` и `fetch` (CSP `connect-src 'none'`);
* загрузка кода ограничена 5 секундами, исходник — 100 КБ (проверяется сервером);
* обработчики вызываются асинхронно через `postMessage`; зависший цикл застопорит только
  свою песочницу, игра продолжит работать (события для неё просто перестанут приходить);
* размер очереди команд ограничен;
* `TBX.getBlock()` и других синхронных чтений нет специально: игровое состояние приходит
  в `ctx` событий.

---

## 9. Формат уровня

```json
{
  "screens": [{ "cells": ["ground", null, "ext:my-pack:flag", "...169 значений"] }],
  "character": { "pixels": [null, "green", "...169"] },
  "background": { "pixels": ["...169"] },
  "rules": {
    "coin": [{ "trigger": "enter", "conditions": [], "actions": [{ "type": "score", "value": 1 }] }],
    "ext:my-pack:flag": [{ "trigger": "enter", "actions": [{ "type": "score", "value": 3 }] }]
  },
  "settings": { "gravity": 1, "speed": 1, "jump": 1 }
}
```

Если блок ссылается на неустановленное расширение, он рисуется как «?» и не участвует
в физике — уровень не ломается.

---

## 10. Отладка

1. Вставь код в мастерскую, нажми «Проверить» — под редактором появится манифест
   (какие блоки, хуки и действия распознаны) и лог.
2. Ошибки показываются с сообщением исключения (`TBX.log` печатает значения).
3. Установи расширение, открой редактор: блоки появятся в палитре, их правила — в книге.
4. «Проверить» в редакторе запускает игру на черновике — там видно поведение в бою.

---

## 11. Частые ошибки

| Сообщение | Причина |
| --- | --- |
| `id расширения: латиница, цифры…` | неверный `id` или `id` блока |
| `у блока нет id` | в `blocks` элемент без `id` |
| `Расширение не вызвало TBX.define({...})` | код не объявил расширение |
| `TBX.define() можно вызвать только один раз` | два вызова в одном файле |
| `Расширение не ответило за 5 секунд` | бесконечный цикл при загрузке или исключение вне try |
