/** Мастерская расширений: пишем JS, проверяем в песочнице, публикуем. */
import { el, mount, clear, toast, modal, button, fmtDate } from '../dom.js';
import { api } from '../api.js';
import {
  store,
  refreshExtensionList,
  installExtension,
  uninstallExtension,
  isInstalled,
  ensureHost,
  fetchExtension,
  cacheExtension,
} from '../store.js';
import { ExtRuntime } from '../ext/runtime.js';

const TEMPLATE = `// Расширение TurboBloxels.
// TBX.define() объявляет блоки, их правила и функции-обработчики.
TBX.define({
  id: 'my-pack',
  name: 'Мой набор',
  version: '1.0.0',
  description: 'Пара новых блоков: прыгучее желе и блок-телепорт.',

  blocks: [
    {
      id: 'jelly',
      name: 'Желе',
      color: '#ff8fd0',
      solid: true,
      restitution: 1.2,   // прыгучесть
      friction: 0.9,
      rules: [
        {
          trigger: 'stomp',
          actions: [
            { type: 'bounce', value: 20 },
            { type: 'sound', value: 'bounce' },
          ],
        },
      ],
      on: {
        enter(ctx) {
          TBX.log('желе на', ctx.x, ctx.y);
        },
      },
    },
    {
      id: 'warp',
      name: 'Портал',
      color: '#b07cff',
      solid: false,
      rules: [
        {
          trigger: 'enter',
          actions: [
            { type: 'teleport', value: 'goal' },
            { type: 'sound', value: 'zap' },
            { type: 'particles', value: '#b07cff' },
          ],
        },
      ],
    },
  ],

  hooks: {
    onStart(ctx) {
      TBX.log('уровень стартовал, сердец:', ctx.hearts);
    },
    onTick(ctx) {
      // выполняется ~4 раза в секунду
    },
  },
});
`;

export async function extensionsView(root, params) {
  const page = el('div', { class: 'page' });
  mount(root, page);

  let catalog = [];
  let previewManifest = null;
  let previewRuntime = null;
  let publishedId = null;

  const nameInput = el('input', { class: 'input', value: 'Мой набор', maxLength: 60 });
  const versionInput = el('input', { class: 'input', value: '1.0.0', maxLength: 20, style: { maxWidth: '120px' } });
  const descInput = el('input', { class: 'input', placeholder: 'Что делает расширение', maxLength: 500 });
  const codeArea = el('textarea', { class: 'code-editor', spellcheck: false }, TEMPLATE);
  const logBox = el('div', { class: 'log' }, el('div', { class: 'l-log' }, 'Здесь появятся сообщения песочницы.'));
  const resultBox = el('div', {});
  const catalogBox = el('div', {}, el('p', { class: 'muted small' }, 'Загружаю…'));
  const mineBox = el('div', {});
  const installBtn = el('button', { class: 'btn btn-ghost btn-sm', onclick: toggleInstall }, 'Установить');
  let currentKey = null;

  codeArea.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      const start = codeArea.selectionStart;
      const end = codeArea.selectionEnd;
      codeArea.value = `${codeArea.value.slice(0, start)}  ${codeArea.value.slice(end)}`;
      codeArea.selectionStart = codeArea.selectionEnd = start + 2;
    }
  });

  function log(level, text) {
    const node = el('div', { class: `l-${level}` }, text);
    logBox.appendChild(node);
    logBox.scrollTop = logBox.scrollHeight;
    while (logBox.childNodes.length > 120) logBox.removeChild(logBox.firstChild);
  }

  function clearLog() {
    clear(logBox);
  }

  const testBtn = el('button', { class: 'btn btn-blue', onclick: () => runTest() }, '⚡ Проверить');
  const publishBtn = el('button', { class: 'btn', onclick: () => publish() }, '🚀 Опубликовать');
  const examplesBtn = el('button', { class: 'btn btn-ghost btn-sm', onclick: openExamples }, '📦 Примеры');

  mount(
    page,
    el('h1', {}, 'Расширения'),
    el(
      'p',
      { class: 'muted', style: { maxWidth: '760px' } },
      'Расширение — это JavaScript-файл, который добавляет новые блоки и правила. ',
      'Код исполняется в изолированной песочнице (iframe без доступа к странице и сети). ',
      'Свои блоки сразу появляются в редакторе и в «Книге правил».'
    ),
    el(
      'div',
      { class: 'row wrap', style: { margin: '16px 0' } },
      el('a', { class: 'btn btn-ghost btn-sm', href: '#/docs' }, '📖 Документация API'),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: refreshCatalog }, '↻ Обновить каталог'),
      el('div', { class: 'spacer' }),
      el('span', { class: 'badge' }, `установлено: ${store.installed.size}`)
    ),
    el(
      'div',
      { class: 'ext-layout' },
      el(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
        el(
          'section',
          { class: 'card' },
          el(
            'div',
            { class: 'row wrap', style: { marginBottom: '10px' } },
            el('div', { style: { flex: '1 1 220px' } }, el('label', { class: 'field' }, el('span', {}, 'Название'), nameInput)),
            el('div', {}, el('label', { class: 'field' }, el('span', {}, 'Версия'), versionInput))
          ),
          el('label', { class: 'field' }, el('span', {}, 'Описание'), descInput),
          el('label', { class: 'field' }, el('span', {}, 'Код расширения (JavaScript)'), codeArea),
          el(
            'div',
            { class: 'row wrap', style: { gap: '8px' } },
            testBtn,
            publishBtn,
            installBtn,
            examplesBtn,
            el('div', { class: 'spacer' }),
            el('a', { class: 'btn btn-ghost btn-sm', href: '#/docs' }, 'Как писать?')
          ),
          el('div', { style: { height: '12px' } }),
          resultBox,
          el('h4', { style: { margin: '6px 0' } }, 'Песочница'),
          logBox
        ),
        el('section', { class: 'card' }, el('h3', {}, 'Мои расширения'), mineBox)
      ),
      el(
        'aside',
        { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        el(
          'section',
          { class: 'card', style: { padding: '12px' } },
          el('h3', { style: { fontSize: '15px' } }, 'Что умеет расширение'),
          el(
            'ul',
            { class: 'small muted', style: { paddingLeft: '18px', margin: 0, lineHeight: 1.7 } },
            el('li', {}, 'добавлять блоки с цветом и пиксельным узором 13×13'),
            el('li', {}, 'задавать физику: твёрдость, трение, прыгучесть'),
            el('li', {}, 'добавлять правила в «Книгу правил»'),
            el('li', {}, 'свои действия для правил через TBX.action()'),
            el('li', {}, 'реагировать на события: enter, touch, stomp, tick…')
          )
        ),
        el('section', { class: 'card', style: { padding: '12px' } }, el('h3', { style: { fontSize: '15px' } }, 'Каталог'), catalogBox)
      )
    )
  );

  // ---- проверка в песочнице ----------------------------------------------
  async function runTest({ quiet = false } = {}) {
    clearLog();
    clear(resultBox);
    previewManifest = null;
    testBtn.disabled = true;
    if (previewRuntime) {
      previewRuntime.dispose();
      previewRuntime = null;
    }
    previewRuntime = new ExtRuntime('preview');
    previewRuntime.onLog = (entry) => log(entry.level, entry.text);
    try {
      const manifest = await previewRuntime.load(codeArea.value);
      previewManifest = manifest;
      const blocks = manifest.blocks || [];
      currentKey = manifest.id;
      installBtn.textContent = isInstalled(manifest.id) ? 'Выключить' : 'Установить';
      installBtn.disabled = false;
      mount(
        resultBox,
        el(
          'div',
          { class: 'card', style: { background: 'var(--bg-2)' } },
          el('div', { class: 'row wrap' },
            el('span', { class: 'badge green' }, '✓ работает'),
            el('span', { class: 'badge' }, `${manifest.name} v${manifest.version}`),
            el('span', { class: 'badge purple' }, `id: ${manifest.id}`)
          ),
          el('p', { class: 'small muted', style: { margin: '8px 0 6px' } }, manifest.description || 'Без описания'),
          el(
            'div',
            { class: 'row wrap', style: { gap: '6px' } },
            blocks.map((block) =>
              el(
                'span',
                { class: 'badge' },
                el('span', { style: { width: '10px', height: '10px', borderRadius: '3px', background: block.color, display: 'inline-block' } }),
                block.name,
                block.hooks?.length ? el('span', { class: 'dim' }, ` (${block.hooks.join(',')})`) : null
              )
            )
          ),
          (manifest.actions || []).length
            ? el('p', { class: 'small muted', style: { marginTop: '8px' } }, `Действия для книги правил: ${manifest.actions.map((a) => a.name).join(', ')}`)
            : null
        )
      );
      if (!quiet) toast('Расширение загружено без ошибок', 'success');
      return manifest;
    } catch (err) {
      log('error', err.message);
      if (!quiet) toast(err.message, 'error', 5000);
      return null;
    } finally {
      testBtn.disabled = false;
      if (!previewManifest) installBtn.disabled = true;
    }
  }

  async function publish() {
    const manifest = await runTest({ quiet: true });
    if (!manifest) {
      toast('Сначала исправь ошибки в коде', 'error');
      return;
    }
    const { authModal } = await import('./auth.js');
    if (!store.user) {
      const ok = await authModal();
      if (!ok) return;
    }
    publishBtn.disabled = true;
    try {
      const payload = {
        name: nameInput.value.trim() || manifest.name,
        version: versionInput.value.trim() || manifest.version,
        description: descInput.value.trim() || manifest.description,
        source: codeArea.value,
        blocks: (manifest.blocks || []).map((b) => ({ id: b.id, name: b.name, color: b.color })),
      };
      let result;
      if (publishedId) result = await api.updateExtension(publishedId, payload);
      else result = await api.createExtension(payload);
      publishedId = result.extension.id;
      cacheExtension({ ...result.extension, source: codeArea.value });
      installExtension(publishedId);
      store.hostIds = '';
      await ensureHost();
      toast('Расширение опубликовано и установлено!', 'success', 4000);
      await refreshCatalog();
      renderMine();
    } catch (err) {
      toast(err.message, 'error', 5000);
    } finally {
      publishBtn.disabled = false;
    }
  }

  function toggleInstall() {
    if (!currentKey) return;
    if (isInstalled(currentKey)) {
      uninstallExtension(currentKey);
      toast('Расширение выключено', 'info');
    } else {
      installExtension(currentKey);
      if (previewManifest) cacheExtension({ id: previewManifest.id, name: previewManifest.name, source: codeArea.value, blocks: previewManifest.blocks });
      toast('Расширение установлено — блоки уже в редакторе', 'success');
    }
    installBtn.textContent = isInstalled(currentKey) ? 'Выключить' : 'Установить';
    ensureHost().catch(() => {});
  }

  // ---- каталог ------------------------------------------------------------
  async function refreshCatalog() {
    await refreshExtensionList();
    catalog = store.extList;
    if (!catalog.length) {
      mount(catalogBox, el('p', { class: 'muted small' }, 'Пока пусто. Опубликуй первое расширение!'));
    } else {
      mount(
        catalogBox,
        el(
          'div',
          { style: { maxHeight: '52vh', overflow: 'auto' } },
          catalog.map((ext) => extCard(ext))
        )
      );
    }
    renderMine();
  }

  function extCard(ext) {
    const installed = isInstalled(ext.id);
    return el(
      'div',
      { class: 'ext-item' },
      el(
        'div',
        { style: { flex: 1, minWidth: 0 } },
        el('h4', {}, ext.name, el('span', { class: 'small dim' }, ` v${ext.version}`)),
        el('p', { class: 'tiny dim', style: { margin: '0 0 4px' } }, ext.author),
        el('p', { class: 'small muted', style: { margin: '0 0 6px' } }, ext.description || 'Без описания'),
        el(
          'div',
          { class: 'blocks-line' },
          (ext.blocks || []).slice(0, 8).map((block) =>
            el('span', { class: 'badge' },
              el('span', { style: { width: '9px', height: '9px', borderRadius: '3px', background: block.color, display: 'inline-block' } }),
              block.name)
          )
        ),
        el(
          'div',
          { class: 'row', style: { gap: '6px', marginTop: '8px' } },
          el(
            'button',
            {
              class: `btn btn-sm ${installed ? 'btn-ghost' : ''}`,
              onclick: async () => {
                if (installed) {
                  uninstallExtension(ext.id);
                  toast('Расширение выключено', 'info');
                } else {
                  try {
                    const full = await fetchExtension(ext.id);
                    cacheExtension(full);
                    installExtension(ext.id);
                    store.hostIds = '';
                    await ensureHost();
                    toast(`«${ext.name}» установлено`, 'success');
                  } catch (err) {
                    toast(err.message, 'error');
                  }
                }
                refreshCatalog();
              },
            },
            installed ? '✓ Включено' : 'Установить'
          ),
          el('button', { class: 'btn btn-ghost btn-sm', onclick: () => loadIntoEditor(ext) }, 'Открыть код'),
          el('button', { class: 'btn btn-ghost btn-sm', onclick: () => likeExt(ext) }, `♥ ${ext.likes || 0}`)
        )
      )
    );
  }

  async function likeExt(ext) {
    if (!store.user) return toast('Войди, чтобы ставить лайки', 'error');
    try {
      await api.likeExtension(ext.id);
      refreshCatalog();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function loadIntoEditor(ext) {
    try {
      const full = await fetchExtension(ext.id);
      codeArea.value = full.source;
      nameInput.value = `${full.name} (копия)`;
      versionInput.value = '1.0.0';
      descInput.value = full.description || '';
      publishedId = null;
      previewManifest = null;
      installBtn.disabled = true;
      currentKey = null;
      toast(`Код «${ext.name}» загружен в редактор`, 'info');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function openExamples() {
    const body = el(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
      el('p', { class: 'small muted' }, 'Возьми чужой код как основу — это лучший способ разобраться.'),
      catalog.slice(0, 20).map((ext) =>
        el(
          'button',
          {
            class: 'btn btn-ghost btn-sm',
            style: { justifyContent: 'space-between' },
            onclick: async () => {
              await loadIntoEditor(ext);
              dlg.close();
            },
          },
          el('span', {}, ext.name),
          el('span', { class: 'dim' }, ext.author)
        )
      )
    );
    const dlg = modal({ title: 'Примеры расширений', body, wide: false });
  }

  function renderMine() {
    const mine = catalog.filter((ext) => ext.mine);
    if (!mine.length) {
      mount(mineBox, el('p', { class: 'small muted' }, 'Ты ещё ничего не публиковал. Напиши код и нажми «Опубликовать».'));
      return;
    }
    mount(
      mineBox,
      mine.map((ext) =>
        el(
          'div',
          { class: 'row', style: { justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line-soft)' } },
          el('div', {},
            el('b', {}, ext.name),
            el('span', { class: 'small dim' }, ` v${ext.version} · ${ext.likes || 0} ♥ · ${fmtDate(ext.updatedAt)}`)
          ),
          el('div', { class: 'row', style: { gap: '4px' } },
            el('button', { class: 'btn btn-ghost btn-sm', onclick: () => loadIntoEditor(ext) }, 'Код'),
            el('button', { class: 'btn btn-ghost btn-sm', onclick: () => (publishedId = ext.id) }, '↻ Обновлять')
          )
        )
      )
    );
  }

  installBtn.disabled = true;
  await refreshCatalog();
  if (params.id) {
    try {
      const ext = await fetchExtension(params.id);
      await loadIntoEditor(ext);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return {
    destroy() {
      if (previewRuntime) previewRuntime.dispose();
    },
  };
}
