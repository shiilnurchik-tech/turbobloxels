/** Пиксельная сетка 13×13 с кистью, заливкой, пипеткой и историей. */
import { el } from '../dom.js';
import { GRID } from '../blocks.js';

const HISTORY_LIMIT = 80;

export class GridEditor {
  constructor({ cellSize = 34, value, palette = [], tool = 'brush', onChange = null, onPick = null, gridLines = true }) {
    this.cellSize = cellSize;
    this.value = (value || new Array(GRID * GRID).fill(null)).slice();
    this.palette = palette;
    this.tool = tool;
    this.onChange = onChange;
    this.onPick = onPick;
    this.gridLines = gridLines;
    this.brush = palette[0]?.id ?? null;
    this.history = [];
    this.future = [];
    this.hover = null;
    this.drawing = false;
    this.eraseMode = false;

    this.canvas = el('canvas', {
      width: GRID * cellSize,
      height: GRID * cellSize,
      style: { width: `${GRID * cellSize}px`, height: `${GRID * cellSize}px` },
    });
    this.ctx = this.canvas.getContext('2d');
    this.wrap = el('div', { class: 'canvas-wrap' }, this.canvas);

    this.canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.draw();
    });
    window.addEventListener('pointerup', () => {
      if (this.drawing) {
        this.drawing = false;
        this.canvas.releasePointerCapture?.(this.pointerId);
      }
    });
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    this.draw();
  }

  get node() {
    return this.wrap;
  }

  setTool(tool) {
    this.tool = tool;
    this.draw();
  }

  setBrush(id) {
    this.brush = id;
    this.draw();
  }

  setPalette(palette) {
    this.palette = palette;
    if (!palette.some((p) => p.id === this.brush) && palette.length) this.brush = palette[0].id;
    this.draw();
  }

  setValue(value) {
    this.value = (value || new Array(GRID * GRID).fill(null)).slice();
    this.history = [];
    this.future = [];
    this.draw();
  }

  setCellSize(size) {
    this.cellSize = size;
    this.canvas.width = GRID * size;
    this.canvas.height = GRID * size;
    this.canvas.style.width = `${GRID * size}px`;
    this.canvas.style.height = `${GRID * size}px`;
    this.draw();
  }

  colorFor(id) {
    const item = this.palette.find((p) => p.id === id);
    if (item) return item.color;
    if (typeof id === 'string' && id.startsWith('ext:')) return '#ff00ff';
    return '#94a3b8';
  }

  cellFromEvent(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * GRID);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * GRID);
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return null;
    return { x, y, index: y * GRID + x };
  }

  snapshot() {
    this.history.push(this.value.slice());
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.future.length = 0;
  }

  onPointerDown(event) {
    const cell = this.cellFromEvent(event);
    if (!cell) return;
    event.preventDefault();
    this.eraseMode = event.button === 2 || this.tool === 'eraser';
    if (this.tool === 'picker') {
      const id = this.value[cell.index];
      if (id && this.onPick) this.onPick(id);
      return;
    }
    if (this.tool === 'fill') {
      this.snapshot();
      this.floodFill(cell, this.eraseMode ? null : this.brush);
      this.commit();
      return;
    }
    this.snapshot();
    this.drawing = true;
    this.pointerId = event.pointerId;
    this.canvas.setPointerCapture?.(event.pointerId);
    this.paint(cell, this.eraseMode ? null : this.brush);
  }

  onPointerMove(event) {
    const cell = this.cellFromEvent(event);
    this.hover = cell;
    if (this.drawing && cell) {
      this.eraseMode = this.eraseMode || event.buttons === 2;
      this.paint(cell, this.eraseMode ? null : this.brush);
    } else {
      this.draw();
    }
  }

  paint(cell, id) {
    if (this.value[cell.index] === id) return;
    this.value[cell.index] = id;
    this.draw();
    this.onChange?.(this.value);
  }

  floodFill(start, id) {
    const target = this.value[start.index];
    if (target === id) return;
    const stack = [start];
    const seen = new Set();
    while (stack.length) {
      const { x, y, index } = stack.pop();
      if (seen.has(index)) continue;
      seen.add(index);
      if (this.value[index] !== target) continue;
      this.value[index] = id;
      if (x > 0) stack.push({ x: x - 1, y, index: index - 1 });
      if (x < GRID - 1) stack.push({ x: x + 1, y, index: index + 1 });
      if (y > 0) stack.push({ x, y: y - 1, index: index - GRID });
      if (y < GRID - 1) stack.push({ x, y: y + 1, index: index + GRID });
    }
    this.draw();
    this.onChange?.(this.value);
  }

  clear() {
    this.snapshot();
    this.value = new Array(GRID * GRID).fill(null);
    this.draw();
    this.onChange?.(this.value);
  }

  undo() {
    if (!this.history.length) return false;
    this.future.push(this.value.slice());
    this.value = this.history.pop();
    this.draw();
    this.onChange?.(this.value);
    return true;
  }

  redo() {
    if (!this.future.length) return false;
    this.history.push(this.value.slice());
    this.value = this.future.pop();
    this.draw();
    this.onChange?.(this.value);
    return true;
  }

  commit() {
    this.onChange?.(this.value);
  }

  draw() {
    const g = this.ctx;
    const size = this.cellSize;
    const total = GRID * size;
    g.clearRect(0, 0, total, total);

    // шахматный фон
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        g.fillStyle = (x + y) % 2 ? '#0e1a2c' : '#101f34';
        g.fillRect(x * size, y * size, size, size);
      }
    }

    // клетки
    for (let i = 0; i < GRID * GRID; i++) {
      const id = this.value[i];
      if (!id) continue;
      const x = (i % GRID) * size;
      const y = Math.floor(i / GRID) * size;
      const color = this.colorFor(id);
      g.fillStyle = color;
      g.fillRect(x, y, size, size);
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(x, y, size, Math.max(2, size * 0.1));
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x, y + size - Math.max(2, size * 0.1), size, Math.max(2, size * 0.1));
      if (typeof id === 'string' && id.startsWith('ext:')) {
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.font = `bold ${size * 0.42}px monospace`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('✦', x + size / 2, y + size / 2);
      }
    }

    // сетка
    if (this.gridLines) {
      g.strokeStyle = 'rgba(120,160,220,0.14)';
      g.lineWidth = 1;
      for (let i = 1; i < GRID; i++) {
        g.beginPath();
        g.moveTo(i * size + 0.5, 0);
        g.lineTo(i * size + 0.5, total);
        g.stroke();
        g.beginPath();
        g.moveTo(0, i * size + 0.5);
        g.lineTo(total, i * size + 0.5);
        g.stroke();
      }
      g.strokeStyle = 'rgba(140,180,240,0.35)';
      g.lineWidth = 2;
      g.strokeRect(1, 1, total - 2, total - 2);
    }

    // подсветка клетки под курсором
    if (this.hover) {
      g.strokeStyle = 'rgba(61,220,132,0.9)';
      g.lineWidth = 2;
      g.strokeRect(this.hover.x * size + 1, this.hover.y * size + 1, size - 2, size - 2);
      g.fillStyle = 'rgba(61,220,132,0.10)';
      g.fillRect(this.hover.x * size, this.hover.y * size, size, size);
    }
  }
}
