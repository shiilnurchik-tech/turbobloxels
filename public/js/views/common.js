/** Общие кусочки интерфейса: миниатюры уровней, карточки, чипы блоков. */
import { el, fmtDate } from '../dom.js';
import { BLOCK_MAP, GRID, defaultCharacterPixels, CHAR_COLORS, POWERS } from '../blocks.js';

const COLOR_FALLBACK = ['#3ddc84', '#4c9aff', '#ffd93d', '#ff5d73', '#b07cff', '#4ce0e0', '#ff9f43'];

/** Миниатюра доски: цветные клетки на canvas. */
export function boardThumb(cells, size = 156, { charPixels = null, registry = null } = {}) {
  const canvas = el('canvas', { width: size, height: size });
  const g = canvas.getContext('2d');
  g.fillStyle = '#0a1424';
  g.fillRect(0, 0, size, size);
  const cs = size / GRID;

  if (charPixels) {
    for (let i = 0; i < GRID * GRID; i++) {
      const id = charPixels[i];
      if (!id) continue;
      const color = CHAR_COLORS.find((c) => c.id === id)?.hex || '#fff';
      g.fillStyle = color;
      g.fillRect((i % GRID) * cs, Math.floor(i / GRID) * cs, Math.ceil(cs), Math.ceil(cs));
    }
    return canvas;
  }

  for (let i = 0; i < GRID * GRID; i++) {
    const id = cells ? cells[i] : null;
    if (!id) continue;
    const def = registry?.get(id) || BLOCK_MAP[id];
    const color = def?.color || (id.startsWith('ext:') ? '#ff00ff' : COLOR_FALLBACK[i % COLOR_FALLBACK.length]);
    g.fillStyle = color;
    g.fillRect((i % GRID) * cs, Math.floor(i / GRID) * cs, Math.ceil(cs), Math.ceil(cs));
  }
  return canvas;
}

export function thumbNode(level, size = 156) {
  const wrap = el('div', { class: 'thumb' });
  if (level.thumb && typeof level.thumb === 'string' && level.thumb.startsWith('data:image/')) {
    wrap.appendChild(el('img', { src: level.thumb, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } }));
    return wrap;
  }
  wrap.appendChild(boardThumb(level.preview || level.data?.screens?.[0]?.cells, size));
  return wrap;
}

export function characterThumb(pixels, size = 96) {
  return boardThumb(null, size, { charPixels: pixels || defaultCharacterPixels() });
}

export function blockChip(color, size = 14) {
  return el('span', {
    class: 'chip',
    style: {
      display: 'inline-block',
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '4px',
      background: color || '#93a6c4',
      boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.25)',
    },
  });
}

export function levelCard(level, handlers = {}) {
  const card = el(
    'article',
    {
      class: 'card level-card',
      onclick: (event) => {
        if (event.target.closest('button')) return;
        handlers.onOpen ? handlers.onOpen(level) : null;
      },
    },
    thumbNode(level),
    el('h3', { style: { margin: '0' } }, level.title),
    el(
      'div',
      { class: 'level-meta' },
      el('span', { class: 'badge' }, `🎮 ${level.plays || 0}`),
      el('span', { class: 'badge yellow' }, `★ ${level.bestScore || 0}`),
      el('span', {}, level.ownerName || ''),
      el('span', {}, fmtDate(level.updatedAt || level.createdAt))
    ),
    el('div', { class: 'row wrap', style: { gap: '6px' } },
      level.extensionIds?.length ? el('span', { class: 'badge purple' }, `🧩 ${level.extensionIds.length}`) : null,
      level.mine ? el('span', { class: 'badge green' }, 'мой') : null
    ),
    el(
      'div',
      { class: 'row', style: { gap: '6px', marginTop: '2px' } },
      el('button', { class: 'btn btn-sm', onclick: () => handlers.onPlay?.(level) }, 'Играть ▶'),
      handlers.onEdit ? el('button', { class: 'btn btn-ghost btn-sm', onclick: () => handlers.onEdit(level) }, 'Изменить') : null,
      handlers.onLike
        ? el(
            'button',
            { class: `btn btn-ghost btn-sm${level.liked ? ' active' : ''}`, onclick: () => handlers.onLike(level) },
            `♥ ${level.likes || 0}`
          )
        : el('span', { class: 'badge' }, `♥ ${level.likes || 0}`)
    )
  );
  return card;
}

export function powerChips(powers = []) {
  return powers
    .map((id) => {
      const power = POWERS[id];
      if (!power) return null;
      return el('span', { class: 'badge purple', title: power.desc }, `${power.icon} ${power.name}`);
    })
    .filter(Boolean);
}

export function sectionHead(title, ...right) {
  return el('div', { class: 'section-head' }, el('h2', {}, title), el('div', { class: 'spacer' }), ...right.filter(Boolean));
}
