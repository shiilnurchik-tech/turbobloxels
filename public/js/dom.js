/** Крошечные помощники для DOM, чтобы вьюхи оставались читаемыми. */

export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props)) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key === 'html') node.innerHTML = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    }
  } else if (props != null) {
    children.unshift(props);
  }
  appendChildren(node, children);
  return node;
}

export function appendChildren(node, children) {
  for (const child of children.flat(4)) {
    if (child == null || child === false) continue;
    if (child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(node, ...children) {
  clear(node);
  appendChildren(node, children);
  return node;
}

export function fmtTime(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
}

export function toast(text, kind = 'info', ms = 2800) {
  const root = document.getElementById('toasts') || document.body;
  const node = el('div', { class: `toast toast-${kind}` }, text);
  root.appendChild(node);
  setTimeout(() => {
    node.classList.add('toast-out');
    setTimeout(() => node.remove(), 260);
  }, ms);
  return node;
}

export function modal({ title, body, actions = [], wide = false, onClose = null }) {
  const root = document.getElementById('modal-root') || document.body;
  const close = () => {
    overlay.remove();
    if (typeof onClose === 'function') onClose();
  };
  const overlay = el(
    'div',
    { class: 'modal-overlay', onclick: (event) => event.target === overlay && close() },
    el(
      'div',
      { class: `modal${wide ? ' modal-wide' : ''}` },
      el(
        'div',
        { class: 'modal-head' },
        el('h3', {}, title || ''),
        el('button', { class: 'icon-btn', title: 'Закрыть', onclick: close }, '✕')
      ),
      el('div', { class: 'modal-body' }, body),
      actions.length ? el('div', { class: 'modal-actions' }, actions.map((a) => a.node)) : null
    )
  );
  root.appendChild(overlay);
  const onKey = (event) => {
    if (event.key === 'Escape') {
      close();
      window.removeEventListener('keydown', onKey);
    }
  };
  window.addEventListener('keydown', onKey);
  return { close, overlay };
}

export function button(label, onClick, kind = 'primary', extra = {}) {
  return el('button', { class: `btn btn-${kind}`, onclick: onClick, ...extra }, label);
}

export function iconButton(label, title, onClick, extra = {}) {
  return el('button', { class: 'icon-btn', title, onclick: onClick, ...extra }, label);
}

export function confirmDialog(title, text, onConfirm) {
  const ok = button('Да', () => {
    dlg.close();
    onConfirm();
  }, 'danger');
  const cancel = button('Отмена', () => dlg.close(), 'ghost');
  const dlg = modal({ title, body: el('p', { class: 'muted' }, text), actions: [{ node: cancel }, { node: ok }] });
  return dlg;
}
