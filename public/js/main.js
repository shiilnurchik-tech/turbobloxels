/** Точка входа: маршрутизация, шапка, состояние пользователя. */
import { el, mount, clear, toast } from './dom.js';
import { store, refreshUser, logout, loadInstalled } from './store.js';
import { detectMode, apiMode } from './api.js';
import { homeView } from './views/home.js';
import { editorView } from './views/editor.js';
import { playView } from './views/play.js';
import { levelsView } from './views/levels.js';
import { extensionsView } from './views/extensions.js';
import { docsView } from './views/docs.js';
import { authModal } from './views/auth.js';

const NAV = [
  { href: '#/home', label: 'Главная', match: ['home', ''] },
  { href: '#/editor', label: 'Создать', match: ['editor'] },
  { href: '#/levels', label: 'Уровни', match: ['levels'] },
  { href: '#/extensions', label: 'Расширения', match: ['extensions'] },
  { href: '#/docs', label: 'Документация', match: ['docs'] },
];

let active = null;
let booted = false;

function parseRoute() {
  const raw = decodeURI(location.hash.replace(/^#/, '')) || '/home';
  const [pathPart] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  return { parts, hash: raw };
}

function resolveRoute(parts) {
  const [head, second] = parts;
  switch (head) {
    case undefined:
    case '':
    case 'home':
      return { view: homeView, params: {} };
    case 'editor':
      return { view: editorView, params: { id: second || '' } };
    case 'play':
      return { view: playView, params: { id: second || '' } };
    case 'levels':
      return { view: levelsView, params: { tab: second || 'community' } };
    case 'extensions':
      return { view: extensionsView, params: { id: second || '' } };
    case 'docs':
      return { view: docsView, params: {} };
    default:
      return { view: homeView, params: { notFound: true } };
  }
}

function renderNav(parts) {
  const nav = document.getElementById('nav');
  const head = parts[0] || 'home';
  mount(
    nav,
    NAV.map((item) =>
      el(
        'a',
        { href: item.href, class: item.match.includes(head) ? 'active' : '' },
        item.label
      )
    )
  );
}

function renderUserSlot() {
  const slot = document.getElementById('user-slot');
  if (store.user) {
    const initial = store.user.name.trim().charAt(0).toUpperCase() || '?';
    mount(
      slot,
      el(
        'div',
        { class: 'user-chip' },
        el('span', { class: 'avatar' }, initial),
        el('span', {}, store.user.name),
        el(
          'button',
          {
            class: 'icon-btn',
            title: 'Выйти',
            style: { width: '26px', height: '26px', fontSize: '12px' },
            onclick: async () => {
              await logout();
              renderUserSlot();
              toast('Вы вышли из аккаунта', 'info');
              rerender();
            },
          },
          '⏻'
        )
      )
    );
  } else {
    mount(
      slot,
      el(
        'button',
        {
          class: 'btn btn-ghost btn-sm',
          onclick: async () => {
            const ok = await authModal();
            if (ok) {
              renderUserSlot();
              rerender();
            }
          },
        },
        'Войти'
      )
    );
  }
  showModeBadge(apiMode());
}

export function rerender() {
  route();
}

async function route() {
  const { parts } = parseRoute();
  renderNav(parts);
  if (active && typeof active.destroy === 'function') {
    try {
      active.destroy();
    } catch (err) {
      console.error(err);
    }
  }
  active = null;
  const root = document.getElementById('view');
  const { view, params } = resolveRoute(parts);

  mount(root, el('div', { class: 'page' }, el('p', { class: 'muted' }, 'Загрузка…')));
  try {
    active = (await view(root, params)) || null;
  } catch (err) {
    console.error(err);
    mount(
      root,
      el(
        'div',
        { class: 'page' },
        el(
          'div',
          { class: 'card' },
          el('h2', {}, 'Что-то сломалось'),
          el('p', { class: 'muted' }, err.message || String(err)),
          el('button', { class: 'btn', onclick: () => route() }, 'Попробовать снова')
        )
      )
    );
  }
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function showModeBadge(mode) {
  const slot = document.getElementById('user-slot');
  if (!slot || document.getElementById('mode-badge')) return;
  const badge = el(
    'span',
    {
      class: 'badge purple',
      id: 'mode-badge',
      title:
        mode === 'local'
          ? 'Локальный режим: сервера нет, уровни и расширения хранятся в этом браузере'
          : 'Сервер на связи: уровни публикуются в общее облако',
    },
    mode === 'local' ? '💾 локально' : '☁️ сервер'
  );
  slot.prepend(badge);
}

async function boot() {
  loadInstalled();
  document.getElementById('user-slot').innerHTML = '';
  await detectMode();
  try {
    await refreshUser();
  } catch {
    /* гость */
  }
  renderUserSlot();
  await route();
  booted = true;
  window.addEventListener('hashchange', route);
}

window.addEventListener('error', (event) => {
  console.error(event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (reason && reason.message) toast(reason.message, 'error');
});

boot();
