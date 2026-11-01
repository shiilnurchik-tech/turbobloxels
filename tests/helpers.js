/** Заглушка canvas, чтобы гонять игровой движок в Node без браузера. */
function mockContext() {
  const gradient = { addColorStop() {} };
  return new Proxy(
    {},
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
        if (prop === 'canvas') return { width: 832, height: 416 };
        return () => {};
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    }
  );
}

export function mockCanvas() {
  return {
    width: 0,
    height: 0,
    getContext: () => mockContext(),
  };
}

/** Простейший уровень: 1 экран, клетки задаются картой (x,y) → blockId. */
export function makeLevel({ cells = {}, screens = 1, rules = {}, settings = {}, pixels = null } = {}) {
  const out = { screens: [], character: { pixels: pixels || new Array(169).fill(null) }, background: { pixels: new Array(169).fill(null) }, rules, settings };
  for (let s = 0; s < screens; s++) {
    const arr = new Array(169).fill(null);
    for (let y = 0; y < 13; y++) {
      for (let x = 0; x < 13; x++) {
        const id = cells[`${s}:${x},${y}`] ?? cells[`${x},${y}`];
        if (id) arr[y * 13 + x] = id;
      }
    }
    out.screens.push({ cells: arr });
  }
  return out;
}

export const noInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  jumpPressed: false,
  dash: false,
  use: false,
};
