// node tools/test.mjs — builds many towers and checks them; tests the physics; lets a bot climb the sections
import { buildTower, SECTION_IDS, partAt } from '../js/tower.js';
import { newPlayer, worldAt, stepPlayer, TUNE } from '../js/physics.js';

let fails = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };
const DT = 1 / 60;

// ---- towers
{
  let bad = [], seen = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const T = buildTower(seed, seed % 2 ? 6 : 8);
    T.sections.forEach((s) => seen.add(s.id));
    for (const p of T.parts) {
      if (p.lobby) continue;
      if (![...p.pos, ...p.size].every(Number.isFinite)) bad.push(`${seed}: NaN in ${p.kind}`);
      const reach = Math.max(Math.abs(p.pos[0]), Math.abs(p.pos[2])) + Math.max(p.size[0], p.size[2]) / 2;
      if (reach > 13) bad.push(`${seed}: ${p.kind} sticks out (${reach.toFixed(1)})`);
    }
    for (let i = 1; i < T.sections.length; i++) { const a = T.sections[i - 1].route.slice(-1)[0], b = T.sections[i].route[0]; if (Math.hypot(a.x - b.x, a.z - b.z) > 0.01 || Math.abs(a.top - b.top) > 0.01) bad.push(`${seed}: section ${i} does not start where ${i - 1} ends`); }
    if (!T.parts.some((p) => p.kind === 'finish')) bad.push(`${seed}: no finish`);
  }
  ok('60 towers: every part inside the column, sections stacked, a finish on top', !bad.length, bad.slice(0, 4).join('; '));
  ok('every kind of section turns up', SECTION_IDS.every((id) => seen.has(id)), [...SECTION_IDS].filter((id) => !seen.has(id)).join(','));
}
// ---- every jump between two route stops is within reach
{
  const g = TUNE.gravity, v = TUNE.speed;
  const reach = (vy, dy) => { const disc = vy * vy - 2 * g * dy; if (disc < 0) return -1; return v * (vy + Math.sqrt(disc)) / g; };
  const bad = [];
  for (let seed = 1; seed <= 40; seed++) for (const sec of buildTower(seed, 8).sections) {
    for (let i = 1; i < sec.route.length; i++) {
      const a = sec.route[i - 1], b = sec.route[i];
      if (a.moving || b.moving || b.climb || a.climb || b.walk) continue;
      const gap = Math.max(0, Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z)) - a.half - b.half), dy = b.top - a.top;
      const r = reach(a.pad ? TUNE.pad : TUNE.jump, dy);
      if (r < 0 || gap > r * 0.7) bad.push(`${sec.id} ${i}: gap ${gap.toFixed(1)} up ${dy.toFixed(1)} (reach ${r.toFixed(1)})`);
    }
  }
  ok('every jump in every section is within reach', !bad.length, [...new Set(bad)].slice(0, 5).join('; '));
}
// ---- physics
const box = (kind, pos, size, extra = {}) => ({ id: Math.random(), kind, shape: 'box', pos, size, yaw: 0, ...extra });
function sim(parts, pl, inputFn, secs, mods) {
  const tower = { parts }; let world = null; const fades = {}, events = [];
  for (let i = 0; i < secs * 60; i++) { const t = i * DT; world = worldAt(tower, t, world, fades); events.push(...stepPlayer(pl, inputFn(t, pl), world, DT, mods, TUNE, t, fades)); }
  return events;
}
{
  const floor = box('solid', [0, -0.5, 0], [10, 1, 10]);
  const pl = newPlayer([0, 3, 0]); sim([floor], pl, () => ({ mx: 0, mz: 0 }), 1.5);
  ok('falls and lands on a floor', pl.grounded && Math.abs(pl.y) < 0.01, `y ${pl.y.toFixed(3)}`);
  const pl2 = newPlayer([0, 0, 0]); sim([floor, box('solid', [3, 1.5, 0], [1, 3, 6])], pl2, () => ({ mx: 1, mz: 0 }), 2);
  ok('walls stop you', pl2.x < 2.5 - TUNE.radius + 0.02 && pl2.x > 1.9, `x ${pl2.x.toFixed(2)}`);
  const pl3 = newPlayer([0, 0, 0]); let jumped = false;
  sim([floor, box('solid', [3, 0.5, 0], [2, 1, 6])], pl3, (t, p) => { if (!jumped && p.x > 1.2) { jumped = true; return { mx: 1, mz: 0, jump: true }; } return { mx: p.x < 3 ? 1 : 0, mz: 0 }; }, 2);
  ok('jump up onto a ledge', pl3.grounded && Math.abs(pl3.y - 1) < 0.01, `y ${pl3.y.toFixed(2)}`);
  // coyote time: jump just after walking off an edge
  const ledge = box('solid', [0, -0.5, 0], [2, 1, 2]), pl4 = newPlayer([0, 0, 0]); let jt = null;
  const ev4 = sim([ledge], pl4, (t, p) => { if (jt === null && !p.grounded && p.airT > 0.04) { jt = t; return { mx: 1, mz: 0, jump: true }; } return { mx: 1, mz: 0 }; }, 0.4);
  ok('a jump a moment after leaving the edge still works', ev4.some((e) => e.type === 'jump'));
  // a sliding platform carries you
  const mover = box('solid', [0, -0.25, 0], [3, 0.5, 3], { mo: { type: 'slide', dir: [1, 0, 0], dist: 2, period: 4, phase: 0 } }), pl5 = newPlayer([0, 0.02, 0]);
  sim([mover], pl5, () => ({ mx: 0, mz: 0 }), 1);
  const at = partAt(mover, 1);
  ok('a sliding platform carries you along', pl5.grounded && Math.abs(pl5.x - at.x) < 0.15, `you ${pl5.x.toFixed(2)} platform ${at.x.toFixed(2)}`);
  // a spinning bar carries you round
  const bar = box('solid', [0, -0.25, 0], [8, 0.5, 1.4], { mo: { type: 'spin', speed: 1 } }), pl6 = newPlayer([3, 0.02, 0]);
  sim([bar], pl6, () => ({ mx: 0, mz: 0 }), Math.PI / 2);
  ok('a spinning platform turns you with it', pl6.grounded && Math.abs(pl6.x) < 0.3 && Math.abs(Math.abs(pl6.z) - 3) < 0.3, `(${pl6.x.toFixed(2)}, ${pl6.z.toFixed(2)})`);
  // kill bricks, pads, trusses, belts, fading tiles, the finish
  const pl7 = newPlayer([0, 0, 0]); const ev7 = sim([floor, box('kill', [2, 0.5, 0], [1, 1, 1])], pl7, () => ({ mx: 1, mz: 0 }), 1);
  ok('red bricks kill', pl7.dead === 'kill' && ev7.some((e) => e.type === 'die'));
  const pl8 = newPlayer([0, 0, 0]); let top8 = 0; sim([box('pad', [0, -0.5, 0], [3, 1, 3])], pl8, (t, p) => { top8 = Math.max(top8, p.y); return { mx: 0, mz: 0 }; }, 1.2);
  ok('a pad throws you high', top8 > 7, `apex ${top8.toFixed(1)} m`);
  const pl9 = newPlayer([0, 0, 0]); let top9 = 0; sim([floor, box('truss', [1.2, 5, 0], [1.2, 10, 1.2]), box('solid', [3.5, 9.75, 0], [3, 0.5, 3])], pl9, (t, p) => { if (p.grounded) top9 = Math.max(top9, p.y); return { mx: p.x < 3.5 ? 1 : 0, mz: 0 }; }, 3);
  ok('climb a truss and step onto the top', top9 > 9.9, `stood at ${top9.toFixed(1)} m`);
  const pl10 = newPlayer([0, 0.02, 0]); sim([box('belt', [0, -0.25, 0], [3, 0.5, 20], { belt: [0, 0, 3] })], pl10, () => ({ mx: 0, mz: 0 }), 1);
  ok('a conveyor carries you', pl10.z > 2.5, `z ${pl10.z.toFixed(2)}`);
  const tile = box('fade', [0, -0.25, 0], [2, 0.5, 2]), pl11 = newPlayer([0, 0.02, 0]); sim([tile], pl11, () => ({ mx: 0, mz: 0 }), 1.5);
  ok('a crumbling tile drops you', pl11.y < -2, `y ${pl11.y.toFixed(1)}`);
  const pl12 = newPlayer([0, 1, 0]); const ev12 = sim([box('finish', [0, -0.05, 0], [3, 0.1, 3])], pl12, () => ({ mx: 0, mz: 0 }), 1);
  ok('the finish wins', pl12.won && ev12.some((e) => e.type === 'win'));
  const pl13 = newPlayer([0, 0, 0]); pl13.vx = 9; sim([box('ice', [0, -0.5, 0], [60, 1, 60])], pl13, () => ({ mx: 0, mz: 0 }), 1.5);
  const pl14 = newPlayer([0, 0, 0]); pl14.vx = 9; sim([box('solid', [0, -0.5, 0], [60, 1, 60])], pl14, () => ({ mx: 0, mz: 0 }), 1.5);
  ok('ice keeps you sliding', pl13.x > pl14.x + 3, `ice ${pl13.x.toFixed(1)} m vs floor ${pl14.x.toFixed(1)} m`);
}
// ---- a bot climbs every section made of fixed platforms, using the real physics
{
  const results = {};
  for (const id of ['steps', 'glass', 'pillars', 'spiral', 'beams', 'ice', 'fade', 'pads', 'conveyor']) {
    let wins = 0, tries = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const T = buildTower(seed, 8), si = T.sections.findIndex((s) => s.id === id); if (si < 0) continue;
      tries++;
      const sec = T.sections[si], parts = T.parts.filter((p) => p.sec === si || p.sec === si - 1);
      const start = sec.route[0], pl = newPlayer([start.x, start.top + 0.02, start.z]);
      let leg = 1, legT = 0, jumpCool = 0, world = null; const fades = {};
      for (let i = 0; i < 60 * 40 && leg < sec.route.length && !pl.dead; i++) {
        const t = i * DT, a = sec.route[leg - 1], b = sec.route[leg];
        world = worldAt({ parts }, t, world, fades);
        const dx = b.x - pl.x, dz = b.z - pl.z, d = Math.hypot(dx, dz);
        let mx = d > 0.25 ? dx / d : 0, mz = d > 0.25 ? dz / d : 0;
        if (!pl.grounded && d < b.half * 0.6) { mx = 0; mz = 0; }           // stop over the target
        if (a.pad && !pl.grounded && pl.y < b.top + 0.3 && d < b.half + 1.5) { mx = 0; mz = 0; }   // launched from a pad: wait until above the ledge
        // jump when the edge of where we stand is near, or the next stop is higher and close
        const onA = Math.max(Math.abs(pl.x - a.x), Math.abs(pl.z - a.z)) > a.half - 0.35;
        const need = b.top - pl.y > 0.3 || d - b.half > 0.6;
        const jump = pl.grounded && jumpCool <= 0 && need && !b.walk && (onA || d - b.half < 1.2) && !(a.pad && b.top > pl.y + 1);
        if (jump) jumpCool = 0.3; jumpCool -= DT;
        const ev = stepPlayer(pl, { mx, mz, jump }, world, DT, {}, TUNE, t, fades);
        const launched = b.pad && ev.some((e) => e.type === 'pad') && d < b.half + 0.3;        // a pad throws you the moment you land
        if (launched || (pl.grounded && Math.abs(pl.y - b.top) < 0.05 && d < b.half + 0.2)) { leg++; legT = 0; } else legT += DT;
        if (legT > 8 || pl.y < Math.min(a.top, b.top) - 4) break;
      }
      if (leg >= sec.route.length) wins++;
    }
    results[id] = `${wins}/${tries}`;
  }
  console.log('     bot climbs:', Object.entries(results).map(([k, v]) => `${k} ${v}`).join(' · '));
  ok('a simple bot climbs the fixed-platform sections', Object.values(results).every((v) => { const [a, b] = v.split('/').map(Number); return b === 0 || a / b >= 0.5; }));
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
