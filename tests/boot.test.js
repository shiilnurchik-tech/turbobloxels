/**
 * Загрузка настоящего index.html в jsdom без сервера: проверяем, что клиент
 * сам уходит в локальный режим и рисует главную (сценарий GitHub Pages).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../public');

test('без сервера клиент стартует в локальном режиме', async () => {
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://user.github.io/turbobloxels/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const { window } = dom;

  // canvas и звук в jsdom — заглушки
  window.HTMLCanvasElement.prototype.getContext = () =>
    new Proxy(
      { canvas: null, measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop() {} }) },
      { get: (t, p) => (p in t ? t[p] : () => {}), set: (t, p, v) => ((t[p] = v), true) }
    );
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';

  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Node = window.Node;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.localStorage = window.localStorage;
  globalThis.location = window.location;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  window.localStorage.clear();

  // GitHub Pages на /api/* отдаёт 404 HTML — ровно как в жизни
  const requested = [];
  window.fetch = globalThis.fetch = async (url) => {
    requested.push(String(url));
    return new Response('<!doctype html><title>404</title>', {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  };

  await import('../public/js/main.js');
  await new Promise((resolve) => setTimeout(resolve, 300));

  const header = document.querySelector('.topbar').textContent;
  assert.match(header, /локально/, 'в шапке виден локальный режим');
  assert.ok(requested.some((url) => url.endsWith('/api/stats')), 'клиент проверил наличие сервера');

  const view = document.getElementById('view').textContent;
  assert.match(view, /Собери свою игру/);
  assert.match(view, /Первый прыжок/, 'демо-уровень пришёл из localStorage');

  const db = JSON.parse(window.localStorage.getItem('tbx.localdb.v1'));
  assert.equal(db.levels.length, 1);
  assert.equal(db.extensions.length, 2);
});
