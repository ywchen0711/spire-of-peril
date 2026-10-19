// SPIRE OF PERIL — moving the climber. No DOM (node tests run it).
// The climber is an upright cylinder (feet at y). Solids are boxes turned about the vertical axis, or upright cylinders.
// Moving and spinning platforms carry whoever stands on them.
import { partAt } from './tower.js';

export const TUNE = { speed: 9, jump: 13, gravity: 34, pad: 24, climb: 7, radius: 0.42, height: 1.9, accelGround: 70, accelAir: 26, accelIce: 5, coyote: 0.1, maxFall: 60 };
const SOLID = new Set(['solid', 'pad', 'belt', 'truss', 'fade', 'ice', 'glass', 'finish']);

export function newPlayer(at) {
  return { x: at[0], y: at[1], z: at[2], vx: 0, vy: 0, vz: 0, grounded: false, ground: null, airT: 0, facing: 0, dead: null, won: false, climbing: false, jumpHeld: false };
}
// the world at time t: every part's current place, and how far it moved since the last frame
export function worldAt(tower, t, prev, fades) {
  const list = prev && prev.length === tower.parts.length ? prev : tower.parts.map((p) => ({ p }));
  for (const s of list) {
    const p = s.p, ox = s.x, oy = s.y, oz = s.z, oyaw = s.yaw;
    partAt(p, t, s);
    if (p.kind === 'fade' && fades) { const f = fades[p.id]; if (f !== undefined && t - f > 0.55 && t - f < 3.2) s.active = false; }
    s.dx = ox === undefined ? 0 : s.x - ox; s.dy = oy === undefined ? 0 : s.y - oy; s.dz = oz === undefined ? 0 : s.z - oz; s.dyaw = oyaw === undefined ? 0 : s.yaw - oyaw;
  }
  return list;
}

// push the cylinder out of one part; returns 'top' | 'bottom' | 'side' | null
function resolve(pl, s, T) {
  const p = s.p, hy = p.size[1] / 2, y0 = s.y - hy, y1 = s.y + hy;
  if (pl.y >= y1 || pl.y + T.height <= y0) return null;
  let lx = pl.x - s.x, lz = pl.z - s.z, nx, nz, depth;
  if (p.shape === 'cyl') {
    const R = p.size[0] / 2, d = Math.hypot(lx, lz); if (d >= R + T.radius) return null;
    depth = R + T.radius - d; nx = d > 1e-6 ? lx / d : 1; nz = d > 1e-6 ? lz / d : 0;
  } else {
    const c = Math.cos(-s.yaw), sn = Math.sin(-s.yaw);
    // into the box's own frame (three.js: yaw turns the x axis towards −z)
    const ux = lx * Math.cos(s.yaw) - lz * Math.sin(s.yaw), uz = lx * Math.sin(s.yaw) + lz * Math.cos(s.yaw);
    void c; void sn;
    const hx = p.size[0] / 2, hz = p.size[2] / 2, cx = Math.max(-hx, Math.min(hx, ux)), cz = Math.max(-hz, Math.min(hz, uz));
    let ex = ux - cx, ez = uz - cz, d = Math.hypot(ex, ez);
    if (d >= T.radius) return null;
    let lnx, lnz;
    if (d > 1e-6) { lnx = ex / d; lnz = ez / d; depth = T.radius - d; }
    else { // centre inside the box: out through the nearest side
      const px = hx - Math.abs(ux), pz = hz - Math.abs(uz);
      if (px < pz) { lnx = Math.sign(ux) || 1; lnz = 0; depth = px + T.radius; } else { lnx = 0; lnz = Math.sign(uz) || 1; depth = pz + T.radius; }
    }
    // back to the world
    nx = lnx * Math.cos(s.yaw) + lnz * Math.sin(s.yaw); nz = -lnx * Math.sin(s.yaw) + lnz * Math.cos(s.yaw);
  }
  const up = y1 - pl.y, down = pl.y + T.height - y0;
  // land on top when that is the shortest way out (or we were above it a moment ago)
  if (up <= Math.min(depth, 0.6) || (pl.vy <= 0 && up < 0.6 && pl.prevY >= y1 - 0.05)) { pl.y = y1; return 'top'; }
  if (down < depth && pl.vy > 0 && down < 0.5) { pl.y = y0 - T.height; return 'bottom'; }
  pl.x += nx * depth; pl.z += nz * depth;
  return 'side';
}
function overlaps(pl, s, T, grow = 0) {
  const p = s.p, hy = p.size[1] / 2;
  if (pl.y >= s.y + hy + grow || pl.y + T.height <= s.y - hy - grow) return false;
  const lx = pl.x - s.x, lz = pl.z - s.z;
  if (p.shape === 'cyl') return Math.hypot(lx, lz) < p.size[0] / 2 + T.radius + grow;
  const ux = lx * Math.cos(s.yaw) - lz * Math.sin(s.yaw), uz = lx * Math.sin(s.yaw) + lz * Math.cos(s.yaw);
  const cx = Math.max(-p.size[0] / 2, Math.min(p.size[0] / 2, ux)), cz = Math.max(-p.size[2] / 2, Math.min(p.size[2] / 2, uz));
  return Math.hypot(ux - cx, uz - cz) < T.radius + grow;
}

// one step. input: { mx, mz } wanted direction in the world (length ≤ 1), jump (held), mods: { speed, gravity, jump } multipliers
// returns events: [{ type: 'jump' | 'land' | 'pad' | 'die' | 'win' | 'fade', part }]
export function stepPlayer(pl, input, world, dt, mods = {}, T = TUNE, t = 0, fades = null) {
  const ev = [];
  if (pl.dead || pl.won) return ev;
  const speed = T.speed * (mods.speed || 1), grav = T.gravity * (mods.gravity || 1), jumpV = T.jump * (mods.jump || 1);
  // ridden by the platform underfoot: follow its move and its turn
  if (pl.grounded && pl.ground) {
    const g = pl.ground;
    pl.x += g.dx; pl.y += g.dy; pl.z += g.dz;
    if (g.dyaw) { const rx = pl.x - g.x, rz = pl.z - g.z, c = Math.cos(-g.dyaw), s = Math.sin(-g.dyaw); pl.x = g.x + rx * c - rz * s; pl.z = g.z + rx * s + rz * c; pl.facing += g.dyaw; }
  }
  const onIce = pl.grounded && pl.ground && pl.ground.p.kind === 'ice', belt = pl.grounded && pl.ground && pl.ground.p.kind === 'belt' ? pl.ground.p.belt : null;
  // walking
  const want = Math.min(1, Math.hypot(input.mx, input.mz));
  const tx = input.mx * speed, tz = input.mz * speed;
  const acc = (pl.grounded ? (onIce ? T.accelIce : T.accelGround) : T.accelAir) * dt;
  const dvx = tx - pl.vx, dvz = tz - pl.vz, dl = Math.hypot(dvx, dvz);
  // in the air, letting go of the stick brakes hard (so you can stop over a small platform)
  if (dl > 0) { const k = Math.min(1, acc * (!pl.grounded && want < 0.1 ? 1.6 : 1) / dl); pl.vx += dvx * k; pl.vz += dvz * k; }
  if (want > 0.1) pl.facing = Math.atan2(input.mx, input.mz);
  // jumping (a moment of grace after stepping off an edge)
  if (input.jump && !pl.jumpHeld && (pl.grounded || pl.airT < T.coyote) && pl.vy <= 0.1) { pl.vy = jumpV; pl.grounded = false; pl.airT = 1; ev.push({ type: 'jump' }); }
  pl.jumpHeld = !!input.jump;
  // climbing a truss: push into it
  pl.climbing = false;
  if (want > 0.1) for (const s of world) {
    if (s.p.kind !== 'truss' || !s.active) continue;
    const near = overlaps(pl, s, T, 0.12);
    if (near) { const toward = (s.x - pl.x) * input.mx + (s.z - pl.z) * input.mz; if (toward > 0) { pl.climbing = true; pl.vy = T.climb; } }
  }
  if (!pl.climbing) pl.vy = Math.max(-T.maxFall, pl.vy - grav * dt);
  // move in small steps so fast falls never pass through a thin floor
  const bx = belt ? belt[0] : 0, bz = belt ? belt[2] : 0;
  const total = Math.hypot((pl.vx + bx) * dt, pl.vy * dt, (pl.vz + bz) * dt), n = Math.max(1, Math.ceil(total / 0.18));
  const wasGrounded = pl.grounded; pl.grounded = false; let ground = null;
  for (let k = 0; k < n; k++) {
    pl.prevY = pl.y;
    pl.x += (pl.vx + bx) * dt / n; pl.y += pl.vy * dt / n; pl.z += (pl.vz + bz) * dt / n;
    for (const s of world) {
      if (!s.active || !SOLID.has(s.p.kind)) continue;
      const r = resolve(pl, s, T);
      if (r === 'top') { if (pl.vy <= 0) { pl.vy = 0; pl.grounded = true; ground = s; } }
      else if (r === 'bottom') pl.vy = Math.min(pl.vy, 0);
    }
  }
  // standing still on the floor: a tiny probe keeps us grounded on gently moving platforms
  if (!pl.grounded && pl.vy <= 0) for (const s of world) {
    if (!s.active || !SOLID.has(s.p.kind)) continue;
    const top = s.y + s.p.size[1] / 2;
    if (Math.abs(pl.y - top) < 0.08 && overlaps({ ...pl, y: top - 0.05 }, s, { ...T, height: 0.1 })) { pl.y = top; pl.vy = 0; pl.grounded = true; ground = s; break; }
  }
  pl.ground = ground;
  if (pl.grounded) { pl.airT = 0; if (!wasGrounded) ev.push({ type: 'land', part: ground && ground.p }); } else pl.airT += dt;
  // what is underfoot does something
  if (pl.grounded && ground) {
    const k = ground.p.kind;
    if (k === 'pad') { pl.vy = T.pad * Math.sqrt(mods.gravity || 1); pl.grounded = false; pl.ground = null; ev.push({ type: 'pad' }); }
    if (k === 'fade' && fades && fades[ground.p.id] === undefined) { fades[ground.p.id] = t; ev.push({ type: 'fade', part: ground.p }); }
    if (k === 'finish') { pl.won = true; ev.push({ type: 'win' }); }
  }
  // red bricks
  for (const s of world) if (s.active && s.p.kind === 'kill' && overlaps(pl, s, T, -0.04)) { pl.dead = 'kill'; ev.push({ type: 'die', why: 'kill' }); break; }
  if (pl.y < -40) { pl.dead = 'fall'; ev.push({ type: 'die', why: 'fall' }); }
  return ev;
}
