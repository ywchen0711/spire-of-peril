// SPIRE OF PERIL — the tower's parts as meshes, and the climber. Textures are drawn on canvases.
import * as THREE from 'three';

const cache = new Map();
function tex(key, w, h, draw) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  cache.set(key, t); return t;
}
// a toy-brick surface: soft studs on a grid, drawn in white so the material colour shows through
const studs = () => tex('studs', 128, 128, (g, w) => {
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, w, w);
  g.strokeStyle = 'rgba(0,0,0,0.10)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, w - 3);
  for (const [x, y] of [[32, 32], [96, 32], [32, 96], [96, 96]]) { const gr = g.createRadialGradient(x - 5, y - 5, 2, x, y, 18); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#d8d8d8'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 15, 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2; g.stroke(); }
});
const stripes = () => tex('belt', 128, 128, (g, w) => { g.fillStyle = '#2a2a30'; g.fillRect(0, 0, w, w); g.fillStyle = '#f0c020'; for (let i = -w; i < w * 2; i += 42) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 20, 0); g.lineTo(i + 20 + w * 0.5, w); g.lineTo(i + w * 0.5, w); g.fill(); } });
const lattice = () => tex('truss', 128, 128, (g, w) => { g.clearRect(0, 0, w, w); g.strokeStyle = '#c8c8d0'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, w - 12); g.beginPath(); g.moveTo(6, 6); g.lineTo(w - 6, w - 6); g.moveTo(w - 6, 6); g.lineTo(6, w - 6); g.stroke(); });
const arrow = () => tex('pad', 128, 128, (g, w) => { g.fillStyle = '#20e070'; g.fillRect(0, 0, w, w); g.fillStyle = '#e8fff0'; g.beginPath(); g.moveTo(64, 14); g.lineTo(108, 64); g.lineTo(80, 64); g.lineTo(80, 112); g.lineTo(48, 112); g.lineTo(48, 64); g.lineTo(20, 64); g.closePath(); g.fill(); });
const finishTex = () => tex('finish', 128, 128, (g, w) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); } });

function material(p) {
  const c = new THREE.Color(p.color || '#cccccc');
  switch (p.kind) {
    case 'kill': return new THREE.MeshStandardMaterial({ color: '#ff1a2a', emissive: '#ff1020', emissiveIntensity: 0.9, roughness: 0.4, transparent: true, opacity: 1 });
    case 'pad': return new THREE.MeshStandardMaterial({ map: arrow(), emissive: '#10a040', emissiveIntensity: 0.5, roughness: 0.5 });
    case 'belt': { const t = stripes().clone(); t.needsUpdate = true; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }); }
    case 'truss': return new THREE.MeshStandardMaterial({ map: lattice(), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 });
    case 'fade': return new THREE.MeshStandardMaterial({ color: '#ffd84a', map: studs(), transparent: true, opacity: 0.9, roughness: 0.6 });
    case 'ice': return new THREE.MeshStandardMaterial({ color: '#bfefff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85 });
    case 'glass': return new THREE.MeshStandardMaterial({ color: '#e8f8ff', roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false });
    case 'finish': return new THREE.MeshStandardMaterial({ map: finishTex(), emissive: '#ffe080', emissiveIntensity: 0.25 });
    case 'deco': return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.7, transparent: true, opacity: 0.3, depthWrite: false });
    default: { const t = studs().clone(); t.needsUpdate = true; return new THREE.MeshStandardMaterial({ color: c, map: t, roughness: 0.75 }); }
  }
}
// the meshes for a tower; returns { group, meshes (by part id), update(world, t) }
export function buildMeshes(tower) {
  const group = new THREE.Group(), meshes = [];
  for (const p of tower.parts) {
    const geo = p.shape === 'cyl' ? new THREE.CylinderGeometry(p.size[0] / 2, p.size[0] / 2, p.size[1], 40) : new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]);
    const mat = material(p);
    // studs one per metre on top
    if (mat.map && (p.kind === 'solid' || p.kind === 'fade')) { mat.map.repeat.set(Math.max(1, p.size[0] / 2), Math.max(1, p.size[2] / 2)); }
    if (p.kind === 'belt') mat.map.repeat.set(Math.max(1, p.size[0] / 2), Math.max(1, p.size[2] / 2));
    if (p.kind === 'truss') mat.map.repeat.set(1, p.size[1] / p.size[0]);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(p.pos[0], p.pos[1], p.pos[2]); m.rotation.y = p.yaw || 0;
    m.castShadow = p.kind !== 'deco' && p.kind !== 'glass'; m.receiveShadow = p.kind !== 'deco';
    if (p.lobby) { m.material.color.set('#3a4458'); m.material.map.repeat.set(22, 22); }
    group.add(m); meshes[p.id] = m;
    if (p.kind === 'kill') { const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#ffd0d0' })); m.add(edge); }
  }
  return {
    group, meshes,
    update(world, t) {
      for (const s of world) {
        const m = meshes[s.p.id]; if (!m) continue;
        m.position.set(s.x, s.y, s.z); m.rotation.y = s.yaw;
        const k = s.p.kind;
        if (k === 'kill') { const pulse = 0.7 + Math.sin(t * 6) * 0.3; m.material.emissiveIntensity = s.active ? pulse : 0.05; m.material.opacity = s.active ? 1 : 0.12; m.children[0].visible = s.active; }
        else if (k === 'fade') { m.visible = s.active; }
        else if (k === 'belt') { const b = s.p.belt, sp = Math.hypot(b[0], b[2]); m.material.map.offset.set((b[0] / sp) * t * 0.6 * -1, (b[2] / sp) * t * 0.6); }
      }
    },
    dispose() { group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map && !cache.has(o.material.map)) o.material.map.dispose(); }); },
  };
}

// the climber: a blocky figure that walks, jumps and climbs
export function makeAvatar(color = '#3fa0ff') {
  const g = new THREE.Group(), skin = new THREE.MeshStandardMaterial({ color: '#ffcc66', roughness: 0.6 }), body = new THREE.MeshStandardMaterial({ color, roughness: 0.6 }), legs = new THREE.MeshStandardMaterial({ color: '#2a3a6a', roughness: 0.7 });
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; return b; };
  const head = box(0.6, 0.6, 0.6, skin, 0, 1.6, 0);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: tex('face', 64, 64, (c) => { c.fillStyle = '#ffcc66'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#1a1a1a'; c.fillRect(18, 20, 7, 10); c.fillRect(39, 20, 7, 10); c.lineWidth = 4; c.strokeStyle = '#1a1a1a'; c.beginPath(); c.arc(32, 36, 12, 0.2, Math.PI - 0.2); c.stroke(); }) }));
  face.position.set(0, 1.6, 0.301); g.add(face);
  const torso = box(0.9, 0.8, 0.45, body, 0, 0.95, 0);
  const pivot = (x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); g.add(p); return p; };
  const la = pivot(-0.6, 1.3), ra = pivot(0.6, 1.3), ll = pivot(-0.22, 0.55), rl = pivot(0.22, 0.55);
  la.add(box(0.3, 0.8, 0.4, body, 0, -0.35, 0)); ra.add(box(0.3, 0.8, 0.4, body, 0, -0.35, 0)); ll.add(box(0.4, 0.6, 0.42, legs, 0, -0.27, 0)); rl.add(box(0.4, 0.6, 0.42, legs, 0, -0.27, 0));
  g.add(head, torso);
  g.userData = { la, ra, ll, rl, body, phase: 0 };
  return g;
}
// pose the climber: speed on the ground, in the air, climbing
export function poseAvatar(av, dt, pl) {
  const u = av.userData, sp = Math.hypot(pl.vx, pl.vz);
  if (pl.climbing) { u.phase += dt * 10; const s = Math.sin(u.phase); u.la.rotation.x = -2.6 + s * 0.4; u.ra.rotation.x = -2.6 - s * 0.4; u.ll.rotation.x = s * 0.5; u.rl.rotation.x = -s * 0.5; return; }
  if (!pl.grounded) { u.la.rotation.x = -2.8; u.ra.rotation.x = -2.8; u.ll.rotation.x = 0.4; u.rl.rotation.x = -0.3; return; }
  u.phase += dt * sp * 1.4; const s = Math.sin(u.phase) * Math.min(1, sp / 4);
  u.la.rotation.x = s * 0.9; u.ra.rotation.x = -s * 0.9; u.ll.rotation.x = -s * 0.9; u.rl.rotation.x = s * 0.9;
}
export function setAvatarColor(av, color) { av.userData.body.color.set(color); }

// a sky: a soft gradient that deepens as you climb
export function skyTexture(top, bottom) {
  const c = document.createElement('canvas'); c.width = 2; c.height = 256; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
