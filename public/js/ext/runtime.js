/**
 * Хост-часть песочницы: по одному скрытому iframe на расширение.
 * Наружу отдаёт манифест (блоки, действия, хуки) и поток команд.
 */
const LOAD_TIMEOUT = 5000;

export class ExtRuntime {
  constructor(extId) {
    this.extId = extId;
    this.iframe = null;
    this.manifest = null;
    this.ready = null;
    this.loaded = null;
    this.logs = [];
    this.errors = [];
    this.onCommand = null;
    this.onLog = null;
    this._pending = [];
    this._resolveLoad = null;
    this._rejectLoad = null;
    this._timer = null;
    this._disposed = false;
    this._listener = (event) => this._handle(event);
  }

  _handle(event) {
    if (!this.iframe || event.source !== this.iframe.contentWindow) return;
    const data = event.data;
    if (!data || data.tbx !== 1) return;

    switch (data.type) {
      case 'ready':
        if (this._resolveReady) this._resolveReady(true);
        break;
      case 'loaded':
        this.manifest = data.manifest;
        this._finishLoad(null, data.manifest);
        break;
      case 'error': {
        const message = String(data.message || 'ошибка расширения');
        this.errors.push(message);
        this._pushLog('error', message);
        this._finishLoad(new Error(message));
        break;
      }
      case 'log':
        this._pushLog(data.level || 'log', String(data.text || ''));
        break;
      case 'report':
        this._pushLog('report', String(data.text || ''));
        break;
      case 'actions':
        if (this.manifest) {
          this.manifest.actions = data.actions || [];
          this.manifest.version = this.manifest.version || '1.0.0';
        }
        break;
      case 'commands':
        this._emitCommands(Array.isArray(data.commands) ? data.commands : []);
        break;
      default:
        break;
    }
  }

  _pushLog(level, text) {
    const entry = { level, text, at: Date.now() };
    this.logs.push(entry);
    if (this.logs.length > 200) this.logs.shift();
    if (this.onLog) this.onLog(entry);
  }

  _emitCommands(commands) {
    if (this.onCommand) this.onCommand(commands, this);
    else this._pending.push(...commands);
    if (this._pending.length > 500) this._pending.splice(0, this._pending.length - 500);
  }

  /** Забирает команды, накопившиеся до назначения обработчика. */
  drain() {
    const out = this._pending.slice();
    this._pending.length = 0;
    return out;
  }

  _finishLoad(error, manifest) {
    if (!this._resolveLoad) return;
    clearTimeout(this._timer);
    const resolve = this._resolveLoad;
    const reject = this._rejectLoad;
    this._resolveLoad = null;
    this._rejectLoad = null;
    if (error) reject(error);
    else resolve(manifest);
  }

  _createFrame() {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('title', `Песочница расширения ${this.extId}`);
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:360px;height:200px;border:0;opacity:0;pointer-events:none;';
    // Отдельный документ со своей CSP: страница игры остаётся строгой,
    // а песочнице разрешены inline-скрипты и eval (ей всё равно нужен eval).
    iframe.src = new URL('../../sandbox.html', import.meta.url).href;
    document.body.appendChild(iframe);
    this.iframe = iframe;

    return new Promise((resolve) => {
      this._resolveReady = resolve;
      let waited = 0;
      const tick = () => {
        if (this._resolveReady) {
          if (waited > 2500) return resolve(false);
          waited += 50;
          setTimeout(tick, 50);
        }
      };
      setTimeout(tick, 50);
    });
  }

  async _post(message) {
    this.iframe.contentWindow.postMessage({ tbx: 1, ...message }, '*');
  }

  /**
   * Загружает исходник расширения в песочницу.
   * @returns {Promise<object>} манифест
   */
  async load(source) {
    if (this._disposed) throw new Error('Песочница уже закрыта');
    if (!this.iframe) {
      window.addEventListener('message', this._listener);
      const ok = await this._createFrame();
      if (!ok) throw new Error('Песочница расширений не загрузилась (/sandbox.html)');
    }
    this.manifest = null;
    this.errors = [];
    const promise = new Promise((resolve, reject) => {
      this._resolveLoad = resolve;
      this._rejectLoad = reject;
      this._timer = setTimeout(() => {
        this._finishLoad(new Error('Расширение не ответило за 5 секунд (нет TBX.define?)'));
      }, LOAD_TIMEOUT);
    });
    await this._post({ type: 'load', source: String(source), filename: `${this.extId || 'extension'}.js` });
    return promise;
  }

  /** Событие для расширения. Не блокирует игру. */
  event(name, payload) {
    if (this._disposed || !this.iframe) return;
    this._post({ type: 'event', name, ctx: payload }).catch(() => {});
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    window.removeEventListener('message', this._listener);
    if (this.iframe && this.iframe.parentNode) this.iframe.parentNode.removeChild(this.iframe);
    this.iframe = null;
    clearTimeout(this._timer);
  }
}

/**
 * Набор расширений, загруженных для текущей сессии.
 */
export class ExtHost {
  constructor() {
    this.items = new Map(); // extId -> { data, runtime, manifest }
    this.onCommand = null;
    this.onLog = null;
  }

  get manifests() {
    return [...this.items.values()].filter((i) => i.manifest).map((i) => i.manifest);
  }

  get(extId) {
    return this.items.get(extId) || null;
  }

  has(extId) {
    return this.items.has(extId);
  }

  /**
   * @param {Array<{id:string,name?:string,source:string}>} extensions
   * @returns {Promise<{installed:string[], failed:Array<{id:string,error:string}>}>}
   */
  async loadAll(extensions) {
    const installed = [];
    const failed = [];
    for (const ext of extensions) {
      if (this.items.has(ext.id)) {
        installed.push(ext.id);
        continue;
      }
      const runtime = new ExtRuntime(ext.id);
      runtime.onCommand = (commands, rt) => {
        if (this.onCommand) this.onCommand(commands, rt);
      };
      runtime.onLog = (entry) => {
        if (this.onLog) this.onLog(entry, ext);
      };
      try {
        const manifest = await runtime.load(ext.source);
        this.items.set(ext.id, { data: ext, runtime, manifest });
        installed.push(ext.id);
      } catch (err) {
        runtime.dispose();
        failed.push({ id: ext.id, name: ext.name || ext.id, error: err.message });
      }
    }
    return { installed, failed };
  }

  /** Манифесты в формате реестра (с id расширения). */
  registryManifests() {
    return this.manifests.map((m) => ({ ...m, id: m.id }));
  }

  unload(extId) {
    const item = this.items.get(extId);
    if (!item) return false;
    item.runtime.dispose();
    this.items.delete(extId);
    return true;
  }

  broadcast(name, payload) {
    for (const item of this.items.values()) item.runtime.event(name, payload);
  }

  dispose() {
    for (const item of this.items.values()) item.runtime.dispose();
    this.items.clear();
  }
}
