/** Игра: запуск уровня из облака или из черновика. */
import { el, mount, clear, toast, fmtTime } from '../dom.js';
import { api } from '../api.js';
import { store, ensureHost, currentRegistry, getDraft } from '../store.js';
import { buildWorld, normalizeLevel } from '../game/world.js';
import { Game } from '../game/engine.js';
import { audio } from '../game/audio.js';
import { POWERS } from '../blocks.js';
import { powerChips } from './common.js';

export async function playView(root, params) {
  const raw = params.id || '';
  const isDraft = raw.startsWith('draft:');
  let levelData = null;
  let levelId = null;
  let meta = { title: 'Уровень', ownerName: '', likes: 0, plays: 0, mine: false, extensionIds: [] };

  const page = el('div', { class: 'page' });
  mount(root, page);

  if (isDraft) {
    const draft = getDraft(raw.slice(6));
    if (!draft) {
      mount(page, el('div', { class: 'empty' }, 'Черновик не найден. ', el('a', { href: '#/editor' }, 'Открыть редактор')));
      return {};
    }
    levelData = normalizeLevel(draft.level);
    meta = { ...meta, title: draft.title, ownerName: 'черновик', extensionIds: draft.extensionIds || [] };
  } else if (raw) {
    try {
      const data = await api.level(raw);
      levelData = normalizeLevel(data.level.data);
      levelId = raw;
      meta = {
        title: data.level.title,
        ownerName: data.level.ownerName,
        likes: data.level.likes || 0,
        plays: data.level.plays || 0,
        mine: data.summary?.mine || false,
        extensionIds: data.level.extensionIds || [],
        description: data.level.description,
      };
      api.playLevel(raw).catch(() => {});
    } catch (err) {
      mount(page, el('div', { class: 'empty' }, `Не удалось открыть уровень: ${err.message}`));
      return {};
    }
  } else {
    location.hash = '#/levels';
    return {};
  }

  await ensureHost(meta.extensionIds).catch(() => {});
  const registry = currentRegistry();

  const gameShell = el('div', { class: 'game-shell' });
  const canvas = el('canvas', {});
  const hudHearts = el('div', { class: 'hud-hearts' });
  const hudScore = el('div', { class: 'hud-pill' }, '★ 0');
  const hudTime = el('div', { class: 'hud-pill' }, '⏱ 0:00');
  const hudPowers = el('div', { class: 'hud-powers' });
  const overlayHost = el('div', { class: 'overlay-host' });
  const messageHost = el('div', {});

  const stage = el(
    'div',
    { class: 'game-stage' },
    canvas,
    el(
      'div',
      { class: 'hud' },
      el('div', { class: 'hud-top' }, hudHearts, hudScore, hudTime, el('div', { class: 'spacer' }), hudPowers),
      el('div', {})
    ),
    messageHost,
    overlayHost
  );

  const likeBtn = el('button', { class: 'btn btn-ghost btn-sm', onclick: toggleLike }, `♥ ${meta.likes}`);
  const restartBtn = el('button', { class: 'btn btn-ghost btn-sm', onclick: () => restart() }, '⟲ Заново');

  const topBar = el(
    'div',
    { class: 'row wrap', style: { gap: '10px' } },
    el('a', { class: 'btn btn-ghost btn-sm', href: '#/levels' }, '← Назад'),
    el(
      'div',
      {},
      el('h2', { style: { margin: 0 } }, meta.title),
      el('span', { class: 'small dim' }, `${meta.ownerName || 'автор неизвестен'} · ${meta.plays || 0} прохождений`)
    ),
    el('div', { class: 'spacer' }),
    isDraft ? el('span', { class: 'badge yellow' }, 'черновик') : likeBtn,
    el('button', { class: 'icon-btn', title: 'Звук', onclick: toggleSound }, audio.muted ? '🔇' : '🔊'),
    restartBtn
  );

  const touchPad = el(
    'div',
    { class: 'touch-pad' },
    el(
      'div',
      { class: 'row' },
      touchButton('←', 'left'),
      touchButton('→', 'right')
    ),
    el(
      'div',
      { class: 'row' },
      touchButton('↑', 'up'),
      touchButton('⤒', 'jump'),
      touchButton('»', 'dash')
    )
  );

  const infoCard = el(
    'div',
    { class: 'card' },
    el('div', { class: 'row wrap', style: { gap: '10px' } },
      el('h3', { style: { margin: 0 } }, 'Книга правил на этом уровне'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => (location.hash = isDraft ? `#/editor/${raw.slice(6)}` : '#/editor'), }, isDraft ? 'Вернуться в редактор' : 'Сделать свой уровень')
    ),
    el('p', { class: 'small muted', style: { marginTop: '8px' } },
      'Блоки ведут себя так, как описано в правилах уровня. ',
      el('kbd', {}, 'Shift'), ' — рывок, ', el('kbd', {}, 'E'), ' — действие рядом с блоком, ',
      el('kbd', {}, 'Esc'), ' — пауза.'
    ),
    el('div', { class: 'row wrap', id: 'level-powers', style: { gap: '6px', marginTop: '6px' } }),
    el('div', { id: 'leaderboard-box', style: { marginTop: '10px' } })
  );

  gameShell.append(topBar, stage, touchPad, infoCard);
  page.appendChild(gameShell);

  let game = null;
  let overlay = null;
  let submitted = false;

  function touchButton(label, action) {
    return el(
      'button',
      {
        class: 'tbtn btn',
        onpointerdown: (event) => {
          event.preventDefault();
          game?.input.touchDown(action);
        },
        onpointerup: () => game?.input.touchUp(action),
        onpointerleave: () => game?.input.touchUp(action),
      },
      label
    );
  }

  function hideOverlay() {
    clear(overlayHost);
    overlay = null;
  }

  function showOverlay(content) {
    overlay = el('div', { class: 'overlay' }, el('div', { class: 'overlay-card' }, content));
    mount(overlayHost, overlay);
  }

  function renderHud(data) {
    const hearts = [];
    for (let i = 0; i < data.maxHearts; i++) hearts.push(el('span', { class: i < data.hearts ? '' : 'empty' }, '♥'));
    mount(hudHearts, hearts);
    hudScore.textContent = `★ ${data.score}`;
    hudTime.textContent = `⏱ ${fmtTime(data.time)}`;
    mount(
      hudPowers,
      [...new Set(data.powers || [])].map((id) => {
        const power = POWERS[id];
        return power ? el('span', { class: 'power-dot', title: `${power.name}: ${power.desc}` }, power.icon) : null;
      })
    );
  }

  function onGameEvent(event) {
    switch (event.type) {
      case 'hud':
        renderHud(event);
        break;
      case 'message':
        showMessage(event.text);
        break;
      case 'paused':
        showOverlay(
          el(
            'div',
            {},
            el('h2', {}, 'Пауза'),
            el('p', { class: 'muted' }, 'Правила никуда не делись.'),
            el('div', { class: 'row', style: { justifyContent: 'center' } },
              el('button', { class: 'btn', onclick: () => { game.togglePause(); hideOverlay(); } }, 'Продолжить'),
              el('button', { class: 'btn btn-ghost', onclick: () => restart() }, 'Заново')
            )
          )
        );
        break;
      case 'resumed':
        hideOverlay();
        break;
      case 'win':
        if (!submitted) {
          submitted = true;
          submitScore(event.score, event.time);
        }
        showOverlay(
          el(
            'div',
            {},
            el('div', { style: { fontSize: '46px' } }, '🏁'),
            el('h2', {}, 'Уровень пройден!'),
            el('div', { class: 'big-score' }, String(event.score)),
            el('p', { class: 'muted' }, `Очков: ${event.score} · Время: ${fmtTime(event.time)}`),
            el('div', { class: 'row', style: { justifyContent: 'center' } },
              el('button', { class: 'btn', onclick: () => restart() }, 'Ещё раз'),
              el('a', { class: 'btn btn-ghost', href: '#/levels' }, 'К уровням')
            )
          )
        );
        break;
      case 'lose':
        showOverlay(
          el(
            'div',
            {},
            el('div', { style: { fontSize: '46px' } }, '💥'),
            el('h2', {}, 'Персонаж проиграл'),
            el('p', { class: 'muted' }, `Очки: ${event.score}. Ничего, попробуй ещё!`),
            el('div', { class: 'row', style: { justifyContent: 'center' } },
              el('button', { class: 'btn', onclick: () => restart() }, 'Заново'),
              el('a', { class: 'btn btn-ghost', href: '#/levels' }, 'К уровням')
            )
          )
        );
        break;
      default:
        break;
    }
  }

  function showMessage(text) {
    const node = el('div', { class: 'message-pop' }, text);
    messageHost.appendChild(node);
    setTimeout(() => node.remove(), 2400);
  }

  function start() {
    const world = buildWorld(levelData, registry);
    game = new Game({ canvas, world, onEvent: onGameEvent });
    if (store.host) game.attachExtensions(store.host);
    game.start();
    const powersBox = document.getElementById('level-powers');
    if (powersBox) mount(powersBox, powerChips(game.player.powers));
  }

  function restart() {
    hideOverlay();
    submitted = false;
    if (game) game.stop();
    start();
    toast('Поехали!', 'info', 900);
  }

  async function toggleLike() {
    if (!levelId) return;
    if (!store.user) {
      toast('Войди, чтобы ставить лайки', 'error');
      return;
    }
    try {
      const res = await api.likeLevel(levelId);
      likeBtn.textContent = `♥ ${res.likes}`;
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function toggleSound() {
    audio.setMuted(!audio.muted);
    toast(audio.muted ? 'Звук выключен' : 'Звук включён', 'info', 1200);
  }

  async function submitScore(score, time) {
    if (!levelId) return;
    try {
      const res = await api.submitScore(levelId, {
        score,
        time: Math.round(time * 10),
        name: store.user?.name || 'Гость',
      });
      renderLeaderboard(res.leaderboard || []);
    } catch {
      loadLeaderboard();
    }
  }

  function renderLeaderboard(rows) {
    const box = document.getElementById('leaderboard-box');
    if (!box?.isConnected) return;
    if (!levelId) {
      mount(box, el('p', { class: 'small dim' }, 'Это черновик — результат не отправляется на сервер.'));
      return;
    }
    if (!rows.length) {
      mount(box, el('p', { class: 'small dim' }, 'Результатов пока нет. Стань первым!'));
      return;
    }
    mount(
      box,
      el('h4', { class: 'small', style: { margin: '0 0 6px' } }, 'Лучшие результаты'),
      el(
        'table',
        { class: 'lb' },
        el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Игрок'), el('th', {}, 'Очки'), el('th', {}, 'Время'))),
        el(
          'tbody',
          {},
          rows.slice(0, 8).map((row, index) =>
            el(
              'tr',
              { class: store.user && row.userId === store.user.id ? 'me' : '' },
              el('td', {}, String(index + 1)),
              el('td', {}, row.name),
              el('td', {}, String(row.score)),
              el('td', {}, fmtTime((row.time || 0) / 10))
            )
          )
        )
      )
    );
  }

  function loadLeaderboard() {
    if (!levelId) return;
    api
      .leaderboard(levelId)
      .then((res) => renderLeaderboard(res.leaderboard || []))
      .catch(() => {});
  }

  const onVisibility = () => {
    if (document.hidden && game && game.state === 'playing') game.togglePause();
  };
  document.addEventListener('visibilitychange', onVisibility);

  start();
  renderHud({ hearts: game.player.hearts, maxHearts: game.player.maxHearts, score: 0, time: 0, powers: game.player.powers });
  loadLeaderboard();

  return {
    destroy() {
      document.removeEventListener('visibilitychange', onVisibility);
      if (game) game.stop();
    },
  };
}
