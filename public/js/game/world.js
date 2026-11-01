/**
 * Сборка игрового мира из данных уровня.
 * Без DOM — можно тестировать в Node.
 */
import { GRID, defaultCharacterPixels, powersFromPixels } from '../blocks.js';

export function emptyScreen() {
  return { cells: new Array(GRID * GRID).fill(null) };
}

export function normalizeLevel(level) {
  const screens = (level?.screens || []).slice(0, 12).map((screen) => {
    const cells = new Array(GRID * GRID).fill(null);
    const src = Array.isArray(screen?.cells) ? screen.cells : [];
    for (let i = 0; i < cells.length && i < src.length; i++) {
      cells[i] = typeof src[i] === 'string' && src[i].length <= 48 ? src[i] : null;
    }
    return { cells };
  });
  if (screens.length === 0) screens.push(emptyScreen());

  const pixels = (arr) => {
    const out = new Array(GRID * GRID).fill(null);
    const src = Array.isArray(arr) ? arr : [];
    for (let i = 0; i < out.length && i < src.length; i++) out[i] = typeof src[i] === 'string' ? src[i] : null;
    return out;
  };

  const hasCharacter = Array.isArray(level?.character?.pixels) && level.character.pixels.some(Boolean);
  return {
    screens,
    character: { pixels: hasCharacter ? pixels(level.character.pixels) : defaultCharacterPixels() },
    background: { pixels: pixels(level?.background?.pixels) },
    rules: level?.rules && typeof level.rules === 'object' ? level.rules : {},
    settings: {
      gravity: Number(level?.settings?.gravity) || 1,
      speed: Number(level?.settings?.speed) || 1,
      jump: Number(level?.settings?.jump) || 1,
    },
  };
}

export function createEmptyLevel(title = 'Новый уровень') {
  return {
    title,
    description: '',
    screens: [emptyScreen()],
    character: { pixels: defaultCharacterPixels() },
    background: { pixels: new Array(GRID * GRID).fill(null) },
    rules: {},
    settings: { gravity: 1, speed: 1, jump: 1 },
  };
}

/**
 * @param {object} level — нормализованный уровень
 * @param {object} registry — buildRegistry(...)
 */
export function buildWorld(level, registry) {
  const screens = level.screens;
  const width = screens.length * GRID;
  const height = GRID;
  const cells = new Array(width * height).fill(null);
  const defs = new Array(width * height).fill(null);
  const enemies = [];
  let spawn = null;

  for (let s = 0; s < screens.length; s++) {
    const screen = screens[s];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < GRID; x++) {
        const id = screen.cells[y * GRID + x];
        if (!id) continue;
        const wx = s * GRID + x;
        const idx = y * width + wx;
        if (id === 'enemy') {
          enemies.push({
            x: wx + 0.1,
            y: y + 0.15,
            w: 0.8,
            h: 0.8,
            vx: -2.1,
            vy: 0,
            alive: true,
            anim: Math.random() * 6.28,
            onGround: false,
          });
          continue;
        }
        if (id === 'spawn') {
          if (!spawn) spawn = { x: wx + 0.1, y: y };
          continue;
        }
        cells[idx] = id;
        defs[idx] = registry.get(id) || registry.fallback(id);
      }
    }
  }

  const world = {
    width,
    height,
    screens: screens.length,
    cells,
    defs,
    enemies,
    spawn: spawn || findAutoSpawn(cells, defs, width, height),
    settings: level.settings,
    registry,
    rules: level.rules || {},
    character: level.character,
    background: level.background,
    powers: powersFromPixels(level.character?.pixels),
    index(tx, ty) {
      if (tx < 0 || tx >= width || ty < 0 || ty >= height) return -1;
      return ty * width + tx;
    },
    idAt(tx, ty) {
      const i = this.index(tx, ty);
      return i < 0 ? null : cells[i];
    },
    defAt(tx, ty) {
      const i = this.index(tx, ty);
      return i < 0 ? null : defs[i];
    },
    setCell(tx, ty, id) {
      const i = this.index(tx, ty);
      if (i < 0) return false;
      if (id == null) {
        cells[i] = null;
        defs[i] = null;
        return true;
      }
      const def = registry.get(id) || registry.fallback(id);
      cells[i] = id;
      defs[i] = def;
      return true;
    },
    isSolid(tx, ty) {
      if (tx < 0 || tx >= width) return true; // стены по краям мира
      if (ty < 0 || ty >= height) return false; // низ открыт: падение = проигрыш
      const def = defs[ty * width + tx];
      return !!(def && def.solid);
    },
    isLiquid(tx, ty) {
      const def = this.defAt(tx, ty);
      return !!(def && def.liquid);
    },
    isClimbable(tx, ty) {
      const def = this.defAt(tx, ty);
      return !!(def && def.climbable);
    },
    /** Блоки, пересекающиеся с прямоугольником (в тайлах). */
    tilesIn(x, y, w, h) {
      const out = [];
      const x0 = Math.max(0, Math.floor(x + 0.001));
      const x1 = Math.min(width - 1, Math.floor(x + w - 0.001));
      const y0 = Math.max(0, Math.floor(y + 0.001));
      const y1 = Math.min(height - 1, Math.floor(y + h - 0.001));
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const def = defs[ty * width + tx];
          if (def) out.push({ tx, ty, id: cells[ty * width + tx], def });
        }
      }
      return out;
    },
  };
  return world;
}

function findAutoSpawn(cells, defs, width, height) {
  for (let x = 0; x < width; x++) {
    for (let y = height - 2; y >= 0; y--) {
      const idx = y * width + x;
      const below = (y + 1) * width + x;
      const above = idx - width;
      const free = !cells[idx] && (y === 0 || !cells[above]);
      if (free && defs[below] && defs[below].solid) {
        return { x: x + 0.1, y };
      }
    }
  }
  // Совсем пустая доска: ставим в левый нижний угол.
  for (let x = 0; x < width; x++) {
    const y = height - 2;
    if (!cells[y * width + x]) return { x: x + 0.1, y };
  }
  return { x: 0.1, y: 0 };
}
