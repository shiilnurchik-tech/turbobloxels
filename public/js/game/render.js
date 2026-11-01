/**
 * Отрисовка игры на canvas. Все спрайты генерируются кодом и кэшируются,
 * поэтому проект не тянет за собой никаких картинок.
 */
import { CELL, GRID, COLOR_MAP } from '../blocks.js';

export const VIEW_TILES = 26;
export const VIEW_W = VIEW_TILES * CELL;
export const VIEW_H = GRID * CELL;

export function shade(hex, amount) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp(((num >> 16) & 255) + amount);
  const g = clamp(((num >> 8) & 255) + amount);
  const b = clamp((num & 255) + amount);
  return `rgb(${r},${g},${b})`;
}

function roundRect(g, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + radius, y);
  g.arcTo(x + w, y, x + w, y + h, radius);
  g.arcTo(x + w, y + h, x, y + h, radius);
  g.arcTo(x, y + h, x, y, radius);
  g.arcTo(x, y, x + w, y, radius);
  g.closePath();
}

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

/** Рисует 13x13 пиксельную карту в квадрат size×size. */
export function drawPixelArt(g, pixels, x, y, size, fallback = null) {
  const px = size / GRID;
  let painted = false;
  for (let i = 0; i < GRID * GRID; i++) {
    const colorId = pixels[i];
    if (!colorId) continue;
    const color = COLOR_MAP[colorId]?.hex || colorId;
    const cx = i % GRID;
    const cy = Math.floor(i / GRID);
    g.fillStyle = color;
    g.fillRect(Math.round(x + cx * px), Math.round(y + cy * px), Math.ceil(px), Math.ceil(px));
    painted = true;
  }
  if (!painted && fallback) {
    g.fillStyle = fallback;
    roundRect(g, x + size * 0.15, y + size * 0.1, size * 0.7, size * 0.8, size * 0.18);
    g.fill();
  }
  return painted;
}

const PATTERN_CHARS = { '#': 0, '+': 60, '-': -55 };

/** Спрайт блока из расширения: пиксельный узор 13x13. */
function drawPatternSprite(g, def, size) {
  g.fillStyle = 'rgba(0,0,0,0.18)';
  roundRect(g, 1, 1, size - 2, size - 2, 5);
  g.fill();
  const px = size / GRID;
  const rows = def.pattern || [];
  let any = false;
  for (let y = 0; y < rows.length && y < GRID; y++) {
    const row = String(rows[y]);
    for (let x = 0; x < row.length && x < GRID; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      if (!(ch in PATTERN_CHARS)) continue;
      g.fillStyle = shade(def.color, PATTERN_CHARS[ch]);
      g.fillRect(Math.round(x * px), Math.round(y * px), Math.ceil(px), Math.ceil(px));
      any = true;
    }
  }
  if (!any) drawSolidSprite(g, def, size);
}

function drawSolidSprite(g, def, size) {
  const base = def.color || '#94a3b8';
  roundRect(g, 1, 1, size - 2, size - 2, 6);
  g.fillStyle = base;
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.fillRect(3, 3, size - 6, 4);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(3, size - 7, size - 6, 4);
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(3, 7, 4, size - 14);
}

function drawSpriteFor(def, size) {
  const canvas = makeCanvas(size);
  const g = canvas.getContext('2d');
  const style = def.style || (def.pattern ? 'pattern' : 'solid');
  const base = def.color || '#94a3b8';
  switch (style) {
    case 'pattern':
      drawPatternSprite(g, def, size);
      break;
    case 'brick': {
      g.fillStyle = base;
      g.fillRect(0, 0, size, size);
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 2;
      for (let row = 0; row < 3; row++) {
        const y = (row * size) / 3;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(size, y);
        g.stroke();
        const offset = row % 2 ? size / 4 : 0;
        for (let x = offset; x < size; x += size / 2) {
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x, y + size / 3);
          g.stroke();
        }
      }
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(0, 0, size, 3);
      break;
    }
    case 'crate': {
      g.fillStyle = base;
      g.fillRect(0, 0, size, size);
      g.strokeStyle = shade(base, -50);
      g.lineWidth = 3;
      g.strokeRect(2, 2, size - 4, size - 4);
      g.beginPath();
      g.moveTo(3, 3);
      g.lineTo(size - 3, size - 3);
      g.moveTo(size - 3, 3);
      g.lineTo(3, size - 3);
      g.stroke();
      break;
    }
    case 'bounce': {
      g.fillStyle = shade(base, -40);
      roundRect(g, 0, 0, size, size, 6);
      g.fill();
      g.fillStyle = base;
      roundRect(g, 2, 2, size - 4, size * 0.5, 5);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      for (let i = 0; i < 2; i++) {
        const y = size * 0.42 + i * size * 0.2;
        g.beginPath();
        g.moveTo(size * 0.2, y);
        g.lineTo(size * 0.5, y - size * 0.14);
        g.lineTo(size * 0.8, y);
        g.lineTo(size * 0.8, y + 3);
        g.lineTo(size * 0.5, y - size * 0.1);
        g.lineTo(size * 0.2, y + 3);
        g.closePath();
        g.fill();
      }
      break;
    }
    case 'ladder': {
      g.strokeStyle = base;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(size * 0.26, 0);
      g.lineTo(size * 0.26, size);
      g.moveTo(size * 0.74, 0);
      g.lineTo(size * 0.74, size);
      g.stroke();
      g.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const y = size * 0.18 + i * size * 0.32;
        g.beginPath();
        g.moveTo(size * 0.26, y);
        g.lineTo(size * 0.74, y);
        g.stroke();
      }
      break;
    }
    case 'liquid': {
      const grad = g.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, shade(base, 30));
      grad.addColorStop(1, shade(base, -30));
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      g.fillStyle = 'rgba(255,255,255,0.28)';
      g.beginPath();
      g.moveTo(0, size * 0.16);
      g.quadraticCurveTo(size * 0.25, size * 0.05, size * 0.5, size * 0.16);
      g.quadraticCurveTo(size * 0.75, size * 0.27, size, size * 0.16);
      g.lineTo(size, 0);
      g.lineTo(0, 0);
      g.closePath();
      g.fill();
      break;
    }
    case 'lava': {
      const grad = g.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, '#ffb347');
      grad.addColorStop(1, '#e33f10');
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      g.fillStyle = 'rgba(255,240,150,0.6)';
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(size * (0.25 + i * 0.28), size * (0.35 + (i % 2) * 0.3), size * 0.07, 0, 7);
        g.fill();
      }
      break;
    }
    case 'spike': {
      g.fillStyle = '#64748b';
      g.fillRect(0, size * 0.55, size, size * 0.45);
      g.fillStyle = base;
      for (let i = 0; i < 2; i++) {
        g.beginPath();
        g.moveTo(size * (0.1 + i * 0.5), size * 0.55);
        g.lineTo(size * (0.3 + i * 0.5), size * 0.05);
        g.lineTo(size * (0.5 + i * 0.5), size * 0.55);
        g.closePath();
        g.fill();
      }
      break;
    }
    case 'coin': {
      g.fillStyle = shade(base, -50);
      g.beginPath();
      g.arc(size / 2, size / 2, size * 0.34, 0, 7);
      g.fill();
      g.fillStyle = base;
      g.beginPath();
      g.arc(size / 2, size / 2, size * 0.3, 0, 7);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.beginPath();
      g.arc(size * 0.42, size * 0.4, size * 0.09, 0, 7);
      g.fill();
      break;
    }
    case 'gem': {
      g.fillStyle = base;
      g.beginPath();
      g.moveTo(size / 2, size * 0.12);
      g.lineTo(size * 0.86, size * 0.45);
      g.lineTo(size / 2, size * 0.9);
      g.lineTo(size * 0.14, size * 0.45);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath();
      g.moveTo(size / 2, size * 0.12);
      g.lineTo(size * 0.62, size * 0.45);
      g.lineTo(size / 2, size * 0.45);
      g.lineTo(size * 0.38, size * 0.45);
      g.closePath();
      g.fill();
      break;
    }
    case 'heart': {
      g.fillStyle = base;
      const s = size;
      g.beginPath();
      g.moveTo(s / 2, s * 0.82);
      g.bezierCurveTo(s * 0.05, s * 0.5, s * 0.15, s * 0.15, s / 2, s * 0.35);
      g.bezierCurveTo(s * 0.85, s * 0.15, s * 0.95, s * 0.5, s / 2, s * 0.82);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath();
      g.arc(s * 0.36, s * 0.36, s * 0.07, 0, 7);
      g.fill();
      break;
    }
    case 'goal': {
      g.fillStyle = '#e2e8f0';
      g.fillRect(size * 0.18, size * 0.05, size * 0.1, size * 0.95);
      g.fillStyle = base;
      g.beginPath();
      g.moveTo(size * 0.28, size * 0.08);
      g.lineTo(size * 0.95, size * 0.22);
      g.lineTo(size * 0.28, size * 0.42);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.fillRect(size * 0.1, size * 0.94, size * 0.3, size * 0.06);
      break;
    }
    case 'spawn': {
      g.strokeStyle = base;
      g.setLineDash([4, 4]);
      g.lineWidth = 2;
      g.strokeRect(3, 3, size - 6, size - 6);
      g.setLineDash([]);
      g.fillStyle = base;
      g.beginPath();
      g.moveTo(size / 2, size * 0.25);
      g.lineTo(size * 0.68, size * 0.5);
      g.lineTo(size * 0.32, size * 0.5);
      g.closePath();
      g.fill();
      break;
    }
    case 'unknown': {
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          g.fillStyle = (x + y) % 2 ? '#ff00ff' : '#1b1030';
          g.fillRect((x * size) / 4, (y * size) / 4, size / 4, size / 4);
        }
      }
      g.fillStyle = '#fff';
      g.font = `bold ${size * 0.5}px monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('?', size / 2, size / 2 + 1);
      break;
    }
    default:
      drawSolidSprite(g, def, size);
      break;
  }
  return canvas;
}

export class Painter {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.world = world;
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.cache = new Map();
    this.clouds = Array.from({ length: 9 }, (_, i) => ({
      x: (i * 197) % (VIEW_W + 200) - 100,
      y: 20 + ((i * 61) % 130),
      s: 0.6 + ((i * 37) % 70) / 100,
      speed: 3 + (i % 3) * 2,
    }));
  }

  sprite(def) {
    if (!def) return null;
    if (this.cache.has(def.id)) return this.cache.get(def.id);
    const sprite = drawSpriteFor(def, CELL);
    this.cache.set(def.id, sprite);
    return sprite;
  }

  characterSprite(pixels) {
    const key = `char:${pixels.join('').slice(0, 400)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const canvas = makeCanvas(GRID * 4);
    const g = canvas.getContext('2d');
    drawPixelArt(g, pixels, 0, 0, GRID * 4, '#3ddc84');
    this.cache.set(key, canvas);
    return canvas;
  }

  draw(state) {
    const { ctx } = this;
    const { world } = this;
    const camX = Math.round(state.camera ?? 0);
    const now = state.time || 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    this.drawSky(ctx, camX, now, state);
    this.drawBackgroundArt(ctx, camX);

    ctx.save();
    ctx.translate(-camX, 0);

    const startTile = Math.max(0, Math.floor(camX / CELL) - 1);
    const endTile = Math.min(world.width - 1, Math.floor((camX + VIEW_W) / CELL) + 1);

    for (let ty = 0; ty < world.height; ty++) {
      for (let tx = startTile; tx <= endTile; tx++) {
        const def = world.defAt(tx, ty);
        if (!def) continue;
        const x = tx * CELL;
        const y = ty * CELL;
        const sprite = this.sprite(def);
        if (def.style === 'coin' || def.style === 'gem' || def.style === 'heart') {
          const bob = Math.sin(now * 3 + tx * 0.9) * 2.5;
          ctx.drawImage(sprite, x, y + bob);
        } else if (def.style === 'goal') {
          ctx.drawImage(sprite, x, y - 4);
        } else {
          ctx.drawImage(sprite, x, y);
        }
      }
    }

    // враги
    for (const enemy of world.enemies) {
      if (!enemy.alive) continue;
      this.drawEnemy(ctx, enemy, now);
    }

    // игрок
    if (state.player) this.drawPlayer(ctx, state.player, now);

    // частицы
    for (const p of state.particles || []) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      const size = p.size * CELL;
      ctx.fillRect(p.x * CELL, p.y * CELL, size, size);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    if (state.inWater) {
      ctx.fillStyle = 'rgba(40,120,220,0.18)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,60,80,${Math.min(0.35, state.flash)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (state.vignette !== false) {
      const grad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.4, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.95);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(4,10,24,0.45)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  drawSky(ctx, camX, now, state) {
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#8ec9f2');
    grad.addColorStop(0.55, '#bfe3f7');
    grad.addColorStop(1, '#e9f6ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const sunX = VIEW_W - 90 - camX * 0.04;
    const sunY = 60;
    ctx.fillStyle = 'rgba(255,236,150,0.85)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 34, 0, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 52, 0, 7);
    ctx.fill();

    for (const cloud of this.clouds) {
      const x = ((cloud.x - camX * 0.25 + now * cloud.speed) % (VIEW_W + 240)) - 120;
      this.drawCloud(ctx, x, cloud.y, cloud.s);
    }

    // холмы в два слоя
    const baseY = VIEW_H - 40;
    ctx.fillStyle = 'rgba(120,200,150,0.55)';
    ctx.beginPath();
    ctx.moveTo(0, VIEW_H);
    for (let x = 0; x <= VIEW_W; x += 40) {
      const y = baseY - 30 - Math.sin((x + camX * 0.18) * 0.004) * 34 - Math.cos((x + camX * 0.18) * 0.01) * 12;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(VIEW_W, VIEW_H);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(86,178,124,0.65)';
    ctx.beginPath();
    ctx.moveTo(0, VIEW_H);
    for (let x = 0; x <= VIEW_W; x += 30) {
      const y = baseY - 6 - Math.cos((x + camX * 0.3) * 0.006) * 22;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(VIEW_W, VIEW_H);
    ctx.closePath();
    ctx.fill();
  }

  drawCloud(ctx, x, y, scale) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const r = 18 * scale;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.arc(x + r * 1.1, y + r * 0.25, r * 0.8, 0, 7);
    ctx.arc(x - r * 1.1, y + r * 0.3, r * 0.7, 0, 7);
    ctx.closePath();
    ctx.fill();
  }

  drawBackgroundArt(ctx, camX) {
    const pixels = this.world.background?.pixels;
    if (!pixels || !pixels.some(Boolean)) return;
    const size = 13 * 4;
    const key = 'bg-art';
    let sprite = this.cache.get(key);
    if (!sprite) {
      sprite = makeCanvas(size);
      const g = sprite.getContext('2d');
      drawPixelArt(g, pixels, 0, 0, size);
      this.cache.set(key, sprite);
    }
    ctx.save();
    ctx.globalAlpha = 0.5;
    const tileSize = CELL * 2;
    const offset = -(camX * 0.45) % tileSize;
    for (let x = offset - tileSize; x < VIEW_W; x += tileSize) {
      for (let y = 0; y < VIEW_H; y += tileSize) {
        ctx.drawImage(sprite, x, y, tileSize, tileSize);
      }
    }
    ctx.restore();
  }

  drawEnemy(ctx, enemy, now) {
    const x = enemy.x * CELL;
    const y = enemy.y * CELL;
    const w = enemy.w * CELL;
    const h = enemy.h * CELL;
    const wobble = Math.sin(enemy.anim || now * 4) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h, w * 0.42, 4, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#ff9f43';
    roundRect(ctx, x + 2, y + 2 + wobble, w - 4, h - 4, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x + w * 0.34, y + h * 0.4 + wobble, 4.5, 0, 7);
    ctx.arc(x + w * 0.66, y + h * 0.4 + wobble, 4.5, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#1b1030';
    const look = enemy.vx > 0 ? 1.6 : -1.6;
    ctx.beginPath();
    ctx.arc(x + w * 0.34 + look, y + h * 0.42 + wobble, 2.2, 0, 7);
    ctx.arc(x + w * 0.66 + look, y + h * 0.42 + wobble, 2.2, 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, y + h * 0.72 + wobble);
    ctx.lineTo(x + w * 0.7, y + h * 0.72 + wobble);
    ctx.stroke();
  }

  drawPlayer(ctx, player, now) {
    const size = player.h * CELL;
    const x = player.x * CELL;
    const y = player.y * CELL;
    const sprite = this.characterSprite(player.pixels || []);
    const blink = player.invuln > 0 && Math.floor(now * 18) % 2 === 0;

    ctx.save();
    if (blink) ctx.globalAlpha = 0.4;
    ctx.translate(x + size / 2, y + size / 2);
    if (player.facing < 0) ctx.scale(-1, 1);
    const squash = player.onGround ? 1 : player.vy < 0 ? 1.06 : 0.96;
    ctx.scale(1 / squash, squash);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, size / 2 - 2, size * 0.32, 4, 0, 0, 7);
    ctx.fill();
    ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
    if (player.dashTime > 0) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(-size * 0.6, -size * 0.1, size * 0.3, size * 0.2);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
