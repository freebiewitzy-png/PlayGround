import { clamp, lerp, dist, TAU, RNG } from './util.js';
import { WORLD, ALLY, ENEMY, NEUTRAL, POINTS } from './world.js';
import { G, getPoint, getQuestTarget } from './game.js';
import { INPUT } from './input.js';

let canvas = null;
let ctx = null;
let dpr = 1;
let cssW = 0;
let cssH = 0;
const ashRng = new RNG(77123);
const ash = [];

export function initRenderer(target) {
  canvas = target;
  ctx = canvas.getContext('2d');
  for (let i = 0; i < 85; i++) {
    ash.push({
      x: ashRng.range(0, 1),
      y: ashRng.range(0, 1),
      size: ashRng.range(0.6, 2.2),
      speed: ashRng.range(0.008, 0.03),
      drift: ashRng.range(-0.01, 0.01),
      alpha: ashRng.range(0.12, 0.5),
      phase: ashRng.range(0, TAU),
      ember: ashRng.chance(0.18),
    });
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
}

function resize() {
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const base = clamp(Math.min(cssW / 1150, cssH / 760), 0.68, 1.15);
  G.camera.baseZoom = base;
}

export function getViewZoom() {
  return (G.camera.zoom || 1) * (G.camera.baseZoom || 1);
}

export function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const z = getViewZoom();
  return {
    x: (clientX - rect.left - rect.width / 2) / z + G.camera.x,
    y: (clientY - rect.top - rect.height / 2) / z + G.camera.y,
  };
}

function inView(x, y, pad = 100) {
  const z = getViewZoom();
  const hw = cssW / (2 * z) + pad;
  const hh = cssH / (2 * z) + pad;
  return Math.abs(x - G.camera.x) < hw && Math.abs(y - G.camera.y) < hh;
}

export function render(time, dt) {
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = '#0a0f0d';
  ctx.fillRect(0, 0, cssW, cssH);

  const cam = G.camera;
  const z = getViewZoom();
  ctx.save();
  ctx.translate(cssW / 2 + cam.shakeX, cssH / 2 + cam.shakeY);
  ctx.scale(z, z);
  ctx.translate(-cam.x, -cam.y);

  if (G.worldData) {
    ctx.drawImage(G.worldData.terrain, 0, 0, WORLD.w, WORLD.h);
  }

  drawCaptureGround(time);
  drawCorpses();
  drawBuildGhost();

  const drawables = [];
  for (const s of G.structures) {
    if (!inView(s.x, s.y, s.radius * 2.6)) continue;
    drawables.push({ y: s.y, kind: 'structure', obj: s });
  }
  for (const b of G.buildings) {
    if (!inView(b.x, b.y, 100)) continue;
    drawables.push({ y: b.y, kind: 'building', obj: b });
  }
  for (const r of G.resources) {
    if (!inView(r.x, r.y, 90)) continue;
    drawables.push({ y: r.y, kind: 'resource', obj: r });
  }
  for (const u of G.units) {
    if (u.dead || !inView(u.x, u.y, 60)) continue;
    drawables.push({ y: u.y, kind: 'unit', obj: u });
  }
  for (const c of G.caravans) {
    if (!inView(c.x, c.y, 90)) continue;
    drawables.push({ y: c.y, kind: 'caravan', obj: c });
  }
  for (const c of G.critters) {
    if (!inView(c.x, c.y, 50)) continue;
    drawables.push({ y: c.y, kind: 'critter', obj: c });
  }
  if (G.player && !G.player.dead) drawables.push({ y: G.player.y, kind: 'player', obj: G.player });
  drawables.sort((a, b) => a.y - b.y);

  for (const d of drawables) {
    switch (d.kind) {
      case 'structure': drawStructure(ctx, d.obj, time); break;
      case 'building': drawBuilding(ctx, d.obj, time); break;
      case 'resource': drawResource(ctx, d.obj, time); break;
      case 'unit': drawUnit(ctx, d.obj, time); break;
      case 'caravan': drawCaravan(ctx, d.obj, time); break;
      case 'critter': drawCritter(ctx, d.obj, time); break;
      case 'player': drawPlayer(ctx, d.obj, time); break;
      default: break;
    }
  }

  drawProjectiles(ctx, time);
  drawParticles(ctx);
  drawEffects(ctx, time);
  drawTexts(ctx);
  drawPointLabels(ctx, time);
  drawLights(ctx, time);
  drawAim(ctx, time);

  ctx.restore();

  drawAsh(time);
  drawJoysticks();
  drawOffscreenMarker();
}

function drawCaptureGround(time) {
  for (const p of G.points) {
    if (!inView(p.x, p.y, p.r + 100)) continue;
    const col = p.owner === ALLY ? '255,206,120' : p.owner === ENEMY ? '169,139,214' : '214,205,176';
    const pulse = 0.5 + Math.sin(time * 2 + p.pulse) * 0.5;
    const g = ctx.createRadialGradient(p.x, p.y, p.r * 0.2, p.x, p.y, p.r);
    g.addColorStop(0, `rgba(${col},${0.05 + pulse * 0.03})`);
    g.addColorStop(0.75, `rgba(${col},${0.07 + pulse * 0.04})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.r, p.r * 0.82, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(time * 0.15 + p.pulse);
    ctx.strokeStyle = `rgba(${col},${0.32 + pulse * 0.18})`;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([18, 16]);
    ctx.beginPath();
    ctx.ellipse(0, 0, p.r, p.r * 0.82, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    if (p.kind !== 'keep') {
      const frac = Math.abs(p.control) / 100;
      ctx.strokeStyle = `rgba(${col},0.9)`;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.72, -Math.PI / 2, -Math.PI / 2 + TAU * frac * (p.control < 0 ? -1 : 1), p.control < 0);
      ctx.stroke();
    }
  }
}

function drawCorpses() {
  for (const c of G.corpses) {
    if (!inView(c.x, c.y, 40)) continue;
    const a = Math.min(1, c.ttl / 6);
    ctx.save();
    ctx.globalAlpha = a * 0.7;
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    ctx.fillStyle = c.faction === ALLY ? '#5e2a24' : '#382844';
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 6, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 14, 5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawBuildGhost() {
  if (!G.buildMode || !G.player) return;
  const p = G.player;
  let gx = p.x + Math.cos(p.aimAngle) * 95;
  let gy = p.y + Math.sin(p.aimAngle) * 95;
  if (INPUT.mouse.active) {
    gx = INPUT.mouse.worldX;
    gy = INPUT.mouse.worldY;
  }
  const def = G.buildings.length >= 0 ? null : null;
  const info = G.buildMode;
  const ok = dist(p.x, p.y, gx, gy) <= 220;
  ctx.save();
  ctx.globalAlpha = 0.65;
  ctx.strokeStyle = ok ? 'rgba(255,210,122,0.9)' : 'rgba(220,90,80,0.9)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.arc(gx, gy, 42, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = ok ? 'rgba(255,210,122,0.16)' : 'rgba(220,90,80,0.16)';
  ctx.beginPath();
  ctx.arc(gx, gy, 40, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,240,210,0.9)';
  ctx.font = '600 12px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(info.toUpperCase(), gx, gy + 4);
  ctx.restore();
}

function drawPointLabels(time) {
  for (const p of G.points) {
    if (!inView(p.x, p.y, p.r + 60)) continue;
    const col = p.owner === ALLY ? '#f0c878' : p.owner === ENEMY ? '#b59ae0' : '#ded3b5';
    ctx.save();
    ctx.font = '600 13px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(4,8,7,0.55)';
    const w = ctx.measureText(p.name.toUpperCase()).width + 18;
    const y = p.y - p.r * 0.82 - 16;
    ctx.fillRect(p.x - w / 2, y - 13, w, 20);
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.6;
    ctx.strokeRect(p.x - w / 2, y - 13, w, 20);
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.fillText(p.name.toUpperCase(), p.x, y + 2);
    if (p.contested) {
      ctx.fillStyle = 'rgba(240,120,90,0.9)';
      ctx.font = '600 10px Georgia, serif';
      ctx.fillText('CONTESTED', p.x, y + 18 + Math.sin(time * 4) * 1.5);
    }
    ctx.restore();
  }
}

function drawAim() {
  const p = G.player;
  if (!p || p.dead || G.mode !== 'playing') return;
  if (!INPUT.aimActive && !INPUT.stickAim) return;
  const a = p.aimAngle;
  const x = p.x + Math.cos(a) * 92;
  const y = p.y + Math.sin(a) * 92;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.strokeStyle = 'rgba(255,206,120,0.5)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0.4, 2.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 10, 3.5, 5.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(20, 0);
  ctx.stroke();
  ctx.restore();
}

function drawAsh(time) {
  ctx.save();
  for (const a of ash) {
    const y = ((a.y + time * a.speed) % 1) * cssH;
    const x = ((a.x + time * a.drift + Math.sin(time * 0.7 + a.phase) * 0.01) % 1) * cssW;
    ctx.globalAlpha = a.alpha * (0.7 + Math.sin(time * 2 + a.phase) * 0.3);
    ctx.fillStyle = a.ember ? '#d98a52' : '#c9c4b4';
    ctx.beginPath();
    ctx.arc(x, y, a.size, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawJoysticks() {
  const draw = (s, color) => {
    if (!s) return;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.ox, s.oy, 62, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(s.ox, s.oy, 62, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(s.ox + s.dx, s.oy + s.dy, 24, 0, TAU);
    ctx.fill();
    ctx.restore();
  };
  draw(INPUT.stickMove, '#e7c27c');
  draw(INPUT.stickAim, '#8fd9c4');
}

function drawOffscreenMarker() {
  if (G.mode !== 'playing' || !G.player) return;
  const target = getQuestTarget();
  if (!target) return;
  const z = getViewZoom();
  const sx = (target.x - G.camera.x) * z + cssW / 2;
  const sy = (target.y - G.camera.y) * z + cssH / 2;
  const margin = 54;
  if (sx > margin && sx < cssW - margin && sy > margin && sy < cssH - margin) return;
  const cx = cssW / 2;
  const cy = cssH / 2;
  const ang = Math.atan2(sy - cy, sx - cx);
  const rx = Math.min(cssW / 2 - margin, Math.abs(Math.cos(ang)) * (cssW / 2 - margin) || 1);
  const ry = Math.min(cssH / 2 - margin, Math.abs(Math.sin(ang)) * (cssH / 2 - margin) || 1);
  const t = Math.min(rx / Math.max(0.001, Math.abs(Math.cos(ang))), ry / Math.max(0.001, Math.abs(Math.sin(ang))));
  const px = cx + Math.cos(ang) * t;
  const py = cy + Math.sin(ang) * t;
  const d = Math.round(dist(G.player.x, G.player.y, target.x, target.y));
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(ang);
  ctx.fillStyle = 'rgba(255,206,120,0.9)';
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-8, -8);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-8, 8);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(-ang);
  ctx.font = '600 11px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,230,180,0.9)';
  ctx.fillText(`${target.name} · ${d}m`, 0, 26);
  ctx.restore();
}

export function renderMinimap(mapCanvas) {
  if (!mapCanvas || !G.worldData) return;
  const m = mapCanvas.getContext('2d');
  const w = mapCanvas.width;
  const h = mapCanvas.height;
  m.clearRect(0, 0, w, h);
  m.drawImage(G.worldData.minimap, 0, 0, w, h);
  const sx = w / WORLD.w;
  const sy = h / WORLD.h;
  for (const p of G.points) {
    m.fillStyle = p.owner === ALLY ? '#f0c878' : p.owner === ENEMY ? '#a98bd6' : '#d8cfb2';
    m.beginPath();
    m.arc(p.x * sx, p.y * sy, p.kind === 'keep' ? 4 : 3, 0, TAU);
    m.fill();
    m.strokeStyle = 'rgba(5,8,7,0.8)';
    m.lineWidth = 1;
    m.stroke();
  }
  for (let i = 0; i < G.units.length; i += 2) {
    const u = G.units[i];
    if (u.dead) continue;
    m.fillStyle = u.faction === ALLY ? 'rgba(240,200,120,0.8)' : 'rgba(180,150,220,0.8)';
    m.fillRect(u.x * sx - 0.7, u.y * sy - 0.7, 1.5, 1.5);
  }
  if (G.player && !G.player.dead) {
    const x = G.player.x * sx;
    const y = G.player.y * sy;
    m.save();
    m.translate(x, y);
    m.rotate(G.player.aimAngle);
    m.fillStyle = '#fff4d8';
    m.beginPath();
    m.moveTo(5, 0);
    m.lineTo(-4, -3.5);
    m.lineTo(-4, 3.5);
    m.closePath();
    m.fill();
    m.restore();
  }
  const z = getViewZoom();
  m.strokeStyle = 'rgba(240,230,200,0.4)';
  m.lineWidth = 1;
  m.strokeRect(
    (G.camera.x - cssW / (2 * z)) * sx,
    (G.camera.y - cssH / (2 * z)) * sy,
    (cssW / z) * sx,
    (cssH / z) * sy,
  );
}

function drawFlag(x, y, scale, color, time, phase = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#2c2419';
  ctx.lineWidth = Math.max(1.5, scale * 0.16);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -scale * 3.1);
  ctx.stroke();
  const wave = Math.sin(time * 2.4 + phase) * scale * 0.35;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -scale * 3);
  ctx.quadraticCurveTo(scale * 1.2, -scale * 3 + wave, scale * 2.3, -scale * 2.6);
  ctx.quadraticCurveTo(scale * 1.2, -scale * 2.2 - wave, 0, -scale * 1.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,235,190,0.25)';
  ctx.beginPath();
  ctx.moveTo(0, -scale * 2.95);
  ctx.quadraticCurveTo(scale * 0.9, -scale * 2.85 + wave, scale * 1.5, -scale * 2.7);
  ctx.lineTo(scale * 1.5, -scale * 2.55);
  ctx.quadraticCurveTo(scale * 0.9, -scale * 2.6 - wave, 0, -scale * 2.65);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawKeep(s, time) {
  const ally = s.faction === ALLY;
  const k = s.radius / 120;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.fillStyle = 'rgba(3,6,5,0.48)';
  ctx.beginPath();
  ctx.ellipse(0, 18 * k, 150 * k, 62 * k, 0, 0, TAU);
  ctx.fill();

  const stone = ally ? '#59584e' : '#332f40';
  const stoneDark = ally ? '#3b3b35' : '#211e2c';
  const stoneLight = ally ? '#767467' : '#4a435c';
  const roof = ally ? '#78362d' : '#43285c';
  const roofDark = ally ? '#4c211c' : '#2a183b';
  const trim = ally ? '#d0a45a' : '#9b7ac7';
  const glow = ally ? '#ffb15e' : '#a98bd6';

  ctx.fillStyle = stoneDark;
  ctx.beginPath();
  ctx.ellipse(0, 8 * k, 132 * k, 52 * k, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = stone;
  ctx.beginPath();
  ctx.moveTo(-124 * k, 8 * k);
  ctx.lineTo(-108 * k, -34 * k);
  ctx.lineTo(108 * k, -34 * k);
  ctx.lineTo(124 * k, 8 * k);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = stoneLight;
  ctx.fillRect(-112 * k, -48 * k, 224 * k, 16 * k);
  for (let i = -5; i <= 5; i++) {
    ctx.fillRect(i * 20 * k - 5 * k, -58 * k, 10 * k, 12 * k);
  }
  ctx.fillStyle = stoneDark;
  ctx.fillRect(-118 * k, -32 * k, 236 * k, 5 * k);

  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 100 * k, -40 * k);
    ctx.fillStyle = stoneDark;
    ctx.beginPath();
    ctx.ellipse(0, 12 * k, 31 * k, 17 * k, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.arc(0, -2 * k, 29 * k, 0, TAU);
    ctx.fill();
    ctx.fillStyle = stoneLight;
    ctx.beginPath();
    ctx.arc(-8 * k, -12 * k, 20 * k, 0, TAU);
    ctx.fill();
    ctx.fillStyle = roofDark;
    ctx.beginPath();
    ctx.moveTo(-34 * k, -18 * k);
    ctx.lineTo(0, -86 * k);
    ctx.lineTo(34 * k, -18 * k);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(-30 * k, -20 * k);
    ctx.lineTo(0, -82 * k);
    ctx.lineTo(10 * k, -20 * k);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = trim;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -82 * k);
    ctx.lineTo(0, -96 * k);
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawFlag(side * 6 * k, -96 * k, 7 * k, ally ? '#b3402f' : '#6d4a8f', time, side * 1.7 + s.x * 0.01);
    ctx.restore();
  }

  ctx.fillStyle = stone;
  ctx.fillRect(-58 * k, -132 * k, 116 * k, 92 * k);
  ctx.fillStyle = stoneLight;
  ctx.fillRect(-58 * k, -132 * k, 24 * k, 92 * k);
  ctx.fillStyle = stoneDark;
  for (let i = -2; i <= 2; i++) {
    ctx.fillRect(i * 23 * k - 4 * k, -146 * k, 8 * k, 16 * k);
  }
  ctx.fillStyle = roofDark;
  ctx.beginPath();
  ctx.moveTo(-72 * k, -134 * k);
  ctx.lineTo(0, -226 * k);
  ctx.lineTo(72 * k, -134 * k);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(-66 * k, -136 * k);
  ctx.lineTo(0, -220 * k);
  ctx.lineTo(20 * k, -136 * k);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = trim;
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = 0.65;
  ctx.beginPath();
  ctx.moveTo(0, -220 * k);
  ctx.lineTo(0, -244 * k);
  ctx.stroke();
  ctx.globalAlpha = 1;
  drawFlag(0, -244 * k, 10 * k, ally ? '#c14934' : '#7b54a6', time, s.y * 0.01);

  const winY = -96 * k;
  for (const wx of [-28, 0, 28]) {
    const flicker = 0.75 + Math.sin(time * 6 + wx) * 0.25;
    ctx.fillStyle = `rgba(${ally ? '255,180,90' : '170,130,230'},${0.75 * flicker})`;
    ctx.fillRect(wx * k - 4 * k, winY, 8 * k, 14 * k);
  }
  ctx.fillStyle = ally ? '#2b2118' : '#1b1424';
  ctx.beginPath();
  ctx.moveTo(-22 * k, 6 * k);
  ctx.lineTo(-22 * k, -30 * k);
  ctx.quadraticCurveTo(0, -52 * k, 22 * k, -30 * k);
  ctx.lineTo(22 * k, 6 * k);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = trim;
  ctx.globalAlpha = 0.4;
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (s.hp < s.maxHp * 0.7) {
    ctx.strokeStyle = 'rgba(20,16,13,0.6)';
    ctx.lineWidth = 2.2 * k;
    ctx.beginPath();
    ctx.moveTo(-30 * k, -120 * k);
    ctx.lineTo(-8 * k, -88 * k);
    ctx.lineTo(-22 * k, -62 * k);
    ctx.moveTo(72 * k, -20 * k);
    ctx.lineTo(40 * k, -4 * k);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const t = (time * 0.5 + i * 0.33) % 1;
      ctx.globalAlpha = (1 - t) * 0.25;
      ctx.fillStyle = '#9a9588';
      ctx.beginPath();
      ctx.arc(-30 * k + Math.sin(time + i) * 12, -120 * k - t * 70 * k, (8 + t * 16) * k, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const glowG = ctx.createRadialGradient(0, -80 * k, 10, 0, -80 * k, 150 * k);
  glowG.addColorStop(0, `rgba(${ally ? '255,160,80' : '150,110,210'},0.16)`);
  glowG.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glowG;
  ctx.beginPath();
  ctx.arc(0, -80 * k, 150 * k, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawForge(s, time) {
  const ally = s.faction === ALLY;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.fillStyle = 'rgba(3,6,5,0.45)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 56, 22, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = ally ? '#4e493e' : '#322b40';
  ctx.fillRect(-34, -26, 68, 42);
  ctx.fillStyle = ally ? '#686053' : '#413852';
  ctx.fillRect(-30, -36, 60, 16);
  ctx.fillStyle = ally ? '#3a352d' : '#241f30';
  ctx.fillRect(14, -70, 14, 38);
  ctx.fillStyle = ally ? '#746a5a' : '#4b4160';
  ctx.fillRect(10, -74, 22, 8);
  ctx.fillStyle = '#1d1a18';
  ctx.beginPath();
  ctx.moveTo(-24, -20);
  ctx.lineTo(-12, -20);
  ctx.lineTo(-18, -2);
  ctx.closePath();
  ctx.fill();
  const glow = 0.6 + Math.sin(time * 7) * 0.2;
  const g = ctx.createRadialGradient(0, -20, 2, 0, -20, 62);
  g.addColorStop(0, `rgba(255,150,60,${0.42 * glow})`);
  g.addColorStop(1, 'rgba(255,100,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, -20, 62, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const t = (time * 1.4 + i * 0.21) % 1;
    ctx.globalAlpha = (1 - t) * 0.8;
    ctx.fillStyle = i % 2 ? '#ffd27a' : '#ff8b45';
    ctx.beginPath();
    ctx.arc(Math.sin(time * 3 + i) * 18, -20 - t * 46, 1.5, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawTower(s, time) {
  const enemy = s.faction === ENEMY;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.fillStyle = 'rgba(3,4,6,0.5)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 66, 26, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = enemy ? '#2a2636' : '#4f4b42';
  ctx.beginPath();
  ctx.moveTo(-34, 8);
  ctx.lineTo(-24, -80);
  ctx.lineTo(24, -80);
  ctx.lineTo(34, 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = enemy ? '#3d3650' : '#625b4e';
  ctx.beginPath();
  ctx.moveTo(-24, -80);
  ctx.lineTo(-14, -160);
  ctx.lineTo(14, -160);
  ctx.lineTo(24, -80);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = enemy ? '#51456c' : '#756b5a';
  ctx.beginPath();
  ctx.moveTo(-18, -160);
  ctx.lineTo(0, -204);
  ctx.lineTo(18, -160);
  ctx.closePath();
  ctx.fill();
  const pulse = 0.65 + Math.sin(time * 2.5) * 0.25;
  const g = ctx.createRadialGradient(0, -178, 2, 0, -178, 52);
  g.addColorStop(0, `rgba(160,120,230,${0.5 * pulse})`);
  g.addColorStop(1, 'rgba(90,50,150,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, -178, 52, 0, TAU);
  ctx.fill();
  ctx.fillStyle = enemy ? '#c6a8f0' : '#f0c878';
  ctx.beginPath();
  ctx.arc(0, -178, 8 + Math.sin(time * 3) * 1.5, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = 'rgba(160,120,230,0.7)';
    ctx.beginPath();
    ctx.arc(Math.cos(time + i * 1.57) * 14, -178 + Math.sin(time + i * 1.57) * 10, 2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawRuin(s) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.fillStyle = 'rgba(4,6,5,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 10, 58, 22, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#4b4a40';
  for (let i = 0; i < 5; i++) {
    const a = i * 1.25;
    const x = Math.cos(a) * 34;
    const y = Math.sin(a) * 14;
    const h = 18 + (i % 3) * 16;
    ctx.fillRect(x - 7, y - h, 14, h);
    ctx.fillStyle = '#5b594b';
    ctx.fillRect(x - 7, y - h, 5, h);
    ctx.fillStyle = '#4b4a40';
  }
  ctx.restore();
}

function drawShrine(s, time) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.fillStyle = 'rgba(3,7,8,0.5)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 72, 30, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#4f5b55';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.ellipse(0, 0, 54, 24, 0, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.fillStyle = '#59665e';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 54, Math.sin(a) * 24, 6, 0, TAU);
    ctx.fill();
  }
  const pulse = 0.5 + Math.sin(time * 1.8) * 0.2;
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 58);
  g.addColorStop(0, `rgba(110,220,210,${0.28 * pulse})`);
  g.addColorStop(1, 'rgba(70,160,160,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, 58, 30, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(140,240,225,0.6)';
  ctx.beginPath();
  ctx.arc(0, -4, 5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawGate(s, time) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.fillStyle = 'rgba(4,6,5,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 64, 24, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#4b4a40';
  ctx.fillRect(-58, -56, 20, 62);
  ctx.fillRect(38, -56, 20, 62);
  ctx.fillStyle = '#5c5a4c';
  ctx.fillRect(-58, -56, 7, 62);
  ctx.fillRect(38, -56, 7, 62);
  ctx.fillStyle = '#3d3c35';
  ctx.beginPath();
  ctx.moveTo(-38, -56);
  ctx.quadraticCurveTo(0, -92, 38, -56);
  ctx.lineTo(38, -44);
  ctx.quadraticCurveTo(0, -76, -38, -44);
  ctx.closePath();
  ctx.fill();
  drawFlag(0, -74, 5, '#b3402f', time, 0.7);
  ctx.restore();
}

function drawStructure(s, time) {
  if (s.destroyed) {
    if (s.kind === 'keep') {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = 'rgba(10,8,7,0.5)';
      ctx.beginPath();
      ctx.ellipse(0, 14, 150, 60, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = s.faction === ALLY ? '#3f3a31' : '#2c2436';
      for (let i = 0; i < 8; i++) {
        const a = i * 0.9;
        ctx.fillRect(Math.cos(a) * 80 - 12, Math.sin(a) * 30 - 12, 24, 20);
      }
      ctx.restore();
    }
    return;
  }
  if (s.kind === 'keep') drawKeep(s, time);
  else if (s.kind === 'forge') drawForge(s, time);
  else if (s.kind === 'tower') drawTower(s, time);
  else if (s.kind === 'ruin') drawRuin(s);
  else if (s.kind === 'shrine') drawShrine(s, time);
  else if (s.kind === 'gate') drawGate(s, time);

  if (s.flash > 0) {
    ctx.save();
    ctx.globalAlpha = s.flash * 2;
    ctx.fillStyle = 'rgba(255,220,160,0.35)';
    ctx.beginPath();
    ctx.arc(s.x, s.y - s.radius * 0.3, s.radius * 1.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  if (s.maxHp > 0 && s.hp < s.maxHp) {
    const w = Math.max(46, s.radius * 1.1);
    const y = s.y + s.radius * 0.55;
    ctx.fillStyle = 'rgba(4,7,6,0.7)';
    ctx.fillRect(s.x - w / 2, y, w, 5);
    ctx.fillStyle = s.faction === ALLY ? '#e7bb66' : '#a98bd6';
    ctx.fillRect(s.x - w / 2 + 1, y + 1, (w - 2) * clamp(s.hp / s.maxHp, 0, 1), 3);
  }
}

function drawBuilding(b, time) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.fillStyle = 'rgba(3,6,5,0.42)';
  ctx.beginPath();
  ctx.ellipse(0, 8, b.radius * 1.2, b.radius * 0.5, 0, 0, TAU);
  ctx.fill();

  if (b.kind === 'barricade') {
    ctx.rotate(-0.18);
    ctx.fillStyle = '#4b3823';
    ctx.fillRect(-38, -14, 76, 16);
    ctx.fillStyle = '#654b2c';
    for (let i = -3; i <= 3; i++) {
      ctx.fillRect(i * 11 - 4, -22, 7, 34);
      ctx.fillStyle = '#7d5c36';
      ctx.fillRect(i * 11 - 4, -22, 2, 34);
      ctx.fillStyle = '#654b2c';
    }
    ctx.fillStyle = '#33312b';
    ctx.fillRect(-38, -18, 76, 4);
    ctx.fillRect(-38, 2, 76, 4);
    ctx.fillStyle = '#8d7448';
    ctx.beginPath();
    ctx.moveTo(-40, -22);
    ctx.lineTo(-34, -30);
    ctx.lineTo(-30, -20);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(40, -22);
    ctx.lineTo(34, -30);
    ctx.lineTo(30, -20);
    ctx.closePath();
    ctx.fill();
  } else if (b.kind === 'ballista') {
    ctx.fillStyle = '#4b3823';
    ctx.fillRect(-24, -8, 48, 18);
    ctx.fillStyle = '#6e5231';
    ctx.fillRect(-28, -14, 8, 30);
    ctx.fillRect(20, -14, 8, 30);
    ctx.strokeStyle = '#8a6a3d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-26, -12);
    ctx.quadraticCurveTo(0, -34, 26, -12);
    ctx.stroke();
    ctx.strokeStyle = '#d8c9a4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(0, -54);
    ctx.stroke();
    ctx.fillStyle = '#c9b88e';
    ctx.beginPath();
    ctx.moveTo(0, -60);
    ctx.lineTo(-5, -50);
    ctx.lineTo(5, -50);
    ctx.closePath();
    ctx.fill();
    drawFlag(22, -16, 4.5, '#b3402f', time, 0.4);
  } else if (b.kind === 'ward') {
    ctx.fillStyle = '#4f5b55';
    ctx.beginPath();
    ctx.moveTo(-16, 10);
    ctx.lineTo(-10, -40);
    ctx.lineTo(10, -40);
    ctx.lineTo(16, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#66746b';
    ctx.beginPath();
    ctx.moveTo(-10, -40);
    ctx.lineTo(0, -58);
    ctx.lineTo(10, -40);
    ctx.closePath();
    ctx.fill();
    const pulse = 0.6 + Math.sin(time * 2.2) * 0.2;
    const g = ctx.createRadialGradient(0, -34, 2, 0, -34, 58);
    g.addColorStop(0, `rgba(130,240,210,${0.35 * pulse})`);
    g.addColorStop(1, 'rgba(80,190,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -34, 58, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#a7f0dd';
    ctx.beginPath();
    ctx.moveTo(0, -48);
    ctx.lineTo(7, -34);
    ctx.lineTo(0, -20);
    ctx.lineTo(-7, -34);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,240,220,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 6, 34, 13, 0, 0, TAU);
    ctx.stroke();
  } else if (b.kind === 'rally') {
    ctx.fillStyle = '#3c3022';
    ctx.fillRect(-3, -50, 6, 62);
    drawFlag(0, -50, 7, '#b3402f', time, 1.2);
    ctx.strokeStyle = 'rgba(255,206,120,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 6, 40, 16, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,206,120,0.7)';
    ctx.beginPath();
    ctx.arc(0, -58, 3, 0, TAU);
    ctx.fill();
  }

  if (b.flash > 0) {
    ctx.globalAlpha = b.flash * 2;
    ctx.fillStyle = 'rgba(255,230,180,0.4)';
    ctx.beginPath();
    ctx.arc(0, -16, b.radius * 1.3, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (b.hp < b.maxHp) {
    const w = b.radius * 1.4;
    ctx.fillStyle = 'rgba(4,7,6,0.7)';
    ctx.fillRect(-w / 2, -b.radius - 24, w, 4);
    ctx.fillStyle = '#e7bb66';
    ctx.fillRect(-w / 2 + 1, -b.radius - 23, (w - 2) * clamp(b.hp / b.maxHp, 0, 1), 2);
  }
  ctx.restore();
}

function drawResource(r, time) {
  const ratio = r.amount / r.max;
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.fillStyle = 'rgba(3,6,5,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 8, 32, 14, 0, 0, TAU);
  ctx.fill();
  if (r.type === 'iron') {
    ctx.fillStyle = '#3c4446';
    ctx.beginPath();
    ctx.moveTo(-24, 8);
    ctx.lineTo(-16, -18);
    ctx.lineTo(-2, -30);
    ctx.lineTo(12, -16);
    ctx.lineTo(24, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#59676a';
    ctx.beginPath();
    ctx.moveTo(-16, -18);
    ctx.lineTo(-2, -30);
    ctx.lineTo(2, -10);
    ctx.lineTo(-10, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a8bcc0';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(-12 + i * 8, -8 + (i % 2) * 8, 1.7, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(180,200,200,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, -12);
    ctx.lineTo(4, 0);
    ctx.stroke();
  } else if (r.type === 'timber') {
    ctx.fillStyle = '#4a3521';
    ctx.fillRect(-28, -4, 56, 16);
    ctx.fillStyle = '#6b4c2c';
    ctx.fillRect(-28, -8, 56, 6);
    ctx.fillStyle = '#8f6a3d';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(i * 12, 0, 4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#5c4227';
      ctx.beginPath();
      ctx.arc(i * 12, 0, 2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#8f6a3d';
    }
    ctx.fillStyle = '#3f2d1c';
    ctx.fillRect(-6, -30, 12, 24);
  } else {
    const pulse = 0.6 + Math.sin(time * 2.6 + r.phase) * 0.25;
    const g = ctx.createRadialGradient(0, -16, 2, 0, -16, 54);
    g.addColorStop(0, `rgba(140,230,220,${0.34 * pulse})`);
    g.addColorStop(1, 'rgba(80,180,180,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -16, 54, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#5f8e8c';
    for (let i = 0; i < 4; i++) {
      const a = -1.2 + i * 0.8;
      const h = 20 + (i % 2) * 16;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(-5, -h);
      ctx.lineTo(0, -h - 8);
      ctx.lineTo(5, -h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = i % 2 ? '#a7e5dd' : '#7fc8c2';
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(190,255,245,0.8)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(Math.cos(time * 1.2 + i * 2.1) * 16, -20 + Math.sin(time * 1.6 + i) * 10, 1.5, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 0.35 + ratio * 0.65;
  ctx.strokeStyle = r.type === 'iron' ? '#a8bcc0' : r.type === 'timber' ? '#c49a61' : '#a7e5dd';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 10, 30, 9, 0, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (G.player && dist(r.x, r.y, G.player.x, G.player.y) < 140) {
    ctx.font = '600 11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(4,7,6,0.65)';
    ctx.fillRect(-42, -64, 84, 18);
    ctx.fillStyle = r.type === 'iron' ? '#c2d0d2' : r.type === 'timber' ? '#d8b177' : '#a7e5dd';
    ctx.fillText(r.name, 0, -51);
    ctx.fillStyle = 'rgba(4,7,6,0.7)';
    ctx.fillRect(-24, -43, 48, 4);
    ctx.fillStyle = ctx.fillStyle = r.type === 'iron' ? '#a8bcc0' : r.type === 'timber' ? '#c49a61' : '#a7e5dd';
    ctx.fillRect(-23, -42, 46 * ratio, 2);
  }
  ctx.restore();
}

function drawCaravan(c, time) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.angle);
  ctx.fillStyle = 'rgba(3,6,5,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 9, 38, 14, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#3b2a1b';
  ctx.beginPath();
  ctx.ellipse(34, 0, 15, 8, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#6b4b2c';
  ctx.fillRect(22, -5, 18, 9);
  ctx.fillStyle = '#d8cbb0';
  ctx.fillRect(14, -8, 4, 14);
  ctx.fillStyle = '#5b3c22';
  ctx.fillRect(-32, -10, 44, 22);
  ctx.fillStyle = '#8b6538';
  ctx.beginPath();
  ctx.moveTo(-30, -10);
  ctx.quadraticCurveTo(-10, -34, 12, -10);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#4a321c';
  ctx.lineWidth = 2;
  for (let i = -24; i < 10; i += 8) {
    ctx.beginPath();
    ctx.moveTo(i, -10);
    ctx.lineTo(i + 2, -22);
    ctx.stroke();
  }
  ctx.fillStyle = '#2c2118';
  ctx.beginPath();
  ctx.arc(-24, 10, 7, 0, TAU);
  ctx.arc(4, 10, 7, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#a88a54';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(-24, 10, 4, 0, TAU);
  ctx.arc(4, 10, 4, 0, TAU);
  ctx.stroke();
  drawFlag(-28, -12, 5, '#b3402f', time, c.bob);
  if (c.hp < c.maxHp) {
    ctx.rotate(-c.angle);
    ctx.fillStyle = 'rgba(4,7,6,0.7)';
    ctx.fillRect(-28, -46, 56, 4);
    ctx.fillStyle = '#e7bb66';
    ctx.fillRect(-27, -45, 54 * clamp(c.hp / c.maxHp, 0, 1), 2);
  }
  ctx.restore();
}

function drawCritter(c, time) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(3,6,5,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 5, 9, 4, 0, 0, TAU);
  ctx.fill();
  if (c.type === 'crow') {
    const flap = Math.sin(c.phase * 3) * 5;
    ctx.fillStyle = '#17151a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 3, c.dir, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#17151a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-8, -flap);
    ctx.moveTo(2, 0);
    ctx.lineTo(8, flap);
    ctx.stroke();
  } else {
    ctx.rotate(c.dir);
    ctx.fillStyle = '#6e4b2c';
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#553922';
    ctx.beginPath();
    ctx.ellipse(8, -5, 4, 3, 0.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#4a301c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-8, -2);
    ctx.lineTo(-11, -7);
    ctx.moveTo(-8, 2);
    ctx.lineTo(-11, 7);
    ctx.stroke();
  }
  ctx.restore();
}

// __APPEND__

