// SPIRE OF PERIL — the tower: obstacle sections stacked into one column. No DOM (node tests build towers too).
//
// Every section fits a 16×16 m square and is written in its own frame: you arrive on the pad at the corner (−7, 0, −7)
// and leave from the pad at the opposite corner (7, H, 7). Sections are turned 180° in turn (and sometimes mirrored across
// the diagonal), so each one's exit pad is the next one's start and the whole tower stays one column around (0, 0).
//
// A part: { kind, shape: 'box' | 'cyl', pos: [x, y, z] (centre), size: [w, h, d] (cyl: [2r, h, 2r]), yaw, color, mo, belt }
//   kind: solid, kill, pad (bounces you up), belt (carries you), truss (climb it), fade (vanishes after you step on it),
//         ice (slippery), glass (solid, barely visible), finish, deco (no collision)
//   mo (motion): { type: 'slide', dir: [x, y, z], dist, period, phase } | { type: 'spin', speed } | { type: 'toggle', period, on, phase }
export function makeRng(seed) {
  return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const HALF = 7;
const PALETTE = ['#3fd0ff', '#ffb000', '#7cff5a', '#ff5ad0', '#a070ff', '#ff7a3a', '#40ffc0', '#ffe040', '#6a8aff', '#ff4a8a'];

// a point along the L-shaped path from the start corner, along x, then along z to the exit corner (length 28)
const L = (s) => (s <= 14 ? [-7 + s, -7] : [7, -7 + (s - 14)]);
const along = (s) => (s <= 14 ? 'x' : 'z');

// ---------------------------------------------------------------- section builders (local frame)
function maker(r) {
  const b = { parts: [], route: [{ x: -7, top: 0, z: -7, half: 1.5 }], H: 0 };
  b.add = (kind, pos, size, extra = {}) => { const p = { kind, shape: 'box', pos, size, yaw: 0, ...extra }; b.parts.push(p); return p; };
  b.plat = (x, top, z, w = 2.2, d = w, kind = 'solid', extra = {}) => b.add(kind, [x, top - 0.25, z], [w, 0.5, d], extra);
  b.stop = (x, top, z, half, flags = {}) => b.route.push({ x, top, z, half, ...flags });
  b.exit = (H) => { b.H = H; b.plat(7, H, 7, 3, 3); b.stop(7, H, 7, 1.5); };
  b.r = r;
  return b;
}
const SECTIONS = {
  // floating blocks climbing the L
  steps: { level: 0, name: ['階梯', 'Stairway'], build(b) {
    const H = 9 + b.r() * 2.5, n = 8;
    for (let i = 1; i < n; i++) { const [x, z] = L(28 * i / n), j = (b.r() - 0.5) * 1.0, sz = 1.5 + b.r() * 0.7; const px = along(28 * i / n) === 'x' ? x : x + j, pz = along(28 * i / n) === 'x' ? z + j : z; b.plat(px, H * i / n, pz, sz, sz); b.stop(px, H * i / n, pz, sz / 2); }
    b.exit(H);
  } },
  glass: { level: 2, name: ['玻璃階梯', 'Glass Steps'], build(b) {
    const H = 8 + b.r() * 2, n = 9;
    for (let i = 1; i < n; i++) { const [x, z] = L(28 * i / n), sz = 1.3 + b.r() * 0.4; b.plat(x, H * i / n, z, sz, sz, 'glass'); b.stop(x, H * i / n, z, sz / 2); }
    b.exit(H);
  } },
  // narrow beams over a kill floor
  beams: { level: 1, name: ['獨木橋', 'Tightropes'], build(b) {
    b.add('kill', [0, -1.4, 0], [12, 0.4, 12]);
    const segs = [[1.2, 6.2, 0.8], [7.2, 12.2, 1.6], [16, 21, 3.2], [22.2, 25.4, 4.0]];
    for (const [s0, s1, top] of segs) { const [x0, z0] = L(s0), [x1, z1] = L(s1); const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; along(s0) === 'x' ? b.plat(cx, top, cz, s1 - s0, 0.7) : b.plat(cx, top, cz, 0.7, s1 - s0); b.stop(x0, top, z0, 0.35); b.stop(x1, top, z1, 0.35, { walk: true }); }
    b.plat(7, 2.4, -7, 1.6, 1.6); b.route.splice(5, 0, { x: 7, top: 2.4, z: -7, half: 0.8 });
    b.exit(5);
  } },
  // a disc with a spinning red bar to jump over
  spinner: { level: 1, name: ['旋轉死亡棒', 'Sweeper'], build(b) {
    b.add('solid', [0, 1.2 - 0.3, 0], [9, 0.6, 9], { shape: 'cyl' });
    b.add('kill', [0, 1.2 + 0.45, 0], [8.6, 0.5, 0.5], { mo: { type: 'spin', speed: 1.4 + b.r() * 0.6 } });
    b.add('solid', [0, 1.2 + 0.45, 0], [0.8, 1.6, 0.8], { shape: 'cyl' });
    b.stop(-2.6, 1.2, -2.6, 1.2); b.stop(3.6, 1.2, 1.4, 0.6, { walk: true });
    b.plat(5.8, 2.6, 1.5, 2, 2); b.stop(5.8, 2.6, 1.5, 1);
    b.plat(7, 4.2, 4.4, 2, 2); b.stop(7, 4.2, 4.4, 1);
    b.exit(5.8);
  } },
  // sliding platforms between fixed ones
  movers: { level: 1, name: ['移動平台', 'Shuttles'], build(b) {
    const H = 8;
    for (let k = 1; k < 8; k++) {
      const s = k * 3.5, [x, z] = L(s), top = H * k / 8;
      if (k % 2) { const dir = along(s) === 'x' ? [0, 0, 1] : [1, 0, 0]; b.plat(x, top, z, 2.2, 2.2, 'solid', { mo: { type: 'slide', dir, dist: 2.2, period: 3.2 + b.r() * 1.4, phase: b.r() * 6.28 } }); b.stop(x, top, z, 1.1, { moving: true }); }
      else { b.plat(x, top, z, 2, 2); b.stop(x, top, z, 1); }
    }
    b.exit(H);
  } },
  // tiles that vanish soon after you step on them
  fade: { level: 1, name: ['消失地板', 'Crumbling Tiles'], build(b) {
    const H = 7, n = 9;
    for (let i = 1; i < n; i++) { const [x, z] = L(28 * i / n); b.plat(x, H * i / n, z, 1.8, 1.8, 'fade'); b.stop(x, H * i / n, z, 0.9); }
    b.exit(H);
  } },
  // belts that push you towards the edge
  conveyor: { level: 1, name: ['輸送帶', 'Conveyors'], build(b) {
    b.add('kill', [0, -1.4, 0], [12, 0.4, 12]);
    const v = 2.4 + b.r() * 1.2, sgn = () => (b.r() < 0.5 ? -1 : 1);
    b.plat(-1.5, 0.6, -7, 9, 2.2, 'belt', { belt: [0, 0, v * sgn()] }); b.stop(-5.5, 0.6, -7, 1); b.stop(2.5, 0.6, -7, 1, { walk: true });
    b.plat(7, 1.6, -7, 2.4, 2.4); b.stop(7, 1.6, -7, 1.2);
    b.plat(7, 2.6, 0.9, 2.2, 9, 'belt', { belt: [v * sgn(), 0, 0] }); b.stop(7, 2.6, -3.1, 1); b.stop(7, 2.6, 4.9, 1, { walk: true });
    b.exit(3.8);
  } },
  // pads that throw you upward
  pads: { level: 1, name: ['彈跳墊', 'Launch Pads'], build(b) {
    b.plat(-3, 0.5, -7, 2.4, 2.4, 'pad'); b.stop(-3, 0.5, -7, 1.2, { pad: true });
    b.plat(1.5, 7, -7, 3, 3); b.stop(1.5, 7, -7, 1.5);
    b.plat(5.8, 8.4, -5, 2, 2); b.stop(5.8, 8.4, -5, 1);
    b.plat(7, 8.4, -1.6, 2.2, 2.2, 'pad'); b.stop(7, 8.4, -1.6, 1.1, { pad: true });
    b.plat(7, 10, 2.8, 2.4, 2.4); b.stop(7, 10, 2.8, 1.2);
    b.exit(11.6);
  } },
  // climb a truss, then a narrow walkway with sliding blocks
  truss: { level: 1, name: ['攀爬架', 'Truss Climb'], build(b) {
    b.plat(-3.4, 0, -7, 2.6, 2.4); b.stop(-3.4, 0, -7, 1.2);
    b.add('truss', [-1.5, 5, -7], [1.2, 10, 1.2]); b.stop(-1.5, 10, -7, 0.6, { climb: true });
    b.plat(3.6, 10, -7, 7, 1.8); b.stop(3.6, 10, -7, 0.9);
    b.plat(7, 10, -1, 1.8, 10); b.stop(7, 10, -1, 0.9, { walk: true }); b.stop(7, 10, 3.4, 0.9, { walk: true });
    for (const z of [-3, 1.5]) b.add('kill', [7, 10.6, z], [1.1, 1.2, 1.1], { mo: { type: 'slide', dir: [1, 0, 0], dist: 1.6, period: 2.4 + b.r(), phase: b.r() * 6.28 } });
    b.exit(10);
  } },
  // tiny pillars
  pillars: { level: 2, name: ['針尖柱', 'Needle Pillars'], build(b) {
    const H = 8, n = 9;
    for (let i = 1; i < n; i++) { const [x, z] = L(28 * i / n), top = H * i / n; b.add('solid', [x, top - 1.5, z], [1, 3, 1]); b.stop(x, top, z, 0.5); }
    b.exit(H);
  } },
  // a walkway crossed by lasers that switch on and off
  lasers: { level: 2, name: ['雷射走廊', 'Laser Hall'], build(b) {
    b.plat(-0.5, 0, -7, 11, 2.4); b.stop(-5, 0, -7, 1.2); b.stop(4, 0, -7, 1.2, { walk: true });
    b.plat(7, 1.2, -7, 2.6, 2.6); b.stop(7, 1.2, -7, 1.3);
    b.plat(7, 2.4, 0.9, 2.4, 9.6); b.stop(7, 2.4, -3, 1.2); b.stop(7, 2.4, 5, 1.2, { walk: true });
    const per = 2.4, k = [[-3, 0, -7, 'x'], [0, 0, -7, 'x'], [3, 0, -7, 'x'], [7, 2.4, -2.5, 'z'], [7, 2.4, 0.5, 'z'], [7, 2.4, 3.5, 'z']];
    k.forEach(([x, top, z, ax], i) => b.add('kill', [x, top + 1.3, z], ax === 'x' ? [0.25, 2.6, 2.6] : [2.6, 2.6, 0.25], { mo: { type: 'toggle', period: per, on: 1.1, phase: i * 0.45 } }));
    b.exit(3.6);
  } },
  // ice: you keep sliding
  ice: { level: 1, name: ['冰面', 'Ice Rink'], build(b) {
    for (const [s, top] of [[4, 0.6], [10.5, 1.8], [17.5, 3.0], [24, 4.2]]) { const [x, z] = L(s); b.plat(x, top, z, 3, 3, 'ice'); b.stop(x, top, z, 1.5); }
    b.exit(5.4);
  } },
  // red blocks sliding across a walkway
  sweepers: { level: 2, name: ['掃蕩方塊', 'Crushers'], build(b) {
    b.plat(-0.5, 0.8, -7, 11, 1.8); b.stop(-5, 0.8, -7, 0.9); b.stop(4, 0.8, -7, 0.9, { walk: true });
    b.plat(7, 2.0, -7, 2.4, 2.4); b.stop(7, 2.0, -7, 1.2);
    b.plat(7, 3.2, 0.5, 1.8, 10); b.stop(7, 3.2, -3.5, 0.9); b.stop(7, 3.2, 4.5, 0.9, { walk: true });
    for (const [x, top, z, d] of [[-3, 0.8, -7, [0, 0, 1]], [1, 0.8, -7, [0, 0, 1]], [7, 3.2, -2, [1, 0, 0]], [7, 3.2, 2, [1, 0, 0]]])
      b.add('kill', [x, top + 0.6, z], [1.2, 1.2, 1.2], { mo: { type: 'slide', dir: d, dist: 2.2, period: 2.2 + b.r(), phase: b.r() * 6.28 } });
    b.exit(4.4);
  } },
  // spinning bars you ride
  disks: { level: 1, name: ['旋轉平台', 'Spinning Bridges'], build(b) {
    const spots = [[-1, -7, 1.2], [7, -7, 2.4], [7, 1, 3.6]];
    for (const [x, z, top] of spots) { b.add('solid', [x, top - 0.25, z], [6.5, 0.5, 1.4], { mo: { type: 'spin', speed: (b.r() < 0.5 ? -1 : 1) * (0.7 + b.r() * 0.4) } }); b.add('solid', [x, top - 0.6, z], [1, 0.8, 1], { shape: 'cyl' }); b.stop(x, top, z, 0.7, { moving: true }); }
    b.exit(4.8);
  } },
  // elevators
  elevator: { level: 0, name: ['電梯', 'Elevators'], build(b) {
    b.plat(-3.6, 0, -7, 2.6, 2.6); b.stop(-3.6, 0, -7, 1.3);
    b.plat(0, 3.5, -7, 2.6, 2.6, 'solid', { mo: { type: 'slide', dir: [0, 1, 0], dist: 3.5, period: 6, phase: 0 } }); b.stop(0, 3.5, -7, 1.3, { moving: true });
    b.plat(4.2, 7.2, -7, 2.6, 2.6); b.stop(4.2, 7.2, -7, 1.3);
    for (const [z, top] of [[-3.6, 8.4], [-0.2, 9.6], [3.2, 10.8]]) { b.plat(7, top, z, 2.2, 2.2); b.stop(7, top, z, 1.1); }
    b.exit(12);
  } },
  // a spiral round a pillar
  spiral: { level: 0, name: ['螺旋', 'Spiral'], build(b) {
    const H = 11, n = 13; b.add('solid', [0, H / 2 - 0.5, 0], [4.4, H, 4.4], { shape: 'cyl' });
    for (let i = 1; i <= n; i++) { const a = (-135 + i * 540 / (n + 1)) * Math.PI / 180, x = Math.cos(a) * 4, z = Math.sin(a) * 4, top = H * i / (n + 1); b.plat(x, top, z, 1.6, 1.6); b.stop(x, top, z, 0.8); }
    b.exit(H);
  } },
};
export const SECTION_IDS = Object.keys(SECTIONS);
export const sectionName = (id, en) => SECTIONS[id].name[en ? 1 : 0];

// ---------------------------------------------------------------- a whole tower
// count: how many sections; returns { parts, sections, spawn, top }
export function buildTower(seed, count = 6) {
  const r = makeRng(seed), pick = (level) => SECTION_IDS.filter((id) => SECTIONS[id].level === level);
  // easier sections low, harder ones high, no repeats
  const plan = [], used = new Set(), take = (pool) => { const left = pool.filter((id) => !used.has(id)); const id = left[Math.floor(r() * left.length)] || SECTION_IDS.find((x) => !used.has(x)); used.add(id); plan.push(id); };
  const levels = count <= 6 ? [0, 0, 1, 1, 1, 2] : [0, 0, 1, 1, 1, 1, 2, 2];
  for (let i = 0; i < count; i++) take(pick(levels[Math.min(i, levels.length - 1)]));
  const parts = [], sections = [];
  // the lobby: a wide floor below, and a few blocks up to the first pad
  parts.push({ kind: 'solid', shape: 'box', pos: [0, -3.5, 0], size: [44, 1, 44], yaw: 0, color: '#2a3040', sec: -1, lobby: true });
  for (const [x, z, top] of [[-10.5, -7, -2], [-10.5, -10.5, -1]]) parts.push({ kind: 'solid', shape: 'box', pos: [x, top - 0.5, z], size: [2.4, 1, 2.4], yaw: 0, color: '#3a4256', sec: -1 });
  parts.push({ kind: 'solid', shape: 'box', pos: [-7, -0.25, -7], size: [3, 0.5, 3], yaw: 0, color: '#e8eef8', sec: -1, spawn: true });
  let y = 0;
  plan.forEach((id, si) => {
    const b = maker(r); SECTIONS[id].build(b);
    const rot = si % 2 === 1, swap = r() < 0.5, color = PALETTE[(si + Math.floor(seed)) % PALETTE.length];
    const R = (x, z) => { let a = swap ? z : x, c = swap ? x : z; if (rot) { a = -a; c = -c; } return [a, c]; };
    for (const p of b.parts) {
      const [x, z] = R(p.pos[0], p.pos[2]), size = swap ? [p.size[2], p.size[1], p.size[0]] : p.size.slice();
      const q = { ...p, pos: [x, y + p.pos[1], z], size, yaw: swap ? -p.yaw : p.yaw, color: p.color || color, sec: si };
      if (p.mo) { q.mo = { ...p.mo }; if (p.mo.type === 'slide') { const [dx, dz] = R(p.mo.dir[0], p.mo.dir[2]); q.mo.dir = [dx, p.mo.dir[1], dz]; } if (p.mo.type === 'spin' && swap) q.mo.speed = -p.mo.speed; }
      if (p.belt) { const [bx, bz] = R(p.belt[0], p.belt[2]); q.belt = [bx, 0, bz]; }
      parts.push(q);
    }
    // corner posts, so each section reads as a storey
    for (const [cx, cz] of [[-8.2, -8.2], [8.2, -8.2], [-8.2, 8.2], [8.2, 8.2]]) parts.push({ kind: 'deco', shape: 'box', pos: [cx, y + b.H / 2, cz], size: [0.16, b.H, 0.16], yaw: 0, color, sec: si });
    sections.push({ id, y0: y, y1: y + b.H, color, route: b.route.map((s) => { const [x, z] = R(s.x, s.z); return { ...s, x, z, top: y + s.top }; }) });
    y += b.H;
  });
  // the finish, on the last exit pad
  const last = sections[sections.length - 1].route.slice(-1)[0];
  parts.push({ kind: 'finish', shape: 'box', pos: [last.x, y + 0.05, last.z], size: [3.2, 0.12, 3.2], yaw: 0, color: '#fff2a0', sec: sections.length - 1 });
  parts.forEach((p, i) => { p.id = i; });
  return { seed, parts, sections, spawn: [-7, 0, -7], top: y };
}

// where a part is at time t (and whether it is there at all)
export function partAt(p, t, out = {}) {
  let [x, y, z] = p.pos, yaw = p.yaw || 0, active = true;
  const m = p.mo;
  if (m) {
    if (m.type === 'slide') { const k = Math.sin((t / m.period) * Math.PI * 2 + m.phase) * m.dist; x += m.dir[0] * k; y += m.dir[1] * k; z += m.dir[2] * k; }
    else if (m.type === 'spin') yaw += m.speed * t;
    else if (m.type === 'toggle') active = ((t + m.phase) % m.period + m.period) % m.period < m.on;
  }
  out.x = x; out.y = y; out.z = z; out.yaw = yaw; out.active = active;
  return out;
}
