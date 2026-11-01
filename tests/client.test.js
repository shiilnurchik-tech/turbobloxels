/**
 * Дымовые тесты клиента в jsdom: проверяем, что вьюхи монтируются без ошибок.
 * Canvas подменяем заглушкой, сеть — фикстурами.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  `<!doctype html><html><body>
    <div class="app">
      <header class="topbar"><a class="brand" href="#/home">TBX</a><nav class="nav" id="nav"></nav><div id="user-slot"></div></header>
      <main id="view"></main>
    </div>
    <div id="toasts"></div><div id="modal-root"></div>
  </body></html>`,
  { url: 'http://localhost:3000/', pretendToBeVisual: true }
);

const { window } = dom;

function mockContext() {
  const gradient = { addColorStop() {} };
  const target = { canvas: null, measureText: () => ({ width: 10 }) };
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      return () => {};
    },
    set(obj, prop, value) {
      obj[prop] = value;
      return true;
    },
  });
}

window.HTMLCanvasElement.prototype.getContext = function getContext() {
  return mockContext();
};
window.HTMLCanvasElement.prototype.toDataURL = function toDataURL() {
  return 'data:image/png;base64,AAAA';
};

globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.CustomEvent = window.CustomEvent;
globalThis.localStorage = window.localStorage;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.fetch = globalThis.fetch = async (url) => {
  const path = String(url).replace('http://localhost:3000', '');
  const json = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  if (path.startsWith('/api/auth/me')) return json({ user: null });
  if (path.startsWith('/api/stats')) return json({ levels: 3, users: 2, extensions: 1, plays: 7 });
  if (path.startsWith('/api/extensions/')) return json({ extension: { id: 'x1', name: 'Демо', source: 'TBX.define({id:"x1",blocks:[{id:"a"}]})', blocks: [] } });
  if (path.startsWith('/api/extensions')) return json({ extensions: [{ id: 'x1', name: 'Демо', version: '1.0.0', description: '', author: 'я', blocks: [], likes: 0 }] });
  if (path.startsWith('/api/levels/')) {
    return json({
      level: {
        id: 'l1',
        title: 'Тест',
        ownerName: 'я',
        plays: 1,
        likes: 0,
        extensionIds: [],
        data: {
          screens: [{ cells: Array.from({ length: 169 }, (_, i) => (i > 150 ? 'ground' : null)) }],
          character: { pixels: new Array(169).fill(null) },
          background: { pixels: new Array(169).fill(null) },
          rules: {},
          settings: {},
        },
      },
      summary: { mine: true },
    });
  }
  if (path.startsWith('/api/levels')) {
    return json({
      levels: [
        {
          id: 'l1',
          title: 'Демо',
          ownerName: 'я',
          plays: 3,
          likes: 1,
          bestScore: 10,
          screens: 1,
          extensionIds: [],
          preview: Array.from({ length: 169 }, (_, i) => (i > 150 ? 'ground' : null)),
        },
      ],
    });
  }
  return json({});
};

async function renderView(viewModule, params = {}) {
  const root = document.getElementById('view');
  root.innerHTML = '';
  const view = await viewModule(root, params);
  return view;
}

test('главная страница рисуется', async () => {
  const { homeView } = await import('../public/js/views/home.js');
  await renderView(homeView);
  assert.match(document.getElementById('view').textContent, /Собери свою игру/);
});

test('страница документации содержит API расширений', async () => {
  const { docsView } = await import('../public/js/views/docs.js');
  await renderView(docsView);
  const text = document.getElementById('view').textContent;
  assert.match(text, /Книга правил/);
  assert.match(text, /TBX\.define/);
  assert.match(text, /sandbox/);
});

test('каталог уровней монтируется и показывает карточку', async () => {
  const { levelsView } = await import('../public/js/views/levels.js');
  await renderView(levelsView, { tab: 'community' });
  await new Promise((resolve) => setTimeout(resolve, 60));
  const text = document.getElementById('view').textContent;
  assert.match(text, /Уровни/);
  assert.match(text, /Демо/);
});

test('редактор монтируется и рисует доску 13×13', async () => {
  const { editorView } = await import('../public/js/views/editor.js');
  const view = await renderView(editorView, {});
  await new Promise((resolve) => setTimeout(resolve, 30));
  const canvas = document.querySelector('#view canvas');
  assert.ok(canvas, 'есть canvas доски');
  assert.equal(canvas.width, 13 * 36);
  const tabs = [...document.querySelectorAll('#view .tab')].map((node) => node.textContent);
  assert.deepEqual(tabs, ['Доска', 'Персонаж', 'Фон', 'Книга правил']);
  // Переключаемся на книгу правил — она должна показать блоки.
  const rulesTab = [...document.querySelectorAll('#view .tab')].find((node) => node.textContent === 'Книга правил');
  rulesTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.match(document.getElementById('view').textContent, /Правила блока/);
  view.destroy?.();
});

test('мастерская расширений монтируется с кодом по умолчанию', async () => {
  const { extensionsView } = await import('../public/js/views/extensions.js');
  const view = await renderView(extensionsView, {});
  await new Promise((resolve) => setTimeout(resolve, 40));
  const area = document.querySelector('#view textarea.code-editor');
  assert.ok(area, 'есть редактор кода');
  assert.match(area.value, /TBX\.define/);
  const text = document.getElementById('view').textContent;
  assert.match(text, /Расширения/);
  assert.match(text, /Установить|Включено/);
  view.destroy?.();
});

test('игра запускается на уровне из облака', async () => {
  const { playView } = await import('../public/js/views/play.js');
  const view = await renderView(playView, { id: 'l1' });
  await new Promise((resolve) => setTimeout(resolve, 60));
  const canvas = document.querySelector('#view .game-stage canvas');
  assert.ok(canvas, 'canvas игры на месте');
  assert.match(document.getElementById('view').textContent, /Тест/);
  view.destroy?.();
});

test('локальный режим: каталог и игра работают без сервера', async () => {
  const api = await import('../public/js/api.js');
  const { resetLocalDb, getLocalDb } = await import('../public/js/localdb.js');
  resetLocalDb();
  api.setApiMode('local');
  assert.equal(api.apiMode(), 'local');

  const { levelsView } = await import('../public/js/views/levels.js');
  await renderView(levelsView, { tab: 'community' });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.match(document.getElementById('view').textContent, /Первый прыжок/);

  const { playView } = await import('../public/js/views/play.js');
  const view = await renderView(playView, { id: 'l_demo_local' });
  await new Promise((resolve) => setTimeout(resolve, 80));
  const canvas = document.querySelector('#view .game-stage canvas');
  assert.ok(canvas, 'canvas игры на месте');
  assert.match(document.getElementById('view').textContent, /Первый прыжок/);
  assert.equal(getLocalDb().levels[0].plays, 1, 'запуск уровня засчитан локально');
  view.destroy?.();
});
