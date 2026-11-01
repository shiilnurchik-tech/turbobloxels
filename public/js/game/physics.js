/**
 * Физика платформера. Единицы — тайлы и секунды. Без DOM.
 * Все функции мутируют переданное «тело» {x, y, w, h, vx, vy}.
 */

export const PHYS = {
  gravity: 62,
  maxFall: 42,
  runSpeed: 7.0,
  accelGround: 78,
  accelAir: 46,
  frictionGround: 66,
  frictionAir: 6,
  jumpVel: 19.6,
  jumpCut: 9,
  coyote: 0.1,
  jumpBuffer: 0.12,
  waterGravity: 0.28,
  waterMaxFall: 6,
  waterSwim: 6.5,
  climbSpeed: 5.2,
  stompBounce: 14,
  dashSpeed: 17,
  dashTime: 0.16,
  dashCooldown: 0.9,
};

const EPS = 1e-6;

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Горизонтальное движение с разрешением коллизий по тайлам. */
export function moveHorizontal(body, world, dx) {
  if (!dx) return false;
  body.x += dx;
  const y0 = Math.floor(body.y + EPS);
  const y1 = Math.floor(body.y + body.h - EPS);
  if (dx > 0) {
    const tx = Math.floor(body.x + body.w - EPS);
    for (let ty = y0; ty <= y1; ty++) {
      if (world.isSolid(tx, ty)) {
        body.x = tx - body.w;
        return true;
      }
    }
  } else {
    const tx = Math.floor(body.x);
    for (let ty = y0; ty <= y1; ty++) {
      if (world.isSolid(tx, ty)) {
        body.x = tx + 1;
        return true;
      }
    }
  }
  return false;
}

/**
 * Вертикальное движение.
 * @returns {{landed:boolean, ceiling:boolean, tiles:Array}}
 */
export function moveVertical(body, world, dy) {
  const result = { landed: false, ceiling: false, tiles: [] };
  if (!dy) {
    const tiles = tilesUnder(body, world);
    return { ...result, landed: tiles.length > 0, tiles };
  }
  body.y += dy;
  const x0 = Math.floor(body.x + EPS);
  const x1 = Math.floor(body.x + body.w - EPS);
  if (dy > 0) {
    const ty = Math.floor(body.y + body.h - EPS);
    for (let tx = x0; tx <= x1; tx++) {
      if (world.isSolid(tx, ty)) {
        body.y = ty - body.h;
        result.landed = true;
        result.tiles.push({ tx, ty });
      }
    }
  } else if (dy < 0) {
    const ty = Math.floor(body.y);
    for (let tx = x0; tx <= x1; tx++) {
      if (world.isSolid(tx, ty)) {
        body.y = ty + 1;
        result.ceiling = true;
        result.tiles.push({ tx, ty });
      }
    }
  }
  return result;
}

export function tilesUnder(body, world) {
  const out = [];
  const y = Math.floor(body.y + body.h + 0.02);
  const x0 = Math.floor(body.x + 0.02);
  const x1 = Math.floor(body.x + body.w - 0.02);
  for (let tx = x0; tx <= x1; tx++) {
    if (world.isSolid(tx, y)) {
      const def = world.defAt(tx, y);
      if (def) out.push({ tx, ty: y, def });
    }
  }
  return out;
}

export function centerTile(body) {
  return {
    tx: Math.floor(body.x + body.w / 2),
    ty: Math.floor(body.y + body.h / 2),
  };
}

export function makePlayer(spawn, world) {
  const extraHeart = (world.powers || []).includes('heart') ? 1 : 0;
  return {
    x: spawn.x,
    y: spawn.y + 0.05,
    w: 0.8,
    h: 0.95,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 1,
    coyote: 0,
    jumpBuffer: 0,
    jumpsUsed: 0,
    dashTime: 0,
    dashCd: 0,
    invuln: 0,
    speedBoost: 0,
    hearts: 3 + extraHeart,
    maxHearts: 3 + extraHeart,
    powers: world.powers || [],
    anim: 0,
    alive: true,
  };
}

/**
 * Один шаг физики игрока.
 * @param {object} player
 * @param {object} world
 * @param {{left:boolean,right:boolean,up:boolean,down:boolean,jump:boolean,jumpPressed:boolean,dash:boolean}} input
 * @param {number} dt
 */
export function stepPlayer(player, world, input, dt, consts = PHYS) {
  const events = {
    jumped: false,
    doubleJump: false,
    landedTiles: [],
    ceilingTiles: [],
    stomp: false,
    inWater: false,
    onLadder: false,
    dashed: false,
  };

  const center = centerTile(player);
  const inWater = world.isLiquid(center.tx, center.ty) || world.isLiquid(center.tx, Math.floor(player.y + player.h - 0.1));
  const ladderTile = world.isClimbable(center.tx, center.ty);
  events.inWater = inWater;
  events.onLadder = ladderTile;

  const settings = world.settings || {};
  const speedMult =
    (player.powers.includes('speed') ? 1.2 : 1) * (player.speedBoost > 0 ? 1.45 : 1) * (settings.speed || 1);
  const maxSpeed = consts.runSpeed * speedMult;

  // --- рывок ---------------------------------------------------------------
  if (player.dashCd > 0) player.dashCd = Math.max(0, player.dashCd - dt);
  if (input.dash && player.powers.includes('dash') && player.dashCd <= 0 && player.dashTime <= 0) {
    player.dashTime = consts.dashTime;
    player.dashCd = consts.dashCooldown;
    events.dashed = true;
  }
  if (player.dashTime > 0) {
    player.dashTime = Math.max(0, player.dashTime - dt);
    player.vx = (player.facing || 1) * consts.dashSpeed;
  }

  // --- горизонталь ---------------------------------------------------------
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir !== 0) player.facing = dir;
  const groundTiles = player.onGround ? tilesUnder(player, world) : [];
  let friction = 0.9;
  if (groundTiles.length) {
    friction = groundTiles.reduce((min, t) => Math.min(min, t.def.friction ?? 0.9), 1);
  }

  if (player.dashTime <= 0) {
    const speed = Math.abs(player.vx);
    if (speed > maxSpeed) {
      // Хвост рывка: гасим превышение, но не мгновенно.
      const decayed = Math.max(maxSpeed, speed - 55 * dt);
      player.vx = Math.sign(player.vx) * decayed;
    } else if (dir !== 0) {
      const accel = (player.onGround ? consts.accelGround : consts.accelAir) * (ladderTile ? 0.6 : 1);
      player.vx += dir * accel * dt;
      player.vx = clamp(player.vx, -maxSpeed, maxSpeed);
    } else {
      const f = (player.onGround ? consts.frictionGround : consts.frictionAir) * clamp(friction, 0.02, 1) * dt;
      if (Math.abs(player.vx) <= f) player.vx = 0;
      else player.vx -= Math.sign(player.vx) * f;
    }
  }
  player.vx = clamp(player.vx, -Math.max(maxSpeed, consts.dashSpeed), Math.max(maxSpeed, consts.dashSpeed));

  // --- вертикаль -----------------------------------------------------------
  const gravity = consts.gravity * (settings.gravity || 1) * (inWater ? consts.waterGravity : 1);
  player.vy += gravity * dt;
  const maxFall = inWater ? consts.waterMaxFall : consts.maxFall;
  if (player.vy > maxFall) player.vy = maxFall;

  if (player.jumpBuffer > 0) player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
  if (input.jumpPressed) player.jumpBuffer = consts.jumpBuffer;
  if (player.onGround) {
    player.coyote = consts.coyote;
    player.jumpsUsed = 0;
  } else {
    player.coyote = Math.max(0, player.coyote - dt);
  }

  const jumpPower = consts.jumpVel * (player.powers.includes('jump') ? 1.18 : 1) * (settings.jump || 1);

  if (inWater) {
    if (input.jump) player.vy = Math.max(player.vy - 46 * dt, -consts.waterSwim);
    player.jumpsUsed = 0;
  } else if (ladderTile && (input.up || input.down)) {
    player.vy = input.up ? -consts.climbSpeed : consts.climbSpeed;
  } else if (player.jumpBuffer > 0) {
    if (player.coyote > 0) {
      player.vy = -jumpPower;
      player.onGround = false;
      player.coyote = 0;
      player.jumpBuffer = 0;
      player.jumpsUsed = 1;
      events.jumped = true;
    } else if (player.powers.includes('double') && player.jumpsUsed < 2) {
      player.vy = -jumpPower * 0.92;
      player.jumpsUsed = 2;
      player.jumpBuffer = 0;
      events.doubleJump = true;
      events.jumped = true;
    }
  }

  // Отпустил прыжок — прыжок ниже.
  if (!input.jump && player.vy < 0 && !inWater) {
    player.vy = Math.min(0, player.vy + consts.jumpCut * dt * 12);
  }

  const impactVy = player.vy;
  const blocked = moveHorizontal(player, world, player.vx * dt);
  if (blocked) player.vx = 0;

  const wasOnGround = player.onGround;
  player.onGround = false;
  const vres = moveVertical(player, world, player.vy * dt);
  if (vres.landed) {
    player.onGround = true;
    if (player.vy > 0) player.vy = 0;
    events.landedTiles = vres.tiles
      .map((t) => ({ ...t, def: world.defAt(t.tx, t.ty) }))
      .filter((t) => t.def);
    if (!wasOnGround && impactVy > 7) events.stomp = true;
  }
  if (vres.ceiling) {
    player.vy = 0;
    events.ceilingTiles = vres.tiles
      .map((t) => ({ ...t, def: world.defAt(t.tx, t.ty) }))
      .filter((t) => t.def);
  }
  if (!player.onGround && vres.tiles.length) player.onGround = true;

  // Анимационный таймер.
  if (player.onGround && Math.abs(player.vx) > 0.3) player.anim += dt * Math.abs(player.vx) * 1.2;
  else if (!player.onGround) player.anim += dt * 2;

  return events;
}

/** Простая физика ходячего врага. */
export function stepEnemy(enemy, world, dt, consts = PHYS) {
  enemy.vy = Math.min(consts.maxFall, enemy.vy + consts.gravity * dt);
  const blocked = moveHorizontal(enemy, world, enemy.vx * dt);
  if (blocked) {
    enemy.vx *= -1;
    enemy.x += Math.sign(enemy.vx) * 0.02;
  }
  const before = enemy.onGround;
  enemy.onGround = false;
  const res = moveVertical(enemy, world, enemy.vy * dt);
  if (res.landed) {
    enemy.onGround = true;
    enemy.vy = 0;
  }
  // Не даём падать с края платформы: разворачиваемся у обрыва.
  if (enemy.onGround) {
    const aheadX = Math.floor(enemy.x + enemy.w / 2 + Math.sign(enemy.vx) * 0.6);
    const footY = Math.floor(enemy.y + enemy.h + 0.1);
    if (!world.isSolid(aheadX, footY)) enemy.vx *= -1;
  }
  enemy.anim = (enemy.anim || 0) + dt * 8;
  if (!before && !enemy.onGround) enemy.anim += dt * 2;
  return enemy;
}
