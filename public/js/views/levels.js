/** Каталог уровней: сообщество и свои. */
import { el, mount, toast, confirmDialog, fmtDate } from '../dom.js';
import { api } from '../api.js';
import { store, listDrafts, deleteDraft, makeDraft, saveDraft } from '../store.js';
import { levelCard, boardThumb, sectionHead } from './common.js';
import { authModal } from './auth.js';

export async function levelsView(root, params) {
  let tab = params.tab === 'mine' ? 'mine' : 'community';
  let search = '';
  let sort = 'recent';

  const page = el('div', { class: 'page' });
  mount(root, page);

  const tabsBar = el('div', { class: 'tabs' });
  const searchInput = el('input', {
    class: 'input',
    placeholder: 'Поиск по названию, описанию или автору…',
    style: { maxWidth: '320px' },
    oninput: (event) => {
      search = event.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(load, 260);
    },
  });
  let searchTimer = 0;

  const sortSelect = el(
    'select',
    {
      class: 'select',
      style: { maxWidth: '190px' },
      onchange: (event) => {
        sort = event.target.value;
        load();
      },
    },
    el('option', { value: 'recent' }, 'Сначала новые'),
    el('option', { value: 'popular' }, 'Популярные'),
    el('option', { value: 'best' }, 'Самые любимые')
  );

  const listBox = el('div', { class: 'grid-cards' }, el('p', { class: 'muted' }, 'Загружаю…'));
  const mineBox = el('div', {});

  function renderTabs() {
    mount(
      tabsBar,
      el(
        'button',
        {
          class: `tab${tab === 'community' ? ' active' : ''}`,
          onclick: () => {
            tab = 'community';
            renderTabs();
            render();
          },
        },
        'Сообщество'
      ),
      el(
        'button',
        {
          class: `tab${tab === 'mine' ? ' active' : ''}`,
          onclick: () => {
            tab = 'mine';
            renderTabs();
            render();
          },
        },
        'Мои уровни'
      )
    );
  }

  function render() {
    clear(page);
    page.append(
      el('h1', {}, 'Уровни'),
      el('p', { class: 'muted' }, 'Играй в чужие уровни или продолжай свои. Все уровни сделаны на доске 13×13.'),
      el('div', { class: 'row wrap', style: { margin: '18px 0' } }, tabsBar, el('div', { class: 'spacer' }), searchInput, sortSelect,
        el('a', { class: 'btn btn-sm', href: '#/editor' }, '+ Создать')),
      tab === 'community' ? listBox : mineBox
    );
    if (tab === 'mine') renderMine();
    else load();
  }

  async function load() {
    if (tab !== 'community') return;
    mount(listBox, el('p', { class: 'muted' }, 'Загружаю…'));
    try {
      const data = await api.levels({ q: search, sort });
      const levels = data.levels || [];
      if (!levels.length) {
        mount(listBox, el('div', { class: 'empty' }, 'Ничего не нашлось. Попробуй другой запрос или создай свой уровень.'));
        return;
      }
      mount(
        listBox,
        levels.map((level) =>
          levelCard(level, {
            onPlay: () => (location.hash = `#/play/${level.id}`),
            onOpen: () => (location.hash = `#/play/${level.id}`),
            onLike: async () => {
              if (!store.user) return toast('Войди, чтобы ставить лайки', 'error');
              try {
                const res = await api.likeLevel(level.id);
                level.likes = res.likes;
                level.liked = res.liked;
                load();
              } catch (err) {
                toast(err.message, 'error');
              }
            },
            onEdit: level.mine ? () => openEditorFor(level) : null,
          })
        )
      );
    } catch (err) {
      mount(listBox, el('div', { class: 'empty' }, `Ошибка: ${err.message}`));
    }
  }

  function openEditorFor(level) {
    // Забираем уровень с сервера в черновик и открываем редактор.
    api
      .level(level.id)
      .then((data) => {
        const draft = makeDraft({
          title: data.level.title,
          description: data.level.description,
          level: data.level.data,
          extensionIds: data.level.extensionIds,
          serverId: data.level.id,
        });
        saveDraft(draft);
        location.hash = `#/editor/${draft.id}`;
      })
      .catch((err) => toast(err.message, 'error'));
  }

  function renderMine() {
    clear(mineBox);
    const drafts = listDrafts();
    const draftSection = el(
      'div',
      {},
      sectionHead('Черновики (в этом браузере)'),
      drafts.length
        ? el(
            'div',
            { class: 'grid-cards' },
            drafts.map((draft) =>
              el(
                'article',
                { class: 'card level-card' },
                el('div', { class: 'thumb' }, boardThumb(draft.level?.screens?.[0]?.cells, 156)),
                el('h3', { style: { margin: 0 } }, draft.title || 'Без названия'),
                el('div', { class: 'level-meta' }, el('span', { class: 'badge' }, `${draft.level?.screens?.length || 1} экр.`), el('span', {}, fmtDate(draft.updatedAt))),
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
                        confirmDialog('Удалить черновик?', 'Действие нельзя отменить.', () => {
                          deleteDraft(draft.id);
                          renderMine();
                        }),
                    },
                    '✕'
                  )
                )
              )
            )
          )
        : el('div', { class: 'empty' }, 'Черновиков нет. ', el('a', { href: '#/editor' }, 'Создать уровень'))
    );

    const cloudSection = el('div', {}, sectionHead('Опубликованные уровни'), el('p', { class: 'muted' }, 'Загружаю…'));

    mineBox.append(draftSection, cloudSection);

    if (!store.user) {
      mount(
        cloudSection,
        sectionHead('Опубликованные уровни'),
        el(
          'div',
          { class: 'empty' },
          'Войди в аккаунт, чтобы видеть свои опубликованные уровни. ',
          el('button', { class: 'btn btn-sm', onclick: async () => { if (await authModal()) renderMine(); } }, 'Войти')
        )
      );
      return;
    }

    api
      .levels({ mine: '1' })
      .then((data) => {
        const levels = data.levels || [];
        mount(
          cloudSection,
          sectionHead('Опубликованные уровни'),
          levels.length
            ? el(
                'div',
                { class: 'grid-cards' },
                levels.map((level) =>
                  levelCard(level, {
                    onPlay: () => (location.hash = `#/play/${level.id}`),
                    onOpen: () => (location.hash = `#/play/${level.id}`),
                    onEdit: () => openEditorFor(level),
                    onLike: () => toast('Свои уровни лайкать не обязательно 🙂', 'info'),
                  })
                )
              )
            : el('div', { class: 'empty' }, 'Ещё ничего не опубликовано. Открой редактор и нажми «Опубликовать».')
        );
      })
      .catch((err) => mount(cloudSection, sectionHead('Опубликованные уровни'), el('div', { class: 'empty' }, `Ошибка: ${err.message}`)));
  }

  renderTabs();
  render();

  return {};
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
