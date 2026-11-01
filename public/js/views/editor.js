/** Редактор уровня: доска, персонаж, фон и книга правил. */
import { el, mount, clear, toast, confirmDialog, modal, button } from '../dom.js';
import { api } from '../api.js';
import { store, ensureHost, currentRegistry, getDraft, makeDraft, saveDraft } from '../store.js';
import { CHAR_COLORS, POWERS, BLOCK_GROUPS, GRID, powersFromPixels } from '../blocks.js';
import { GridEditor } from '../editor/grid.js';
import { createRulebook } from '../editor/rulebook.js';
import { boardThumb, powerChips } from './common.js';
import { authModal } from './auth.js';
import { normalizeLevel, createEmptyLevel } from '../game/world.js';

const TABS = [
  { id: 'board', label: 'Доска' },
  { id: 'character', label: 'Персонаж' },
  { id: 'background', label: 'Фон' },
  { id: 'rules', label: 'Книга правил' },
];

const TOOLS = [
  { id: 'brush', icon: '✏️', title: 'Кисть (B)' },
  { id: 'eraser', icon: '🧽', title: 'Ластик (E)' },
  { id: 'fill', icon: '🪣', title: 'Заливка (F)' },
  { id: 'picker', icon: '💧', title: 'Пипетка (I)' },
];

export async function editorView(root, params) {
  let draft = params.id ? getDraft(params.id) : null;
  if (!draft) {
    draft = makeDraft({ level: createEmptyLevel() });
  }
  draft.level = normalizeLevel(draft.level);

  const state = {
    tab: 'board',
    tool: 'brush',
    screen: 0,
    block: 'ground',
    color: 'green',
    dirty: false,
    publishing: false,
  };

  await ensureHost().catch(() => {});
  const registry = currentRegistry();
  const extActions = [];
  for (const manifest of registry.manifests) {
    for (const action of manifest.actions || []) {
      extActions.push({ value: `${manifest.id}:${action.id}`, label: `${manifest.name} → ${action.name}` });
    }
  }

  const grids = { board: null, character: null, background: null };
  let rulebook = null;

  const editorEl = el('div', { class: 'editor' });
  const headEl = el('div', { class: 'editor-head' });
  const bodyEl = el('div', { class: 'editor-body' });
  editorEl.append(headEl, bodyEl);
  mount(root, el('div', { class: 'page wide' }, editorEl));

  // ---- шапка --------------------------------------------------------------
  const titleInput = el('input', {
    class: 'title-input',
    value: draft.title,
    maxLength: 60,
    placeholder: 'Название уровня',
    oninput: (event) => {
      draft.title = event.target.value;
      markDirty();
    },
  });

  const tabsEl = el(
    'div',
    { class: 'tabs' },
    TABS.map((tab) =>
      el(
        'button',
        {
          class: `tab${state.tab === tab.id ? ' active' : ''}`,
          dataset: { tab: tab.id },
          onclick: () => {
            state.tab = tab.id;
            renderTabButtons();
            renderBody();
          },
        },
        tab.label
      )
    )
  );

  function renderTabButtons() {
    tabsEl.querySelectorAll('.tab').forEach((node) => {
      node.classList.toggle('active', node.dataset.tab === state.tab);
    });
  }

  const saveBtn = el('button', { class: 'btn btn-ghost btn-sm', onclick: () => save(true) }, '💾 Сохранить');
  const playBtn = el('button', { class: 'btn btn-blue btn-sm', onclick: playtest }, '▶ Проверить');
  const publishBtn = el('button', { class: 'btn btn-sm', onclick: publish }, '🚀 Опубликовать');

  mount(
    headEl,
    titleInput,
    tabsEl,
    el('div', { class: 'spacer' }),
    el(
      'div',
      { class: 'row', style: { gap: '6px' } },
      el('button', { class: 'icon-btn', title: 'Экспорт JSON', onclick: exportJson }, '⤓'),
      el('button', { class: 'icon-btn', title: 'Импорт JSON', onclick: importJson }, '⤒'),
      el('button', { class: 'icon-btn', title: 'Настройки уровня', onclick: openSettings }, '⚙'),
      saveBtn,
      playBtn,
      publishBtn
    )
  );

  // ---- тело ---------------------------------------------------------------
  const toolsEl = el('aside', { class: 'tools' });
  const canvasCard = el('section', { class: 'canvas-card' });
  const paletteEl = el('aside', { class: 'palette' });

  function renderBody() {
    clear(bodyEl);
    bodyEl.classList.toggle('rules-mode', state.tab === 'rules');
    if (state.tab === 'rules') {
      rulebook = createRulebook({
        level: draft.level,
        registry,
        extActions,
        onChange: () => {
          markDirty();
          renderPaletteSummary();
        },
      });
      bodyEl.append(rulebook.node, paletteEl);
      renderRulesPalette();
      return;
    }
    bodyEl.append(toolsEl, canvasCard, paletteEl);
    renderTools();
    renderCanvasArea();
    renderPalette();
  }

  function renderTools() {
    mount(
      toolsEl,
      TOOLS.map((tool) =>
        el(
          'button',
          {
            class: `icon-btn tool-btn${state.tool === tool.id ? ' active' : ''}`,
            title: tool.title,
            dataset: { tool: tool.id },
            onclick: () => {
              state.tool = tool.id;
              activeGrid()?.setTool(tool.id);
              renderTools();
            },
          },
          tool.icon
        )
      ),
      el('div', { style: { height: '6px' } }),
      el('button', { class: 'icon-btn tool-btn', title: 'Отменить (Ctrl+Z)', onclick: () => activeGrid()?.undo() }, '↶'),
      el('button', { class: 'icon-btn tool-btn', title: 'Повторить (Ctrl+Shift+Z)', onclick: () => activeGrid()?.redo() }, '↷'),
      el('button', { class: 'icon-btn tool-btn', title: 'Очистить', onclick: clearGrid }, '🗑')
    );
  }

  function activeGrid() {
    if (state.tab === 'board') return grids.board;
    if (state.tab === 'character') return grids.character;
    if (state.tab === 'background') return grids.background;
    return null;
  }

  function clearGrid() {
    const grid = activeGrid();
    if (!grid) return;
    confirmDialog('Очистить всё?', 'Содержимое этой вкладки будет стёрто (можно отменить через Ctrl+Z).', () => grid.clear());
  }

  function boardPalette() {
    const swatches = [];
    for (const group of BLOCK_GROUPS) {
      const defs = registry.list.filter((def) => def.group === group.id);
      if (!defs.length) continue;
      swatches.push(
        el(
          'div',
          { class: 'palette-group' },
          el('h4', {}, group.name === 'Из расширений' ? `Из расширений (${new Set(defs.map((d) => d.extId)).size})` : group.name),
          el(
            'div',
            { class: 'palette-grid' },
            defs.map((def) =>
              el(
                'button',
                {
                  class: `swatch${state.block === def.id ? ' active' : ''}`,
                  title: def.desc || def.name,
                  dataset: { block: def.id },
                  onclick: () => {
                    state.block = def.id;
                    state.tool = state.tool === 'eraser' ? 'brush' : state.tool;
                    grids.board?.setBrush(def.id);
                    grids.board?.setTool(state.tool);
                    renderTools();
                    renderPalette();
                  },
                },
                el('span', { class: 'chip', style: { background: def.color } }),
                el('span', { class: 'name' }, def.name)
              )
            )
          )
        )
      );
    }
    return swatches;
  }

  function colorPalette(selected, onSelect) {
    return el(
      'div',
      { class: 'palette-group' },
      el('h4', {}, 'Цвета'),
      el(
        'div',
        { class: 'palette-grid' },
        CHAR_COLORS.map((color) =>
          el(
            'button',
            {
              class: `swatch${selected === color.id ? ' active' : ''}`,
              title: `${color.name}${color.power ? ' — ' + POWERS[color.power].name : ''}`,
              onclick: () => onSelect(color.id),
            },
            el('span', { class: 'chip', style: { background: color.hex } }),
            el('span', { class: 'name' }, color.name)
          )
        )
      )
    );
  }

  function renderPalette() {
    if (state.tab === 'board') {
      mount(
        paletteEl,
        boardPalette(),
        el(
          'p',
          { class: 'hint' },
          'ЛКМ — рисовать, ПКМ — стирать. ',
          'Горячие клавиши: ',
          el('kbd', {}, 'B'),
          ' ',
          el('kbd', {}, 'E'),
          ' ',
          el('kbd', {}, 'F'),
          ' ',
          el('kbd', {}, 'I'),
          '.'
        )
      );
      return;
    }
    if (state.tab === 'character') {
      mount(
        paletteEl,
        colorPalette(state.color, (id) => {
          state.color = id;
          grids.character?.setBrush(id);
          renderPalette();
        }),
        el('h4', { style: { fontSize: '11.5px', color: 'var(--dim)', textTransform: 'uppercase' } }, 'Способности'),
        el('div', { class: 'row wrap', id: 'powers-box', style: { gap: '6px' } }),
        el(
          'p',
          { class: 'hint' },
          'Каждый цвет в рисунке даёт способность: ',
          Object.values(POWERS)
            .map((p) => `${p.icon} ${p.name.toLowerCase()}`)
            .join(', '),
          '.'
        )
      );
      updatePowers();
      return;
    }
    if (state.tab === 'background') {
      mount(
        paletteEl,
        colorPalette(state.color, (id) => {
          state.color = id;
          grids.background?.setBrush(id);
          renderPalette();
        }),
        el('p', { class: 'hint' }, 'Рисунок фона повторяется за уровнем с параллаксом. Пустой фон — небо с облаками и холмами.')
      );
    }
  }

  function updatePowers() {
    const box = document.getElementById('powers-box');
    if (!box) return;
    const powers = powersFromPixels(grids.character?.value || draft.level.character.pixels);
    mount(box, powers.length ? powerChips(powers) : el('span', { class: 'small dim' }, 'пока нет'));
  }

  function renderRulesPalette() {
    const info = registry.manifests.length
      ? el(
          'p',
          { class: 'small muted' },
          'Действия расширений: ',
          extActions.length ? extActions.map((a) => a.label).join(', ') : 'нет'
        )
      : el('p', { class: 'small muted' }, 'Установи расширение — и его блоки с правилами появятся в книге.');
    mount(
      paletteEl,
      el('h3', {}, 'Как читать правило'),
      el(
        'p',
        { class: 'small muted' },
        'Правило срабатывает, когда происходит событие у блока. Условия проверяются до действий. ',
        'Правило можно выключить, удалив его — тогда вернутся стандартные.'
      ),
      el('h3', { style: { marginTop: '14px' } }, 'События'),
      el(
        'ul',
        { class: 'small muted', style: { paddingLeft: '18px' } },
        [
          'вход — персонаж зашёл в клетку',
          'касание — любой контакт (не чаще 2 раз в секунду)',
          'стоит — на блоке сверху',
          'приземление — удар сверху',
          'удар снизу — прыжок головой',
          'каждые N секунд — таймер',
          'кнопка E — рядом с блоком',
          'старт — в начале уровня',
        ].map((text) => el('li', {}, text))
      ),
      el('h3', { style: { marginTop: '14px' } }, 'Расширения'),
      info
    );
  }

  function renderPaletteSummary() {
    if (state.tab === 'rules') renderRulesPalette();
  }

  function renderCanvasArea() {
    const isBoard = state.tab === 'board';
    const value =
      state.tab === 'board'
        ? draft.level.screens[state.screen]?.cells
        : state.tab === 'character'
          ? draft.level.character.pixels
          : draft.level.background.pixels;
    const palette = isBoard
      ? registry.list.map((def) => ({ id: def.id, color: def.color }))
      : CHAR_COLORS.map((color) => ({ id: color.id, color: color.hex }));

    const key = state.tab;
    if (!grids[key]) {
      grids[key] = new GridEditor({
        cellSize: 36,
        value,
        palette,
        tool: state.tool,
        onPick: (id) => {
          state.block = id;
          grids.board?.setBrush(id);
          state.tool = 'brush';
          grids.board?.setTool('brush');
          renderTools();
          renderPalette();
        },
        onChange: (cells) => {
          if (state.tab === 'board') draft.level.screens[state.screen].cells = cells.slice();
          else if (state.tab === 'character') {
            draft.level.character.pixels = cells.slice();
            updatePowers();
          } else draft.level.background.pixels = cells.slice();
          markDirty();
        },
      });
    } else {
      grids[key].setPalette(palette);
      grids[key].setValue(value);
    }
    grids[key].setBrush(isBoard ? state.block : state.color);
    grids[key].setTool(state.tool);

    const screensBar = el(
      'div',
      { class: 'screens-bar' },
      el('button', { class: 'icon-btn', title: 'Предыдущий экран', onclick: () => shiftScreen(-1) }, '◀'),
      (draft.level.screens || []).map((_, index) =>
        el(
          'button',
          {
            class: `screen-dot${index === state.screen ? ' active' : ''}`,
            title: `Экран ${index + 1}`,
            onclick: () => {
              state.screen = index;
              grids.board.setValue(draft.level.screens[index].cells);
              renderCanvasArea();
            },
          },
          String(index + 1)
        )
      ),
      el('button', { class: 'icon-btn', title: 'Следующий экран', onclick: () => shiftScreen(1) }, '▶'),
      el('button', { class: 'icon-btn', title: 'Добавить экран справа', onclick: addScreen }, '+'),
      el('button', { class: 'icon-btn', title: 'Удалить текущий экран', onclick: removeScreen }, '🗑')
    );

    const views = [
      el('div', { class: 'row', style: { gap: '10px' } },
        el('span', { class: 'badge' }, `Клетка 13×13`),
        el('span', { class: 'badge green' }, `Экран ${state.screen + 1} из ${draft.level.screens.length}`)
      ),
      grids[key].node,
      isBoard ? screensBar : null,
      el(
        'p',
        { class: 'hint' },
        isBoard
          ? 'Ставь блоки на доску. Затем загляни в «Книгу правил» и реши, что каждый блок делает.'
          : state.tab === 'character'
            ? 'Нарисуй своего персонажа. Цвета дают способности — они появятся в игре.'
            : 'Нарисуй фон из 13×13 пикселей. Он будет медленно прокручиваться за уровнем.'
      ),
    ];
    mount(canvasCard, views);
  }

  function shiftScreen(delta) {
    const next = state.screen + delta;
    if (next < 0 || next >= draft.level.screens.length) return;
    state.screen = next;
    if (grids.board) grids.board.setValue(draft.level.screens[next].cells);
    renderCanvasArea();
  }

  function addScreen() {
    if (draft.level.screens.length >= 12) return toast('Максимум 12 экранов', 'error');
    draft.level.screens.push({ cells: new Array(GRID * GRID).fill(null) });
    state.screen = draft.level.screens.length - 1;
    if (grids.board) grids.board.setValue(draft.level.screens[state.screen].cells);
    markDirty();
    renderCanvasArea();
  }

  function removeScreen() {
    if (draft.level.screens.length <= 1) return toast('Нужен хотя бы один экран', 'error');
    confirmDialog('Удалить экран?', 'Экран будет удалён из уровня.', () => {
      draft.level.screens.splice(state.screen, 1);
      state.screen = Math.max(0, state.screen - 1);
      if (grids.board) grids.board.setValue(draft.level.screens[state.screen].cells);
      markDirty();
      renderCanvasArea();
    });
  }

  // ---- действия -----------------------------------------------------------
  function markDirty() {
    state.dirty = true;
    saveBtn.textContent = '💾 Сохранить •';
  }

  function save(notify = false) {
    // Для доски синхронизируем текущее значение (на случай незакрытого штриха).
    if (grids.board) draft.level.screens[state.screen].cells = grids.board.value.slice();
    if (grids.character) draft.level.character.pixels = grids.character.value.slice();
    if (grids.background) draft.level.background.pixels = grids.background.value.slice();
    saveDraft(draft);
    state.dirty = false;
    saveBtn.textContent = '💾 Сохранить';
    if (notify) toast('Черновик сохранён', 'success');
    return draft;
  }

  function usedExtensionIds() {
    const ids = new Set();
    for (const screen of draft.level.screens) {
      for (const id of screen.cells) {
        if (typeof id === 'string' && id.startsWith('ext:')) ids.add(id.split(':')[1]);
      }
    }
    for (const blockId of Object.keys(draft.level.rules || {})) {
      if (blockId.startsWith('ext:')) ids.add(blockId.split(':')[1]);
    }
    return [...ids].filter(Boolean);
  }

  function thumbnail() {
    try {
      const canvas = boardThumb(draft.level.screens[0]?.cells, 208, { registry });
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  function playtest() {
    save(false);
    location.hash = `#/play/draft:${draft.id}`;
  }

  async function publish() {
    if (state.publishing) return;
    state.publishing = true;
    publishBtn.disabled = true;
    try {
      if (!store.user) {
        const ok = await authModal();
        if (!ok) return;
      }
      save(false);
      const payload = {
        title: draft.title || 'Без названия',
        description: draft.description || '',
        data: draft.level,
        extensionIds: usedExtensionIds(),
        published: true,
        thumb: thumbnail(),
      };
      let levelId = draft.serverId;
      if (levelId) {
        await api.updateLevel(levelId, payload);
      } else {
        const res = await api.createLevel(payload);
        levelId = res.level.id;
      }
      draft.serverId = levelId;
      saveDraft(draft);
      toast('Уровень опубликован! Смотри в «Уровнях».', 'success', 4000);
    } catch (err) {
      toast(err.message, 'error', 4500);
    } finally {
      state.publishing = false;
      publishBtn.disabled = false;
    }
  }

  function openSettings() {
    const name = el('input', { class: 'input', value: draft.title });
    const desc = el('textarea', { class: 'textarea', maxLength: 400 }, draft.description || '');
    const gravity = el('input', { class: 'input', type: 'range', min: '0.4', max: '2', step: '0.1', value: String(draft.level.settings.gravity || 1) });
    const speed = el('input', { class: 'input', type: 'range', min: '0.5', max: '2', step: '0.1', value: String(draft.level.settings.speed || 1) });
    const jump = el('input', { class: 'input', type: 'range', min: '0.5', max: '2', step: '0.1', value: String(draft.level.settings.jump || 1) });
    const body = el(
      'div',
      {},
      el('label', { class: 'field' }, el('span', {}, 'Название'), name),
      el('label', { class: 'field' }, el('span', {}, 'Описание'), desc),
      el('label', { class: 'field' }, el('span', {}, 'Гравитация'), gravity),
      el('label', { class: 'field' }, el('span', {}, 'Скорость'), speed),
      el('label', { class: 'field' }, el('span', {}, 'Прыжок'), jump),
      el('p', { class: 'small dim' }, 'Настройки применяются к уровню целиком и хранятся вместе с ним.')
    );
    const dlg = modal({
      title: 'Настройки уровня',
      body,
      actions: [
        { node: button('Отмена', () => dlg.close(), 'ghost') },
        {
          node: button('Готово', () => {
            draft.title = name.value;
            titleInput.value = name.value;
            draft.description = desc.value;
            draft.level.settings = {
              gravity: Number(gravity.value),
              speed: Number(speed.value),
              jump: Number(jump.value),
            };
            markDirty();
            dlg.close();
          }),
        },
      ],
    });
  }

  function exportJson() {
    save(false);
    const payload = JSON.stringify({ title: draft.title, description: draft.description, level: draft.level }, null, 2);
    const area = el('textarea', { class: 'code-editor', style: { minHeight: '300px' }, readonly: true }, payload);
    const dlg = modal({
      title: 'Экспорт уровня',
      wide: true,
      body: el('div', {}, el('p', { class: 'small muted' }, 'Скопируй JSON, чтобы перенести уровень в другой браузер.'), area),
      actions: [
        {
          node: button('Скопировать', async () => {
            try {
              await navigator.clipboard.writeText(payload);
              toast('JSON скопирован', 'success');
            } catch {
              area.select();
              toast('Нажми Ctrl+C', 'info');
            }
          }, 'blue'),
        },
        { node: button('Закрыть', () => dlg.close(), 'ghost') },
      ],
    });
  }

  function importJson() {
    const area = el('textarea', { class: 'code-editor', style: { minHeight: '300px' }, placeholder: '{ "title": "...", "level": { ... } }' });
    const dlg = modal({
      title: 'Импорт уровня',
      wide: true,
      body: el('div', {}, el('p', { class: 'small muted' }, 'Вставь JSON, полученный из экспорта.'), area),
      actions: [
        { node: button('Отмена', () => dlg.close(), 'ghost') },
        {
          node: button('Импортировать', () => {
            try {
              const parsed = JSON.parse(area.value);
              const level = normalizeLevel(parsed.level || parsed);
              draft.level = level;
              draft.title = String(parsed.title || draft.title).slice(0, 60);
              titleInput.value = draft.title;
              state.screen = 0;
              Object.keys(grids).forEach((key) => {
                if (grids[key]) {
                  grids[key] = null;
                }
              });
              markDirty();
              renderBody();
              dlg.close();
              toast('Уровень импортирован', 'success');
            } catch (err) {
              toast(`Не получилось: ${err.message}`, 'error');
            }
          }),
        },
      ],
    });
  }

  // ---- горячие клавиши ----------------------------------------------------
  const onKey = (event) => {
    const target = event.target;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) activeGrid()?.redo();
      else activeGrid()?.undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save(true);
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'b') setTool('brush');
    else if (key === 'e') setTool('eraser');
    else if (key === 'f') setTool('fill');
    else if (key === 'i') setTool('picker');
    else if (/^[1-9]$/.test(key)) {
      const list = state.tab === 'board' ? registry.list : CHAR_COLORS.map((c) => ({ id: c.id }));
      const item = list[Number(key) - 1];
      if (item) {
        if (state.tab === 'board') state.block = item.id;
        else state.color = item.id;
        activeGrid()?.setBrush(item.id);
        renderPalette();
      }
    }
  };

  function setTool(tool) {
    state.tool = tool;
    activeGrid()?.setTool(tool);
    renderTools();
  }

  const onBeforeUnload = (event) => {
    if (state.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', onBeforeUnload);

  renderBody();

  return {
    destroy() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (state.dirty) save(false);
    },
  };
}
