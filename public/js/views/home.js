import { el, mount, toast, confirmDialog, fmtDate } from '../dom.js';
import { api } from '../api.js';
import {
  store,
  listDrafts,
  deleteDraft,
  refreshExtensionList,
  installExtension,
  uninstallExtension,
  ensureHost,
} from '../store.js';
import { levelCard, boardThumb, sectionHead, characterThumb } from './common.js';

const FEATURES = [
  {
    icon: '🧱',
    title: 'Доска 13×13',
    text: 'Классическая сетка Bloxels: ставишь блоки — получаешь уровень. Несколько экранов подряд.',
    href: '#/editor',
    cta: 'Открыть редактор',
  },
  {
    icon: '📖',
    title: 'Книга правил',
    text: 'У каждого блока есть правила: «когда персонаж входит → +1 очко». Меняй их как хочешь.',
    href: '#/docs',
    cta: 'Как это работает',
  },
  {
    icon: '🧩',
    title: 'Расширения на JS',
    text: 'Пишешь JavaScript — получаешь новые блоки, действия для книги правил и события.',
    href: '#/extensions',
    cta: 'Мастерская',
  },
];

export async function homeView(root) {
  const page = el('div', { class: 'page' });
  mount(
    root,
    page,
    el(
      'section',
      { class: 'hero' },
      el(
        'div',
        { class: 'hero-blocks' },
        ['#3ddc84', '#4c9aff', '#ffd93d', '#ff5d73', '#b07cff', '#4ce0e0', '#ff9f43', '#3ddc84', '#4c9aff', '#ffd93d'].map(
          (color, i) => el('i', { style: { background: color, opacity: 1 - i * 0.04 } })
        )
      ),
      el('span', { class: 'badge green' }, 'конструктор игр'),
      el('h1', {}, 'Собери свою игру ', el('br'), 'из блоков'),
      el(
        'p',
        {},
        'TurboBloxels — это доска 13×13, персонаж из пикселей и «Книга правил», где ты сам решаешь, ',
        'что делает каждый блок. А ещё можно писать расширения на JavaScript и добавлять в игру ',
        'собственные блоки.'
      ),
      el(
        'div',
        { class: 'hero-actions' },
        el('a', { class: 'btn', href: '#/editor' }, 'Создать уровень'),
        el('a', { class: 'btn btn-ghost', href: '#/levels' }, 'Играть в чужие'),
        el('a', { class: 'btn btn-ghost', href: '#/extensions' }, '🧩 Расширения')
      ),
      el(
        'div',
        { class: 'stats' },
        stat('levels', 'уровней'),
        stat('users', 'игроков'),
        stat('extensions', 'расширений'),
        stat('plays', 'прохождений')
      )
    )
  );

  // ---- черновики ----------------------------------------------------------
  const drafts = listDrafts();
  const draftCards = el('div', { class: 'grid-cards' });
  page.appendChild(sectionHead('Мои черновики', el('a', { class: 'btn btn-sm', href: '#/editor' }, '+ Новый уровень')));
  page.appendChild(
    el(
      'div',
      { class: 'grid-cards' },
      el(
        'button',
        { class: 'card', style: { cursor: 'pointer', textAlign: 'left' }, onclick: () => (location.hash = '#/editor') },
        el(
          'div',
          { class: 'thumb', style: { display: 'grid', placeItems: 'center', fontSize: '42px', color: 'var(--green)' } },
          '+'
        ),
        el('h3', { style: { marginTop: '10px' } }, 'Новый уровень'),
        el('p', { class: 'small muted', style: { margin: 0 } }, 'Пустая доска 13×13, с чего начать')
      ),
      drafts.map((draft) => {
        const firstScreen = draft.level?.screens?.[0]?.cells;
        return el(
          'article',
          { class: 'card level-card' },
          el('div', { class: 'thumb' }, boardThumb(firstScreen, 156)),
          el('h3', { style: { margin: 0 } }, draft.title || 'Без названия'),
          el(
            'div',
            { class: 'level-meta' },
            el('span', { class: 'badge' }, `${draft.level?.screens?.length || 1} экр.`),
            el('span', {}, fmtDate(draft.updatedAt))
          ),
          el(
            'div',
            { class: 'row', style: { gap: '6px' } },
            el('button', { class: 'btn btn-sm', onclick: () => (location.hash = `#/editor/${draft.id}`) }, 'Продолжить'),
            el('button', { class: 'btn btn-ghost btn-sm', onclick: () => (location.hash = `#/play/draft:${draft.id}`) }, 'Играть'),
            el(
              'button',
              {
                class: 'btn btn-ghost btn-sm',
                onclick: () =>
                  confirmDialog('Удалить черновик?', `«${draft.title}» будет удалён безвозвратно.`, () => {
                    deleteDraft(draft.id);
                    toast('Черновик удалён', 'info');
                    location.reload();
                  }),
              },
              '✕'
            )
          )
        );
      })
    )
  );
  void draftCards;

  // ---- уровни сообщества --------------------------------------------------
  const levelsBox = el('div', { class: 'grid-cards' }, el('p', { class: 'muted' }, 'Загружаю уровни…'));
  page.appendChild(sectionHead('Свежие уровни', el('a', { class: 'btn btn-ghost btn-sm', href: '#/levels' }, 'Все уровни')));
  page.appendChild(levelsBox);

  // ---- фичи ---------------------------------------------------------------
  page.appendChild(sectionHead('Как это устроено'));
  page.appendChild(
    el(
      'div',
      { class: 'grid-cards' },
      FEATURES.map((feature) =>
        el(
          'article',
          { class: 'card' },
          el('div', { style: { fontSize: '30px', marginBottom: '8px' } }, feature.icon),
          el('h3', {}, feature.title),
          el('p', { class: 'small muted' }, feature.text),
          el('a', { class: 'btn btn-ghost btn-sm', href: feature.href }, feature.cta)
        )
      )
    )
  );

  page.appendChild(
    el(
      'p',
      { class: 'small dim', style: { marginTop: '28px' } },
      'TurboBloxels — открытый проект (AGPL-3.0). Вдохновлён конструктором Bloxels, но написан с нуля: ',
      'клиент на чистом JS, сервер на Node.js, расширения исполняются в песочнице.'
    )
  );

  const cleanups = [];

  // Данные подтягиваем асинхронно, чтобы страница рисовалась сразу.
  (async () => {
    try {
      const data = await api.levels({ sort: 'recent' });
      const levels = (data.levels || []).slice(0, 6);
      mount(
        levelsBox,
        levels.length
          ? levels.map((level) =>
              levelCard(level, {
                onOpen: () => (location.hash = `#/play/${level.id}`),
                onPlay: () => (location.hash = `#/play/${level.id}`),
              })
            )
          : el('div', { class: 'empty' }, 'Пока нет опубликованных уровней. Стань первым!')
      );
    } catch (err) {
      mount(levelsBox, el('div', { class: 'empty' }, `Не удалось загрузить уровни: ${err.message}`));
    }
  })();

  (async () => {
    try {
      await refreshExtensionList();
      const own = store.extList.filter((ext) => !ext.mine).slice(0, 4);
      if (own.length) {
        page.appendChild(sectionHead('Расширения сообщества', el('a', { class: 'btn btn-ghost btn-sm', href: '#/extensions' }, 'Все')));
        page.appendChild(
          el(
            'div',
            { class: 'grid-cards' },
            own.map((ext) =>
              el(
                'article',
                { class: 'card' },
                el(
                  'div',
                  { class: 'row', style: { gap: '8px' } },
                  el('span', { style: { fontSize: '24px' } }, '🧩'),
                  el('div', {}, el('h3', { style: { margin: 0 } }, ext.name), el('span', { class: 'small dim' }, `v${ext.version} · ${ext.author}`))
                ),
                el('p', { class: 'small muted', style: { marginTop: '8px' } }, ext.description || 'Без описания'),
                el(
                  'div',
                  { class: 'row wrap', style: { gap: '5px', marginTop: '8px' } },
                  (ext.blocks || []).slice(0, 6).map((b) =>
                    el('span', { class: 'badge' }, el('span', { style: { width: '8px', height: '8px', borderRadius: '2px', background: b.color, display: 'inline-block' } }), b.name)
                  )
                ),
                el(
                  'div',
                  { class: 'row', style: { gap: '6px', marginTop: '10px' } },
                  el(
                    'button',
                    {
                      class: `btn btn-sm${store.installed.has(ext.id) ? ' btn-ghost' : ''}`,
                      onclick: async () => {
                        if (store.installed.has(ext.id)) {
                          uninstallExtension(ext.id);
                          toast('Расширение выключено', 'info');
                        } else {
                          try {
                            const { fetchExtension } = await import('../store.js');
                            await fetchExtension(ext.id);
                            installExtension(ext.id);
                            store.hostIds = '';
                            await ensureHost();
                            toast(`«${ext.name}» установлено — блоки уже в редакторе`, 'success');
                          } catch (err) {
                            toast(err.message, 'error');
                          }
                        }
                        location.reload();
                      },
                    },
                    store.installed.has(ext.id) ? '✓ Включено' : 'Установить'
                  ),
                  el('a', { class: 'btn btn-ghost btn-sm', href: `#/extensions/${ext.id}` }, 'Код')
                )
              )
            )
          )
        );
      }
    } catch {
      /* не критично */
    }
  })();

  (async () => {
    try {
      const stats = await api.stats();
      for (const [key, value] of Object.entries(stats)) setStat(key, value);
    } catch {
      /* не критично */
    }
  })();

  return { destroy: () => cleanups.forEach((fn) => fn()) };
}

function stat(key, label) {
  return el('div', { class: 'stat' }, el('b', { id: `stat-${key}` }, '—'), el('span', {}, label));
}

function setStat(key, value) {
  const node = document.getElementById(`stat-${key}`);
  if (node) node.textContent = String(value);
}

export { characterThumb };
