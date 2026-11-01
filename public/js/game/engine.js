/**
 * Игровой движок: физика, «Книга правил», враги, камера, частицы.
 * Правила блока — единственное место, где описано поведение (см. rules.js),
 * поэтому расширения и редактор работают с одной и той же моделью.
 */
import { stepPlayer, stepEnemy, makePlayer, overlaps, PHYS, clamp } from './physics.js';
import { Painter, VIEW_W } from './render.js';
import { CELL } from '../blocks.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { rulesForBlock, checkConditions } from '../rules.js';

const STEP = 1 / 120;

export class Game {
  constructor({ canvas, world, onEvent = () => {} }) {
    this.canvas = canvas;
    this.world = world;
    this.onEvent = onEvent;
    this.registry = world.registry;
    this.painter = new Painter(canvas, world);
    this.input = new Input();
    this.input.onPause = () => this.togglePause();

    this.player = makePlayer(world.spawn, world);
    this.player.pixels = world.character?.pixels || [];
    this.camera = 0;
    this.time = 0;
    this.score = 0;
    this.coins = 0;
    this.state = 'playing';
    this.particles = [];
    this.flash = 0;
    this.prevOverlap = new Set();
    this.cellStates = new Map();
    this.extThrottle = new Map();
    this.hudTimer = 0;
    this.tickTimer = 0;
    this.extHost = null;
    this.running = false;
    this.raf = 0;
    this.acc = 0;
    this.last = 0;
    this.startedAt = performance.now();
    this.rebuildRules();
    this.syncCamera(true);
  }

  // ---- правила ------------------------------------------------------------
  rebuildRules() {
    const byTrigger = {};
    for (const trigger of ['enter', 'touch', 'stand', 'stomp', 'hit', 'use']) byTrigger[trigger] = new Map();
    const ticks = [];
    const starts = [];
    const { world } = this;
    for (let ty = 0; ty < world.height; ty++) {
      for (let tx = 0; tx < world.width; tx++) {
        const def = world.defAt(tx, ty);
        if (!def) continue;
        const rules = rulesForBlock(def, world.rules).filter((r) => r.enabled !== false);
        // Блок расширения может не иметь правил, но иметь JS-обработчики.
        const hooks =
          def.source === 'ext' && Array.isArray(def.extHooks)
            ? def.extHooks.filter((name) => byTrigger[name] || name === 'tick' || name === 'start')
            : [];
        if (!rules.length && !hooks.length) continue;
        const entry = { tx, ty, index: ty * world.width + tx, id: def.id, def, rules };
        const triggers = new Set(rules.map((rule) => rule.trigger).concat(hooks));
        for (const trigger of triggers) {
          if (trigger === 'tick') {
            if (!ticks.includes(entry)) ticks.push(entry);
          } else if (trigger === 'start') {
            if (!starts.includes(entry)) starts.push(entry);
          } else if (byTrigger[trigger] && !byTrigger[trigger].has(entry.index)) {
            byTrigger[trigger].set(entry.index, entry);
          }
        }
      }
    }
    this.ruleMaps = byTrigger;
    this.tickEntries = ticks;
    this.startEntries = starts;
  }

  cellState(index) {
    let state = this.cellStates.get(index);
    if (!state) {
      state = { lastTouch: -99, once: new Set(), tickNext: 0 };
      this.cellStates.set(index, state);
    }
    return state;
  }

  fireAt(tx, ty, trigger, extra = {}) {
    const map = this.ruleMaps[trigger];
    if (!map) return;
    const entry = map.get(ty * this.world.width + tx);
    if (entry) this.fireEntry(entry, trigger, extra);
  }

  fireEntry(entry, trigger, extra = {}) {
    const state = this.cellState(entry.index);
    let index = -1;
    for (const rule of entry.rules) {
      index += 1;
      if (rule.trigger !== trigger || rule.enabled === false) continue;
      const wantsOnce = (rule.conditions || []).some((c) => c.type === 'once');
      if (wantsOnce && state.once.has(index)) continue;
      const ctx = {
        score: this.score,
        hearts: this.player.hearts,
        powers: this.player.powers,
        firedOnce: state.once.has(index),
        player: this.player,
        world: this.world,
      };
      if (!checkConditions(rule.conditions, ctx, Math.random)) continue;
      if (wantsOnce) state.once.add(index);
      for (const action of rule.actions) {
        this.applyAction(action, entry, trigger);
        if (this.state !== 'playing') break;
      }
      if (this.state !== 'playing') break;
    }
    this.fireExtHook(entry, trigger, extra);
  }

  applyAction(action, entry, trigger) {
    switch (action.type) {
      case 'score':
        this.addScore(Number(action.value) || 0);
        break;
      case 'damage':
        this.damage(Number(action.value) || 1);
        break;
      case 'heal':
        this.heal(Number(action.value) || 1);
        break;
      case 'bounce':
        this.player.vy = -(Number(action.value) || 15);
        this.player.onGround = false;
        break;
      case 'speed':
        this.player.speedBoost = Math.max(this.player.speedBoost, Number(action.value) || 3);
        break;
      case 'invincible':
        this.player.invuln = Math.max(this.player.invuln, Number(action.value) || 3);
        break;
      case 'remove':
        if (entry && entry.index >= 0) this.removeCell(entry);
        break;
      case 'setBlock':
        if (entry && entry.index >= 0 && action.value) this.setCell(entry, action.value);
        break;
      case 'message':
        this.message(String(action.value || ''));
        break;
      case 'sound':
        audio.play(String(action.value || 'coin'));
        break;
      case 'particles':
        this.burst(entry ? entry.tx : this.player.x, entry ? entry.ty : this.player.y, String(action.value || '#fff'), 10);
        break;
      case 'teleport':
        this.teleportTo(String(action.value || ''));
        break;
      case 'spawnEnemy':
        this.spawnEnemy(entry ? entry.tx : this.player.x, entry ? entry.ty : this.player.y);
        break;
      case 'win':
        this.finish(true);
        break;
      case 'lose':
        this.finish(false);
        break;
      case 'ext':
        this.runExtAction(String(action.value || ''), entry, trigger);
        break;
      default:
        break;
    }
  }

  removeCell(entry) {
    this.world.setCell(entry.tx, entry.ty, null);
    this.cellStates.delete(entry.index);
    this.rebuildRules();
    this.burst(entry.tx, entry.ty, entry.def?.color || '#fff', 8);
  }

  setCell(entry, id) {
    this.world.setCell(entry.tx, entry.ty, id);
    this.cellStates.delete(entry.index);
    this.rebuildRules();
  }

  teleportTo(blockId) {
    const { world } = this;
    for (let ty = 0; ty < world.height; ty++) {
      for (let tx = 0; tx < world.width; tx++) {
        if (world.idAt(tx, ty) === blockId) {
          this.player.x = tx + 0.1;
          this.player.y = ty + 0.05;
          this.player.vx = 0;
          this.player.vy = 0;
          this.prevOverlap.clear();
          this.burst(tx, ty, '#ffffff', 14);
          audio.play('zap');
          return true;
        }
      }
    }
    return false;
  }

  spawnEnemy(tx, ty) {
    this.world.enemies.push({
      x: tx + 0.1,
      y: ty,
      w: 0.8,
      h: 0.8,
      vx: -2.1,
      vy: 0,
      alive: true,
      anim: 0,
      onGround: false,
    });
  }

  burst(tx, ty, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const life = 0.35 + Math.random() * 0.5;
      this.particles.push({
        x: tx + 0.5 + (Math.random() - 0.5) * 0.6,
        y: ty + 0.5 + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * 6,
        vy: -2 - Math.random() * 5,
        life,
        maxLife: life,
        color,
        size: 0.08 + Math.random() * 0.12,
      });
    }
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }

  // ---- состояние ----------------------------------------------------------
  addScore(value) {
    const amount = clamp(Number(value) || 0, -9999, 9999);
    this.score = Math.max(0, this.score + amount);
    if (amount > 0 && amount <= 3) this.coins += 1;
    this.emitHud(true);
  }

  damage(amount = 1) {
    const player = this.player;
    if (this.state !== 'playing' || player.invuln > 0) return;
    player.hearts -= Math.max(1, Math.round(amount));
    player.invuln = 1.4;
    player.vx = -player.facing * 6;
    player.vy = -7;
    this.flash = 0.9;
    audio.play('hit');
    this.emitHud(true);
    if (player.hearts <= 0) {
      player.hearts = 0;
      this.finish(false);
    }
  }

  heal(amount = 1) {
    this.player.hearts = Math.min(this.player.maxHearts, this.player.hearts + Math.round(amount));
    audio.play('gem');
    this.emitHud(true);
  }

  respawn() {
    const spawn = this.world.spawn;
    this.player.x = spawn.x;
    this.player.y = spawn.y + 0.05;
    this.player.vx = 0;
    this.player.vy = 0;
    this.prevOverlap.clear();
  }

  message(text) {
    if (!text) return;
    this.onEvent({ type: 'message', text });
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.onEvent({ type: 'paused' });
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.onEvent({ type: 'resumed' });
    }
  }

  finish(win) {
    if (this.state === 'won' || this.state === 'lost') return;
    this.state = win ? 'won' : 'lost';
    if (win) {
      audio.play('win');
      this.burst(this.player.x, this.player.y, '#ffd93d', 26);
    } else {
      audio.play('lose');
    }
    if (this.extHost) {
      this.extHost.broadcast('game', {
        event: win ? 'win' : 'lose',
        score: this.score,
        time: this.time,
        hearts: this.player.hearts,
      });
    }
    this.onEvent({
      type: win ? 'win' : 'lose',
      score: this.score,
      coins: this.coins,
      time: this.time,
      hearts: this.player.hearts,
    });
    if (typeof document !== 'undefined') this.render();
  }

  // ---- расширения ---------------------------------------------------------
  attachExtensions(host) {
    this.extHost = host;
    host.onCommand = (commands, runtime) => this.handleCommands(commands, runtime);
    // Команды, которые расширение успело отправить до старта игры.
    for (const item of host.items.values()) {
      const pending = typeof item.runtime.drain === 'function' ? item.runtime.drain() : [];
      if (pending.length) this.handleCommands(pending, item.runtime);
    }
  }

  fireExtHook(entry, trigger, extra) {
    const def = entry.def;
    if (!def || def.source !== 'ext' || !this.extHost) return;
    if (!Array.isArray(def.extHooks) || !def.extHooks.includes(trigger)) return;
    const item = this.extHost.get(def.extId);
    if (!item) return;
    const key = `${def.extId}:${def.extBlockId}:${trigger}`;
    const last = this.extThrottle.get(key) || -99;
    if (this.time - last < 0.15) return;
    this.extThrottle.set(key, this.time);
    item.runtime.event('block', {
      block: def.extBlockId,
      event: trigger,
      trigger,
      x: entry.tx,
      y: entry.ty,
      score: this.score,
      hearts: this.player.hearts,
      powers: this.player.powers,
      ...extra,
    });
  }

  runExtAction(value, entry, trigger) {
    if (!this.extHost) return;
    const [extId, actionId] = String(value).split(':');
    const item = this.extHost.get(extId);
    if (!item) return;
    item.runtime.event('action', {
      action: actionId,
      ctx: {
        x: entry ? entry.tx : Math.floor(this.player.x),
        y: entry ? entry.ty : Math.floor(this.player.y),
        trigger,
        score: this.score,
        hearts: this.player.hearts,
      },
    });
  }

  handleCommands(commands, runtime) {
    for (const cmd of commands.slice(0, 60)) {
      const p = (cmd && cmd.payload) || {};
      switch (cmd && cmd.name) {
        case 'score':
          this.addScore(clamp(Number(p.value) || 0, -9999, 9999));
          break;
        case 'damage':
          this.damage(clamp(Math.round(Number(p.value) || 1), 1, 9));
          break;
        case 'heal':
          this.heal(clamp(Math.round(Number(p.value) || 1), 1, 9));
          break;
        case 'bounce':
          this.player.vy = -clamp(Number(p.power) || 15, 1, 40);
          this.player.onGround = false;
          break;
        case 'teleport':
          this.player.x = clamp(Number(p.x) || 0, 0, this.world.width - 1);
          this.player.y = clamp(Number(p.y) || 0, 0, this.world.height - 1);
          this.player.vx = 0;
          this.player.vy = 0;
          break;
        case 'setBlock':
          this.world.setCell(Math.round(Number(p.x) || 0), Math.round(Number(p.y) || 0), p.id ? String(p.id).slice(0, 48) : null);
          this.rebuildRules();
          break;
        case 'particles':
          this.burst(Number(p.x) || 0, Number(p.y) || 0, String(p.color || '#fff').slice(0, 20), clamp(Number(p.count) || 8, 1, 40));
          break;
        case 'sound':
          audio.play(String(p.name || 'coin'));
          break;
        case 'speed':
          this.player.speedBoost = Math.max(this.player.speedBoost, clamp(Number(p.value) || 3, 0.5, 30));
          break;
        case 'invincible':
          this.player.invuln = Math.max(this.player.invuln, clamp(Number(p.value) || 3, 0.5, 30));
          break;
        case 'message':
          this.message(String(p.text || '').slice(0, 160));
          break;
        case 'win':
          this.finish(true);
          break;
        case 'lose':
          this.finish(false);
          break;
        default:
          break;
      }
    }
  }

  // ---- обновление ---------------------------------------------------------
  emitHud(force = false) {
    if (!force && this.hudTimer > 0) return;
    this.hudTimer = 0.1;
    this.onEvent({
      type: 'hud',
      hearts: this.player.hearts,
      maxHearts: this.player.maxHearts,
      score: this.score,
      coins: this.coins,
      time: this.time,
      powers: this.player.powers,
      state: this.state,
    });
  }

  syncCamera(instant = false) {
    const { world } = this;
    const worldPx = world.width * CELL;
    const playerCenter = (this.player.x + this.player.w / 2) * CELL;
    let target;
    if (worldPx <= VIEW_W) {
      target = -(VIEW_W - worldPx) / 2;
    } else {
      target = clamp(playerCenter - VIEW_W / 2, 0, worldPx - VIEW_W);
    }
    if (instant) this.camera = target;
    else this.camera += (target - this.camera) * 0.18;
  }

  update(dt, input) {
    if (this.state !== 'playing') return;
    this.time += dt;
    this.hudTimer = Math.max(0, this.hudTimer - dt);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    const player = this.player;
    player.invuln = Math.max(0, player.invuln - dt);
    player.speedBoost = Math.max(0, player.speedBoost - dt);

    const events = stepPlayer(player, this.world, input, dt);
    if (events.jumped) audio.play('jump');
    if (events.doubleJump) {
      this.burst(player.x, player.y + player.h, '#ffd93d', 6);
      audio.play('jump');
    }
    if (events.stomp) this.burst(player.x, player.y + player.h, '#ffffff', 4);

    // приземление / удар головой
    for (const tile of events.landedTiles) {
      this.fireAt(tile.tx, tile.ty, 'stand');
      if (events.stomp) this.fireAt(tile.tx, tile.ty, 'stomp');
    }
    for (const tile of events.ceilingTiles) this.fireAt(tile.tx, tile.ty, 'hit');

    // Вход в блок / касание. Небольшой запас нужен, чтобы касание твёрдого
    // блока (шипы, лава) срабатывало, когда персонаж упирается в него.
    const margin = 0.06;
    const touches = this.world.tilesIn(
      player.x - margin,
      player.y - margin,
      player.w + margin * 2,
      player.h + margin * 2
    );
    const nowSet = new Set();
    for (const tile of touches) {
      const index = tile.ty * this.world.width + tile.tx;
      nowSet.add(index);
      if (!this.prevOverlap.has(index)) this.fireAt(tile.tx, tile.ty, 'enter');
      const state = this.cellState(index);
      if (this.time - state.lastTouch > 0.4) {
        state.lastTouch = this.time;
        this.fireAt(tile.tx, tile.ty, 'touch');
      }
    }
    this.prevOverlap = nowSet;

    // тикающие правила
    for (const entry of this.tickEntries) {
      const state = this.cellState(entry.index);
      if (this.time >= state.tickNext) {
        const rule = entry.rules.find((r) => r.trigger === 'tick');
        const every = Math.max(0.2, Number(rule?.every) || 1);
        state.tickNext = this.time + every;
        if (this.world.idAt(entry.tx, entry.ty) === entry.id) this.fireEntry(entry, 'tick');
      }
    }

    // кнопка «использовать»
    if (input.use) {
      const px = Math.floor(player.x + player.w / 2);
      const py = Math.floor(player.y + player.h / 2);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) this.fireAt(px + dx, py + dy, 'use');
      }
    }

    this.updateEnemies(dt);
    this.updateParticles(dt);

    if (player.y > this.world.height + 1.5) {
      player.invuln = 0;
      this.damage(1);
      if (this.state === 'playing') this.respawn();
    }

    this.syncCamera();
    this.emitHud();

    // тик расширений
    if (this.extHost) {
      this.tickTimer -= dt;
      if (this.tickTimer <= 0) {
        this.tickTimer = 0.25;
        this.extHost.broadcast('game', {
          event: 'tick',
          time: this.time,
          score: this.score,
          hearts: player.hearts,
          powers: player.powers,
          player: { x: player.x, y: player.y, vx: player.vx, vy: player.vy },
        });
      }
    }
  }

  updateEnemies(dt) {
    const player = this.player;
    this.world.enemies.forEach((enemy, i) => {
      if (!enemy.alive) return;
      stepEnemy(enemy, this.world, dt);
      if (enemy.y > this.world.height + 2) {
        enemy.alive = false;
        return;
      }
      if (!overlaps(player, enemy)) return;

      const stomp = player.vy > 0.5 && player.y + player.h - enemy.y < 0.65;
      if (stomp || player.dashTime > 0) {
        enemy.alive = false;
        this.addScore(3);
        this.burst(enemy.x, enemy.y, '#ff9f43', 14);
        audio.play('zap');
        if (stomp) {
          player.vy = -PHYS.stompBounce;
          player.onGround = false;
        }
        return;
      }
      // Иначе — правила блока «враг» (по умолчанию урон).
      this.fireEnemyRules(enemy, i);
    });
  }

  fireEnemyRules(enemy, index) {
    const def = this.registry.get('enemy');
    if (!def) return;
    const rules = rulesForBlock(def, this.world.rules).filter((r) => r.trigger === 'touch');
    if (!rules.length) {
      this.damage(1);
      return;
    }
    const entry = { tx: Math.floor(enemy.x), ty: Math.floor(enemy.y), index: -1000 - index, id: 'enemy', def, rules };
    this.fireEntry(entry, 'touch');
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 26 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  render() {
    this.painter.draw({
      player: this.player,
      camera: this.camera,
      particles: this.particles,
      time: this.time,
      flash: this.flash,
      inWater: this.world.isLiquid(
        Math.floor(this.player.x + this.player.w / 2),
        Math.floor(this.player.y + this.player.h / 2)
      ),
    });
  }

  // ---- цикл ---------------------------------------------------------------
  emitStart() {
    this.onEvent({
      type: 'start',
      hearts: this.player.hearts,
      maxHearts: this.player.maxHearts,
      powers: this.player.powers,
      screens: this.world.screens,
    });
    this.emitHud(true);
    if (this.extHost) {
      this.extHost.broadcast('game', { event: 'start', screen: 0, hearts: this.player.hearts, powers: this.player.powers });
    }
    for (const entry of this.startEntries) this.fireEntry(entry, 'start');
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.input.attach();
    this.emitStart();
    this.render();
    this.last = performance.now();
    const frame = (ts) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(frame);
      const delta = Math.min(0.12, (ts - this.last) / 1000);
      this.last = ts;
      if (this.state === 'playing') {
        this.acc += delta;
        const input = this.input.read();
        let steps = 0;
        while (this.acc >= STEP && steps < 10) {
          this.update(STEP, input);
          this.acc -= STEP;
          steps += 1;
          input.jumpPressed = false;
          input.dash = false;
          input.use = false;
          if (this.state !== 'playing') break;
        }
        if (steps === 10) this.acc = 0;
      }
      this.render();
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.detach();
  }

  destroy() {
    this.stop();
    if (this.extHost) this.extHost.dispose();
  }
}
