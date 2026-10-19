// SPIRE OF PERIL — climb a tower of obstacle sections before time runs out. No checkpoints: fall off and you land
// further down; touch red and you start again from the bottom. When the clock hits zero a new tower rises.
import * as THREE from 'three';
import { buildTower, sectionName } from './tower.js';
import { newPlayer, worldAt, stepPlayer, TUNE } from './physics.js';
import { buildMeshes, makeAvatar, poseAvatar, setAvatarColor, skyTexture } from './build.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
// ---------------------------------------------------------------- language
const q = new URLSearchParams(location.search);
let lang = q.get('lang') || (() => { try { return localStorage.getItem('spire.lang'); } catch (e) { return null; } })() || ((navigator.language || '').startsWith('zh') ? 'zh' : 'en');
if (lang !== 'en') lang = 'zh';
const EN = () => lang === 'en';
const L = (zh, en) => (EN() ? en : zh);

// ---------------------------------------------------------------- the save: coins, what you own, best times
const KEY = 'spire.save';
const SAVE = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })();
SAVE.coins = SAVE.coins || 0; SAVE.owned = SAVE.owned || []; SAVE.equip = SAVE.equip || {}; SAVE.best = SAVE.best || null; SAVE.wins = SAVE.wins || 0; SAVE.color = SAVE.color || '#3fa0ff';
const store = () => { try { localStorage.setItem(KEY, JSON.stringify(SAVE)); } catch (e) { /* private mode */ } };
const SHOP = [
  { id: 'speed', name: ['加速線圈', 'Speed Coil'], price: 250, note: ['移動速度 +25%', 'Move 25% faster'], gear: true },
  { id: 'grav', name: ['重力線圈', 'Gravity Coil'], price: 400, note: ['重力變小，跳得更高更遠', 'Lower gravity: jump higher and further'], gear: true },
  { id: 'c_red', name: ['紅色衣服', 'Red outfit'], price: 60, color: '#ff4a4a' }, { id: 'c_green', name: ['綠色衣服', 'Green outfit'], price: 60, color: '#40d060' },
  { id: 'c_gold', name: ['金色衣服', 'Gold outfit'], price: 120, color: '#ffc830' }, { id: 'c_purple', name: ['紫色衣服', 'Purple outfit'], price: 120, color: '#a060ff' },
  { id: 'c_black', name: ['黑色衣服', 'Black outfit'], price: 200, color: '#20222a' }, { id: 'c_pink', name: ['粉紅衣服', 'Pink outfit'], price: 200, color: '#ff80c8' },
];
// round modifiers (one in two rounds gets one)
const MUTATORS = [
  { id: 'lowgrav', name: ['低重力', 'Low gravity'], mods: { gravity: 0.72 } }, { id: 'fast', name: ['加速', 'Speed up'], mods: { speed: 1.25 } },
  { id: 'bouncy', name: ['彈跳力', 'High jump'], mods: { jump: 1.15 } }, { id: 'slow', name: ['緩慢', 'Slow'], mods: { speed: 0.85 } },
  { id: 'fog', name: ['濃霧', 'Fog'], mods: {}, fog: true }, { id: 'heavy', name: ['高重力', 'Heavy'], mods: { gravity: 1.15, jump: 1.07 } },
];
const ROUND_SECS = 8 * 60;

// ---------------------------------------------------------------- renderer
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(65, 1, 0.1, 400);
scene.background = skyTexture('#5ab8ff', '#cdeaff');
scene.fog = new THREE.Fog('#cdeaff', 60, 220);
scene.add(new THREE.HemisphereLight('#ffffff', '#6a7a90', 0.9));
const sun = new THREE.DirectionalLight('#fff6e0', 1.6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 120 }); sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const sound = new Sound();

// ---------------------------------------------------------------- the round
const G = { tower: null, meshes: null, world: null, t: 0, timeLeft: ROUND_SECS, mut: null, pl: null, fades: {}, spawn: [-7, 0, -7], check: null, practice: false, mode: 'title', runT: 0, deadT: 0, bestSec: -1, mods: {} };
const avatar = makeAvatar(SAVE.color); scene.add(avatar);
function newTower(seed) {
  if (G.meshes) { scene.remove(G.meshes.group); G.meshes.dispose(); }
  G.tower = buildTower(seed ?? Math.floor(Math.random() * 1e9), q.get('sections') ? +q.get('sections') : 6 + Math.floor(Math.random() * 3));
  G.meshes = buildMeshes(G.tower); scene.add(G.meshes.group);
  G.world = null; G.t = 0; G.fades = {}; G.timeLeft = ROUND_SECS;
  G.mut = q.get('mut') ? MUTATORS.find((m) => m.id === q.get('mut')) : Math.random() < 0.5 ? MUTATORS[Math.floor(Math.random() * MUTATORS.length)] : null;
  G.check = null; G.bestSec = -1;
  scene.fog.near = G.mut && G.mut.fog ? 8 : 60; scene.fog.far = G.mut && G.mut.fog ? 40 : 220;
  respawn(true);
  hud(true);
}
function mods() {
  const m = { speed: 1, gravity: 1, jump: 1 };
  for (const src of [G.mut ? G.mut.mods : {}, SAVE.equip.speed ? { speed: 1.25 } : {}, SAVE.equip.grav ? { gravity: 0.78 } : {}]) for (const k in src) m[k] *= src[k];
  return m;
}
function respawn(full) {
  const at = G.practice && G.check && !full ? G.check : G.tower.spawn;
  G.pl = newPlayer([at[0], at[1] + 0.05, at[2]]); G.pl.facing = Math.PI * 0.25;
  if (full || !G.practice) { G.runT = 0; G.fades = {}; }
  cam.yaw = Math.PI + Math.PI * 0.25;
}
function sectionAt(y) { const s = G.tower.sections; for (let i = s.length - 1; i >= 0; i--) if (y >= s[i].y0 - 0.2) return i; return -1; }

// ---------------------------------------------------------------- camera
const cam = { yaw: Math.PI * 1.25, pitch: 0.35, dist: 11, lock: false };
let dragging = false, lastX = 0, lastY = 0;
canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') return; dragging = true; lastX = e.clientX; lastY = e.clientY; sound.start(); });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', (e) => {
  if (cam.lock && document.pointerLockElement === canvas) { cam.yaw -= e.movementX * 0.004; cam.pitch = Math.max(-0.4, Math.min(1.3, cam.pitch + e.movementY * 0.004)); return; }
  if (!dragging) return; cam.yaw -= (e.clientX - lastX) * 0.006; cam.pitch = Math.max(-0.4, Math.min(1.3, cam.pitch + (e.clientY - lastY) * 0.006)); lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('wheel', (e) => { cam.dist = Math.max(3, Math.min(24, cam.dist * (e.deltaY > 0 ? 1.1 : 0.9))); e.preventDefault(); }, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------- input
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.code); sound.start();
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (G.mode !== 'play') return;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { cam.lock = !cam.lock; if (cam.lock) canvas.requestPointerLock && canvas.requestPointerLock(); else document.exitPointerLock && document.exitPointerLock(); toast(cam.lock ? L('視角鎖定：開', 'Shift lock: on') : L('視角鎖定：關', 'Shift lock: off')); }
  if (e.code === 'KeyR') { G.pl.dead = 'reset'; }
});
addEventListener('keyup', (e) => keys.delete(e.code));
// touch: a stick on the left, drag on the right turns the camera, and a jump button
const touch = { id: null, ox: 0, oy: 0, x: 0, y: 0, camId: null, cx: 0, cy: 0, jump: false };
canvas.addEventListener('touchstart', (e) => {
  sound.start();
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth * 0.45 && touch.id === null) { touch.id = t.identifier; touch.ox = t.clientX; touch.oy = t.clientY; touch.x = 0; touch.y = 0; $('stick').style.left = (t.clientX - 60) + 'px'; $('stick').style.top = (t.clientY - 60) + 'px'; $('stick').hidden = false; }
    else if (touch.camId === null) { touch.camId = t.identifier; touch.cx = t.clientX; touch.cy = t.clientY; }
  }
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.id) { let dx = t.clientX - touch.ox, dy = t.clientY - touch.oy; const d = Math.hypot(dx, dy); if (d > 55) { dx *= 55 / d; dy *= 55 / d; } touch.x = dx / 55; touch.y = dy / 55; $('knob').style.transform = `translate(${dx}px,${dy}px)`; }
    if (t.identifier === touch.camId) { cam.yaw -= (t.clientX - touch.cx) * 0.008; cam.pitch = Math.max(-0.4, Math.min(1.3, cam.pitch + (t.clientY - touch.cy) * 0.006)); touch.cx = t.clientX; touch.cy = t.clientY; }
  }
}, { passive: true });
const endTouch = (e) => { for (const t of e.changedTouches) { if (t.identifier === touch.id) { touch.id = null; touch.x = touch.y = 0; $('stick').hidden = true; $('knob').style.transform = ''; } if (t.identifier === touch.camId) touch.camId = null; } };
canvas.addEventListener('touchend', endTouch); canvas.addEventListener('touchcancel', endTouch);
$('jumpbtn').addEventListener('touchstart', (e) => { e.preventDefault(); touch.jump = true; }, { passive: false });
$('jumpbtn').addEventListener('touchend', () => { touch.jump = false; });
// ---------------------------------------------------------------- game controllers (standard mapping, Xbox names)
// left stick / D-pad move · right stick camera · A jump · X shift lock · LB / RB zoom · View reset · Start shop · B close
const PAD = { ix: 0, iz: 0, jump: false, prev: [], connected: false };
const DEAD = 0.18, dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));
addEventListener('gamepadconnected', (e) => { PAD.connected = true; sound.start(); toast(L(`已連接控制器：${e.gamepad.id.split('(')[0].trim()}`, `Controller connected: ${e.gamepad.id.split('(')[0].trim()}`)); staticText(); });
addEventListener('gamepaddisconnected', () => { PAD.connected = [...(navigator.getGamepads ? navigator.getGamepads() : [])].some(Boolean); toast(L('控制器已中斷', 'Controller disconnected')); });
function pollPad(dt) {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  PAD.ix = 0; PAD.iz = 0; PAD.jump = false;
  const gp = pads[0]; if (!gp) return;
  const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed), pressed = (i) => b(i) && !PAD.prev[i];
  // moving: the stick, or the D-pad
  PAD.ix = dz(gp.axes[0] || 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
  PAD.iz = -dz(gp.axes[1] || 0) + (b(12) ? 1 : 0) - (b(13) ? 1 : 0);
  PAD.jump = b(0);
  // the camera
  const cx = dz(gp.axes[2] || 0), cy = dz(gp.axes[3] || 0);
  cam.yaw -= cx * 2.8 * dt; cam.pitch = Math.max(-0.4, Math.min(1.3, cam.pitch + cy * 1.8 * dt));
  if (b(4)) cam.dist = Math.min(24, cam.dist * (1 + dt * 1.5)); if (b(5)) cam.dist = Math.max(3, cam.dist * (1 - dt * 1.5));
  // buttons that do something once per press, depending on the screen
  const shopOpen = !$('shop').hidden, winOpen = !$('winbox').hidden;
  if (shopOpen) { if (pressed(1) || pressed(9)) $('shop').querySelector('.close').click(); }
  else if (G.mode === 'title') { if (pressed(0) || pressed(9)) play(); }
  else if (winOpen) { if (pressed(0)) $('w-next').click(); else if (pressed(2)) $('w-again').click(); else if (pressed(9)) showShop(); }
  else if (G.mode === 'play') {
    if (pressed(2)) { cam.lock = !cam.lock; toast(cam.lock ? L('視角鎖定：開', 'Shift lock: on') : L('視角鎖定：關', 'Shift lock: off')); }
    if (pressed(8) && G.deadT <= 0) G.pl.dead = 'reset';
    if (pressed(9)) showShop();
  }
  PAD.prev = gp.buttons.map((x) => x.pressed);
}
function readInput() {
  let ix = PAD.ix, iz = PAD.iz;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iz += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  if (touch.id !== null) { ix += touch.x; iz -= touch.y; }
  const len = Math.hypot(ix, iz); if (len > 1) { ix /= len; iz /= len; }
  // forward is where the camera looks
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  return { mx: fx * iz + rx * ix, mz: fz * iz + rz * ix, jump: keys.has('Space') || touch.jump || PAD.jump };
}

// ---------------------------------------------------------------- HUD and screens
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function toast(text) { const d = $('toast'); d.textContent = text; d.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => d.classList.remove('on'), 1600); }
function banner(text, sub, col) { const d = $('banner'); d.innerHTML = `<b style="${col ? `color:${col}` : ''}">${text}</b>${sub ? `<small>${sub}</small>` : ''}`; d.classList.remove('on'); void d.offsetWidth; d.classList.add('on'); }
function hud(full) {
  const T = G.tower, si = Math.max(0, sectionAt(G.pl.y)), sec = T.sections[si];
  $('timer').textContent = fmtTime(Math.max(0, G.timeLeft)); $('timer').classList.toggle('low', G.timeLeft < 60);
  $('stage').innerHTML = `<b style="color:${sec.color}">${si + 1}</b> / ${T.sections.length} <span>${sectionName(sec.id, EN())}</span>`;
  $('coins').textContent = SAVE.coins;
  $('runt').textContent = `${L('本次', 'Run')} ${fmtTime(G.runT)}`;
  $('mut').hidden = !G.mut; if (G.mut) $('mut').textContent = `⚡ ${G.mut.name[EN() ? 1 : 0]}`;
  $('practice').classList.toggle('on', G.practice);
  // the height meter: one band per section, and where you are
  if (full) $('meter').innerHTML = T.sections.map((s) => `<i style="flex:${s.y1 - s.y0};background:${s.color}"></i>`).reverse().join('') + '<em id="me"></em><em id="bestmk"></em>';
  const frac = Math.max(0, Math.min(1, G.pl.y / T.top)); $('me').style.bottom = `${frac * 100}%`;
  const bm = $('bestmk'); if (bm) { bm.hidden = G.bestSec < 0; bm.style.bottom = `${Math.max(0, G.bestY || 0) / T.top * 100}%`; }
}
function staticText() {
  document.title = L('絕命高塔 · Spire of Peril', 'Spire of Peril · 絕命高塔');
  $('t-play').textContent = L('開始攀爬', 'Climb'); $('t-shop').textContent = L('商店', 'Shop'); $('t-lang').textContent = EN() ? '中文' : 'English';
  $('t-sub').textContent = L('沒有存檔點。踩到紅色就從頭來過。在時間用完之前爬到塔頂！', 'No checkpoints. Touch red and you start again from the bottom. Reach the top before time runs out!');
  $('t-help').innerHTML = PAD.connected ? L('控制器：左搖桿 移動 · A 跳 · 右搖桿 視角 · LB/RB 縮放 · X 鎖定視角 · View 重來 · Start 商店', 'Controller: left stick move · A jump · right stick look · LB/RB zoom · X shift lock · View reset · Start shop')
    : L('WASD 移動 · 空白鍵 跳 · 拖曳滑鼠 轉視角 · 滾輪 縮放 · Shift 鎖定視角 · R 重來 · 也可以用控制器', 'WASD move · Space jump · drag to look · wheel to zoom · Shift lock · R reset');
  $('t-best').textContent = SAVE.best ? `${L('最佳紀錄', 'Best')} ${fmtTime(SAVE.best)} · ${L('登頂', 'Wins')} ${SAVE.wins}` : '';
  $('shopbtn').textContent = L('🛒 商店', '🛒 Shop'); $('practice').textContent = L('練習模式', 'Practice');
}
function showShop() {
  const d = $('shop'); d.hidden = false; sound.play('click');
  const draw = () => {
    d.innerHTML = `<div class="sh"><h2>${L('商店', 'Shop')} <span class="coin">● ${SAVE.coins}</span></h2><div class="grid">` + SHOP.map((it) => {
      const own = SAVE.owned.includes(it.id), on = it.gear ? SAVE.equip[it.id] : SAVE.color === it.color;
      return `<button class="it ${own ? 'own' : ''} ${on ? 'on' : ''}" data-id="${it.id}">${it.color ? `<i style="background:${it.color}"></i>` : `<i class="coil ${it.id}"></i>`}<b>${it.name[EN() ? 1 : 0]}</b><small>${it.note ? it.note[EN() ? 1 : 0] : ''}</small><span>${own ? (on ? L('使用中', 'Equipped') : L('裝備', 'Equip')) : `● ${it.price}`}</span></button>`;
    }).join('') + `<button class="it ${SAVE.color === '#3fa0ff' ? 'on' : ''}" data-id="c_blue"><i style="background:#3fa0ff"></i><b>${L('藍色衣服', 'Blue outfit')}</b><small></small><span>${SAVE.color === '#3fa0ff' ? L('使用中', 'Equipped') : L('裝備', 'Equip')}</span></button>`
      + `</div><p class="hint">${L('登頂可以得到金幣（練習模式不算）。線圈隨時可以開關。', 'Reaching the top earns coins (not in practice). Coils can be switched on and off any time.')}</p><button class="close">${L('關閉', 'Close')}</button></div>`;
    d.querySelectorAll('.it').forEach((b) => b.onclick = () => {
      const id = b.dataset.id, it = SHOP.find((x) => x.id === id);
      if (id === 'c_blue') { SAVE.color = '#3fa0ff'; }
      else if (!SAVE.owned.includes(id)) { if (SAVE.coins < it.price) { sound.play('tick'); toast(L('金幣不夠', 'Not enough coins')); return; } SAVE.coins -= it.price; SAVE.owned.push(id); sound.play('coin'); if (it.color) SAVE.color = it.color; else SAVE.equip[id] = true; }
      else if (it.gear) SAVE.equip[id] = !SAVE.equip[id]; else SAVE.color = it.color;
      setAvatarColor(avatar, SAVE.color); store(); draw(); if (G.tower) hud();
    });
    d.querySelector('.close').onclick = () => { d.hidden = true; sound.play('click'); };
  };
  draw();
}
function win() {
  G.mode = 'won'; sound.play('win');
  const secs = G.runT, earned = G.practice ? 0 : Math.round(40 + G.tower.sections.length * 15 + Math.max(0, (ROUND_SECS - secs) / 6));
  SAVE.coins += earned; if (!G.practice) { SAVE.wins++; if (!SAVE.best || secs < SAVE.best) SAVE.best = secs; } store();
  const d = $('winbox'); d.hidden = false;
  d.innerHTML = `<h2>${L('登頂成功！', 'You reached the top!')}</h2><p class="big">${fmtTime(secs)}</p><p>${G.practice ? L('練習模式不會得到金幣', 'No coins in practice mode') : `${L('得到', 'Earned')} <span class="coin">● ${earned}</span>`}${SAVE.best && !G.practice ? ` · ${L('最佳', 'Best')} ${fmtTime(SAVE.best)}` : ''}</p>
    <div class="row"><button id="w-next" class="go">${L('挑戰新的高塔', 'Climb a new tower')}</button><button id="w-again">${L('再爬一次這座', 'This tower again')}</button><button id="w-shop">${L('商店', 'Shop')}</button></div>`;
  d.querySelector('#w-next').onclick = () => { d.hidden = true; G.mode = 'play'; sound.play('tower'); newTower(); banner(L('新的高塔！', 'A new tower!'), G.mut ? `⚡ ${G.mut.name[EN() ? 1 : 0]}` : ''); };
  d.querySelector('#w-again').onclick = () => { d.hidden = true; G.mode = 'play'; respawn(true); };
  d.querySelector('#w-shop').onclick = () => showShop();
}
function die(why) {
  sound.play('die'); $('hurt').classList.remove('on'); void $('hurt').offsetWidth; $('hurt').classList.add('on');
  G.deadT = 0.7; G.deadWhy = why;
  avatar.visible = false;
  // a little burst of bricks where you fell apart
  burst(G.pl.x, G.pl.y + 1, G.pl.z);
}
const bits = [];
function burst(x, y, z) {
  for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: i % 2 ? SAVE.color : '#ffcc66' })); m.position.set(x, y, z); scene.add(m); bits.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 7, (Math.random() - 0.5) * 8), life: 1.2 }); }
}

// ---------------------------------------------------------------- the frame
let last = performance.now(), tickSec = -1;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  pollPad(dt);
  if (G.tower) {
    G.t += dt;
    G.world = worldAt(G.tower, G.t, G.world, G.fades);
    if (G.mode === 'play') {
      G.timeLeft -= dt;
      if (G.timeLeft <= 0) { sound.play('tower'); newTower(); banner(L('時間到！新的高塔升起了', 'Time\'s up! A new tower rises'), G.mut ? `⚡ ${G.mut.name[EN() ? 1 : 0]}` : ''); }
      else if (G.timeLeft < 10 && Math.ceil(G.timeLeft) !== tickSec) { tickSec = Math.ceil(G.timeLeft); sound.play('tick'); }
      if (G.deadT > 0) { G.deadT -= dt; if (G.deadT <= 0) { respawn(false); avatar.visible = true; } }
      else {
        G.runT += dt;
        const before = sectionAt(G.pl.y);
        const ev = stepPlayer(G.pl, readInput(), G.world, dt, mods(), TUNE, G.t, G.fades);
        for (const e of ev) {
          if (e.type === 'jump') sound.play('jump'); else if (e.type === 'land') sound.play('land'); else if (e.type === 'pad') sound.play('pad'); else if (e.type === 'fade') sound.play('fade');
          else if (e.type === 'die') die(e.why); else if (e.type === 'win') win();
        }
        if (G.pl.dead === 'reset') { G.pl.dead = null; die('reset'); }
        const after = sectionAt(G.pl.y);
        if (G.pl.grounded && after > G.bestSec && after > before - 1) {
          if (after > G.bestSec && G.bestSec >= 0) { sound.play('stage'); banner(sectionName(G.tower.sections[after].id, EN()), L(`第 ${after + 1} 層`, `Stage ${after + 1}`), G.tower.sections[after].color); }
          G.bestSec = after; G.bestY = G.pl.y;
          if (G.practice) { const r = G.tower.sections[after].route[0]; G.check = [r.x, r.top, r.z]; }
        }
      }
    }
    // the climber
    avatar.position.set(G.pl.x, G.pl.y, G.pl.z);
    const face = Math.atan2(G.pl.vx, G.pl.vz); if (Math.hypot(G.pl.vx, G.pl.vz) > 0.5) avatar.rotation.y = lerpAngle(avatar.rotation.y, face, Math.min(1, dt * 14));
    poseAvatar(avatar, dt, G.pl);
    G.meshes.update(G.world, G.t);
    for (let i = bits.length - 1; i >= 0; i--) { const b = bits[i]; b.v.y -= 20 * dt; b.m.position.addScaledVector(b.v, dt); b.m.rotation.x += dt * 5; b.life -= dt; if (b.life <= 0) { scene.remove(b.m); bits.splice(i, 1); } }
    // the camera follows (and swings round slowly in shift lock)
    const target = new THREE.Vector3(G.pl.x, G.pl.y + 1.6, G.pl.z);
    if (cam.lock) avatar.rotation.y = cam.yaw + Math.PI;
    const cp = Math.cos(cam.pitch), off = new THREE.Vector3(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp).multiplyScalar(cam.dist);
    camera.position.copy(target).add(off); camera.lookAt(target);
    if (cam.lock) { const r = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)).multiplyScalar(1.2); camera.position.add(r); }
    sun.position.set(G.pl.x + 18, G.pl.y + 30, G.pl.z + 10); sun.target.position.set(G.pl.x, G.pl.y, G.pl.z);
    hudTimer += dt; if (hudTimer > 0.2) { hudTimer = 0; hud(); }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
let hudTimer = 0;
const lerpAngle = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; };

// ---------------------------------------------------------------- start
function play() {
  sound.start(); $('title').hidden = true; $('hud').hidden = false; G.mode = 'play';
  banner(L('爬到塔頂！', 'Reach the top!'), G.mut ? `⚡ ${G.mut.name[EN() ? 1 : 0]}` : L('沒有存檔點', 'No checkpoints'));
}
$('t-play').onclick = play;
$('t-shop').onclick = () => { sound.start(); showShop(); };
$('t-lang').onclick = () => { lang = EN() ? 'zh' : 'en'; try { localStorage.setItem('spire.lang', lang); } catch (e) { /* ignore */ } document.documentElement.lang = EN() ? 'en' : 'zh-Hant'; staticText(); hud(true); };
$('shopbtn').onclick = () => showShop();
$('practice').onclick = () => { G.practice = !G.practice; G.check = null; toast(G.practice ? L('練習模式：每一層都是存檔點（不會得到金幣）', 'Practice: every stage is a checkpoint (no coins)') : L('正式模式：沒有存檔點', 'Real climb: no checkpoints')); respawn(true); hud(); };
$('musicbtn').onclick = () => { sound.start(); sound.setMusic(!sound.musicOn); $('musicbtn').textContent = sound.musicOn ? '♪' : '♪̸'; };
document.documentElement.lang = EN() ? 'en' : 'zh-Hant';
newTower(q.get('seed') ? +q.get('seed') : undefined);
staticText(); hud(true);
// the title screen: the camera circles the tower
cam.dist = 26; cam.pitch = 0.25;
const titleSpin = setInterval(() => { if (G.mode !== 'title') { clearInterval(titleSpin); cam.dist = 11; cam.pitch = 0.35; return; } cam.yaw += 0.004; }, 16);
requestAnimationFrame(frame);
window.__spire = { G, cam, play, newTower, respawn, keys, SAVE, frame: (now) => frame(now) };
