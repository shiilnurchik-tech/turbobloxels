/** Клавиатура + экранные кнопки. */
const MAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'jump',
  KeyZ: 'jump',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  KeyJ: 'dash',
  KeyE: 'use',
};

export const ACTION_LABELS = {
  left: '←',
  right: '→',
  up: '↑',
  down: '↓',
  jump: '⤒',
  dash: '»',
  use: 'E',
};

export class Input {
  constructor() {
    this.held = new Set();
    this.justPressed = new Set();
    this.touchHeld = new Set();
    this.touchPressed = new Set();
    this.enabled = true;
    this._down = (event) => {
      if (!this.enabled) return;
      const action = MAP[event.code];
      if (action) {
        if (!this.held.has(action)) this.justPressed.add(action);
        this.held.add(action);
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault();
      }
      if (event.code === 'Escape' || event.code === 'KeyP') this.onPause?.();
    };
    this._up = (event) => {
      const action = MAP[event.code];
      if (action) this.held.delete(action);
    };
    this._blur = () => {
      this.held.clear();
      this.touchHeld.clear();
    };
  }

  attach() {
    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
    window.addEventListener('blur', this._blur);
    return this;
  }

  detach() {
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
    window.removeEventListener('blur', this._blur);
  }

  touchDown(action) {
    if (!this.touchHeld.has(action)) this.touchPressed.add(action);
    this.touchHeld.add(action);
  }

  touchUp(action) {
    this.touchHeld.delete(action);
  }

  isHeld(action) {
    return this.held.has(action) || this.touchHeld.has(action);
  }

  /** Снимок состояния на кадр. Сбрасывает «только что нажатые». */
  read() {
    const pressed = (action) => this.justPressed.has(action) || this.touchPressed.has(action);
    const state = {
      left: this.isHeld('left'),
      right: this.isHeld('right'),
      up: this.isHeld('up'),
      down: this.isHeld('down'),
      jump: this.isHeld('jump'),
      jumpPressed: pressed('jump'),
      dash: pressed('dash'),
      use: pressed('use'),
    };
    this.justPressed.clear();
    this.touchPressed.clear();
    return state;
  }
}
