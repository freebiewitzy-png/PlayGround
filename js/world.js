import { RNG, clamp, dist, fbm, mixColor, noise2, polylineDistance, smoothstep, TAU } from './util.js';

export const WORLD = { w: 4096, h: 3072 };

export const ALLY = 1;
export const ENEMY = -1;
export const NEUTRAL = 0;

export const POINTS = [
  { id: 'emberhold', name: 'Emberhold', kind: 'keep', x: 620, y: 2490, r: 230, start: ALLY, weight: 3, lane: 0 },
  { id: 'cinderfield', name: 'Cinderfield', kind: 'town', x: 1340, y: 1990, r: 175, start: ALLY, weight: 2, lane: 1 },
  { id: 'ashenford', name: 'Ashen Ford', kind: 'ford', x: 2040, y: 1490, r: 195, start: NEUTRAL, weight: 2, lane: 2 },
  { id: 'gloamwood', name: 'Gloamwood', kind: 'watch', x: 2820, y: 1080, r: 170, start: ENEMY, weight: 2, lane: 3 },
  { id: 'mournspire', name: 'Mournspire', kind: 'keep', x: 3490, y: 570, r: 245, start: ENEMY, weight: 3, lane: 4 },
  { id: 'oldwatch', name: 'Old Watchtower', kind: 'watch', x: 1390, y: 820, r: 150, start: NEUTRAL, weight: 1, lane: 1.5 },
  { id: 'shrine', name: 'Sunken Shrine', kind: 'shrine', x: 2880, y: 2290, r: 150, start: NEUTRAL, weight: 1, lane: 2.5 },
];

export const LANE = ['emberhold', 'cinderfield', 'ashenford', 'gloamwood', 'mournspire'];

export const STRUCTURES = [
  { id: 'emberkeep', kind: 'keep', faction: ALLY, x: 620, y: 2490, hp: 32000, maxHp: 32000, radius: 120, name: 'Emberhold' },
  { id: 'emberforge', kind: 'forge', faction: ALLY, x: 835, y: 2600, hp: 4200, maxHp: 4200, radius: 58, name: 'Emberhold Forge' },
  { id: 'cinderforge', kind: 'forge', faction: ALLY, x: 1295, y: 2085, hp: 3600, maxHp: 3600, radius: 58, name: 'Cinderfield Forge' },
  { id: 'gloamtower', kind: 'tower', faction: ENEMY, x: 2820, y: 1080, hp: 9000, maxHp: 9000, radius: 72, name: 'Gloamwood Spire' },
  { id: 'mournkeep', kind: 'keep', faction: ENEMY, x: 3490, y: 570, hp: 32000, maxHp: 32000, radius: 130, name: 'Mournspire' },
  { id: 'oldwatchruin', kind: 'ruin', faction: NEUTRAL, x: 1390, y: 820, hp: 0, maxHp: 0, radius: 60, name: 'Old Watchtower' },
  { id: 'shrinestone', kind: 'shrine', faction: NEUTRAL, x: 2880, y: 2290, hp: 0, maxHp: 0, radius: 70, name: 'Sunken Shrine' },
  { id: 'ashengate', kind: 'gate', faction: NEUTRAL, x: 2040, y: 1490, hp: 0, maxHp: 0, radius: 30, name: 'Ashen Ford' },
];

export const RESOURCE_SITES = [
  { type: 'iron', x: 1715, y: 1785, amount: 160, name: 'Rusted Vein' },
  { type: 'iron', x: 1600, y: 2380, amount: 160, name: 'Ember Quarry' },
  { type: 'iron', x: 2465, y: 1945, amount: 160, name: 'Broken Spur' },
  { type: 'iron', x: 920, y: 1470, amount: 160, name: 'Cold Seam' },
  { type: 'iron', x: 3180, y: 1870, amount: 160, name: 'Hollow Dig' },
  { type: 'timber', x: 2350, y: 1745, amount: 180, name: 'Gallows Grove' },
  { type: 'timber', x: 1240, y: 1650, amount: 180, name: 'Splinterwood' },
  { type: 'timber', x: 2930, y: 1490, amount: 180, name: 'Thornfall' },
  { type: 'timber', x: 1830, y: 2560, amount: 180, name: 'Old Timber Camp' },
  { type: 'timber', x: 3160, y: 2420, amount: 180, name: 'Drowned Pines' },
  { type: 'essence', x: 2200, y: 1280, amount: 130, name: 'Wispglass' },
  { type: 'essence', x: 3130, y: 890, amount: 130, name: 'Mourn Crystal' },
  { type: 'essence', x: 1610, y: 930, amount: 130, name: 'Starfall Shard' },
  { type: 'essence', x: 2910, y: 2390, amount: 130, name: 'Sunken Light' },
];

export const ROAD_PATHS = [
  [
    { x: 620, y: 2490 }, { x: 905, y: 2335 }, { x: 1340, y: 1990 }, { x: 1655, y: 1775 },
    { x: 2040, y: 1490 }, { x: 2350, y: 1325 }, { x: 2820, y: 1080 }, { x: 3170, y: 820 }, { x: 3490, y: 570 },
  ],
  [{ x: 1340, y: 1990 }, { x: 1235, y: 1690 }, { x: 1320, y: 1260 }, { x: 1390, y: 820 }],
  [{ x: 2040, y: 1490 }, { x: 2340, y: 1780 }, { x: 2600, y: 2070 }, { x: 2880, y: 2290 }],
  [{ x: 2820, y: 1080 }, { x: 3100, y: 1640 }, { x: 3040, y: 2040 }, { x: 2880, y: 2290 }],
];

export const RIVER_PATH = [
  { x: -120, y: 1035 }, { x: 470, y: 1150 }, { x: 1020, y: 1275 }, { x: 1550, y: 1380 },
  { x: 2040, y: 1490 }, { x: 2510, y: 1410 }, { x: 3040, y: 1295 }, { x: 3620, y: 1360 }, { x: 4210, y: 1530 },
];

export function createPoints() {
  return POINTS.map((p) => ({
    ...p,
    owner: p.start,
    control: p.start === ALLY ? 100 : p.start === ENEMY ? -100 : 0,
    contested: false,
    pulse: Math.random() * TAU,
  }));
}

export function createStructures() {
  return STRUCTURES.map((s) => ({ ...s, destroyed: false, cooldown: Math.random() * 2, flash: 0 }));
}

export function createResources() {
  return RESOURCE_SITES.map((r, i) => ({
    ...r,
    id: 'res' + i,
    max: r.amount,
    respawn: 0,
    radius: 30,
    phase: Math.random() * TAU,
  }));
}

function drawSmoothPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

function strokeSmooth(ctx, pts, width, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawSmoothPath(ctx, pts);
  ctx.stroke();
  ctx.restore();
}

function drawTree(ctx, rng, x, y, size, corrupted, dead) {
  const shadow = corrupted ? 'rgba(8,4,14,0.4)' : 'rgba(5,12,8,0.4)';
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(x + size * 0.24, y + size * 0.3, size * 0.82, size * 0.42, 0.2, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = corrupted ? '#241b2c' : '#33281c';
  ctx.lineWidth = Math.max(2, size * 0.16);
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.3);
  ctx.lineTo(x - size * 0.04, y - size * 0.15);
  ctx.stroke();

  if (dead) {
    ctx.strokeStyle = corrupted ? '#3d2d48' : '#3a3024';
    ctx.lineWidth = Math.max(1, size * 0.1);
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI * 0.9 + i * 0.38 + rng.range(-0.2, 0.2);
      ctx.beginPath();
      ctx.moveTo(x, y - size * 0.1);
      ctx.lineTo(x + Math.cos(a) * size * 0.75, y + Math.sin(a) * size * 0.75);
      ctx.stroke();
    }
    return;
  }

  const palettes = corrupted
    ? [['#21182c', '#33263f', '#49325a', '#664478'], ['#1c1828', '#2b2138', '#3d2d4e', '#593b68']]
    : rng.chance(0.18)
      ? [['#2c2a18', '#4a3d1f', '#6a5428', '#886a34'], ['#332817', '#54401f', '#74542a', '#936c35']]
      : [['#1d3324', '#2b4a30', '#3d6139', '#557b47'], ['#1b2e22', '#28452e', '#38603a', '#4b7043']];
  const pal = rng.pick(palettes);
  const r = size * 0.7;
  const blobs = [
    [0, -0.25, 0.78, pal[0]],
    [-0.42, -0.12, 0.62, pal[1]],
    [0.4, -0.16, 0.6, pal[1]],
    [-0.2, -0.52, 0.56, pal[2]],
    [0.24, -0.48, 0.52, pal[2]],
    [-0.08, -0.72, 0.36, pal[3]],
    [0.2, -0.65, 0.28, pal[3]],
  ];
  for (const [ox, oy, scale, color] of blobs) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + ox * r, y + oy * r, r * scale, 0, TAU);
    ctx.fill();
  }
  if (rng.chance(0.5)) {
    ctx.fillStyle = corrupted ? 'rgba(150,100,180,0.2)' : 'rgba(150,190,110,0.16)';
    ctx.beginPath();
    ctx.arc(x - r * 0.2, y - r * 0.55, r * 0.26, 0, TAU);
    ctx.fill();
  }
}

function drawRocks(ctx, rng, x, y, size) {
  const sides = rng.int(5, 7);
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * TAU;
    const rr = size * rng.range(0.65, 1.05);
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * 0.7 });
  }
  ctx.fillStyle = 'rgba(5,10,8,0.4)';
  ctx.beginPath();
  ctx.ellipse(x + size * 0.2, y + size * 0.45, size * 1.05, size * 0.48, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rng.chance(0.5) ? '#343833' : '#3d403a';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(160,170,155,0.18)';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < Math.min(pts.length, 4); i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

function drawRuins(ctx, rng, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rng.range(0, TAU));
  const blocks = rng.int(3, 6);
  for (let i = 0; i < blocks; i++) {
    const bx = rng.range(-scale, scale);
    const by = rng.range(-scale * 0.5, scale * 0.5);
    const w = rng.range(scale * 0.18, scale * 0.45);
    const h = rng.range(scale * 0.18, scale * 0.55);
    ctx.fillStyle = 'rgba(7,10,9,0.42)';
    ctx.fillRect(bx + 4, by + 6, w, h);
    ctx.fillStyle = rng.chance(0.5) ? '#454740' : '#3b3d37';
    ctx.fillRect(bx, by, w, h);
    ctx.fillStyle = 'rgba(170,175,160,0.12)';
    ctx.fillRect(bx, by, w, Math.max(1, h * 0.16));
  }
  ctx.restore();
}

function drawCrater(ctx, rng, x, y, size) {
  const g = ctx.createRadialGradient(x, y, size * 0.1, x, y, size);
  g.addColorStop(0, 'rgba(10,8,7,0.6)');
  g.addColorStop(0.7, 'rgba(28,24,20,0.42)');
  g.addColorStop(1, 'rgba(40,34,27,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, size, size * 0.72, rng.range(0, TAU), 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(112,96,70,0.18)';
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.beginPath();
  ctx.ellipse(x, y, size * 0.82, size * 0.58, 0, 0, TAU);
  ctx.stroke();
}

export function generateWorld(seed = 20261030) {
  const rng = new RNG(seed);
  const terrain = document.createElement('canvas');
  terrain.width = 2048;
  terrain.height = 1536;
  const ctx = terrain.getContext('2d');

  const low = document.createElement('canvas');
  low.width = 512;
  low.height = 384;
  const lctx = low.getContext('2d');
  const img = lctx.createImageData(512, 384);
  const data = img.data;

  const deep = [18, 29, 24];
  const forest = [34, 53, 39];
  const moss = [49, 74, 48];
  const dry = [76, 76, 49];
  const rock = [55, 56, 51];
  const dirt = [62, 49, 35];
  const corrupt = [58, 38, 67];
  const ember = [91, 51, 33];

  for (let y = 0; y < 384; y++) {
    for (let x = 0; x < 512; x++) {
      const wx = (x + 0.5) * 8;
      const wy = (y + 0.5) * 8;
      const h = fbm(wx * 0.00082, wy * 0.00082, 5, seed);
      const m = fbm(wx * 0.0022 + 71, wy * 0.0022 - 39, 3, seed + 9);
      const d = fbm(wx * 0.0061 - 13, wy * 0.0061 + 88, 2, seed + 21);
      let c = mixColor(deep, forest, smoothstep(0.3, 0.52, h));
      c = mixColor(c, moss, smoothstep(0.46, 0.68, h) * 0.85);
      c = mixColor(c, dry, smoothstep(0.55, 0.8, m) * 0.6);
      c = mixColor(c, rock, smoothstep(0.73, 0.9, h) * 0.62);
      c = mixColor(c, dirt, smoothstep(0.48, 0.56, d) * 0.28);

      let corr = 0;
      let emb = 0;
      for (const p of POINTS) {
        const dd = dist(wx, wy, p.x, p.y);
        const infl = Math.max(0, 1 - dd / (p.r * 2.5));
        if (p.start === ENEMY) corr += infl * infl;
        else if (p.start === ALLY) emb += infl * infl;
      }
      c = mixColor(c, corrupt, clamp(corr, 0, 1) * 0.58);
      c = mixColor(c, ember, clamp(emb, 0, 1) * 0.3);

      const grain = (noise2(wx * 0.11, wy * 0.11, seed + 4) - 0.5) * 16;
      const i = (y * 512 + x) * 4;
      data[i] = clamp(c[0] + grain, 0, 255);
      data[i + 1] = clamp(c[1] + grain, 0, 255);
      data[i + 2] = clamp(c[2] + grain, 0, 255);
      data[i + 3] = 255;
    }
  }
  lctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(low, 0, 0, 2048, 1536);
  ctx.setTransform(0.5, 0, 0, 0.5, 0, 0);

  for (const p of POINTS) {
    const isEnemy = p.start === ENEMY;
    const isAlly = p.start === ALLY;
    const g = ctx.createRadialGradient(p.x, p.y, 20, p.x, p.y, p.r * 2.6);
    if (isEnemy) {
      g.addColorStop(0, 'rgba(106,56,128,0.24)');
      g.addColorStop(0.5, 'rgba(62,38,86,0.14)');
    } else if (isAlly) {
      g.addColorStop(0, 'rgba(163,86,46,0.2)');
      g.addColorStop(0.5, 'rgba(97,62,34,0.1)');
    } else {
      g.addColorStop(0, 'rgba(150,140,110,0.1)');
      g.addColorStop(0.5, 'rgba(100,95,75,0.05)');
    }
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 2.6, 0, TAU);
    ctx.fill();
  }

  strokeSmooth(ctx, RIVER_PATH, 178, 'rgba(12,17,17,0.85)');
  strokeSmooth(ctx, RIVER_PATH, 150, '#172b31');
  strokeSmooth(ctx, RIVER_PATH, 124, '#1d3a44');
  strokeSmooth(ctx, RIVER_PATH, 82, '#285260');
  strokeSmooth(ctx, RIVER_PATH, 30, 'rgba(67,112,120,0.35)');
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = '#7fa6a6';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([40, 90]);
  drawSmoothPath(ctx, RIVER_PATH);
  ctx.stroke();
  ctx.restore();

  for (const path of ROAD_PATHS) {
    strokeSmooth(ctx, path, 68, 'rgba(26,23,17,0.5)');
    strokeSmooth(ctx, path, 50, '#554a34');
    strokeSmooth(ctx, path, 34, '#665a3e');
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#8b7954';
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 26]);
    drawSmoothPath(ctx, path);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(2040, 1490);
  ctx.fillStyle = 'rgba(6,8,7,0.5)';
  ctx.fillRect(-78, -160, 156, 320);
  ctx.fillStyle = '#4a3c28';
  ctx.fillRect(-68, -150, 136, 300);
  ctx.strokeStyle = '#2b2118';
  ctx.lineWidth = 3;
  for (let i = -145; i < 150; i += 18) {
    ctx.beginPath();
    ctx.moveTo(-68, i);
    ctx.lineTo(68, i);
    ctx.stroke();
  }
  ctx.strokeStyle = '#6d5838';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-70, -152);
  ctx.lineTo(-70, 152);
  ctx.moveTo(70, -152);
  ctx.lineTo(70, 152);
  ctx.stroke();
  ctx.fillStyle = '#5a4a30';
  for (let i = -120; i <= 120; i += 60) {
    ctx.fillRect(-84, i - 8, 18, 16);
    ctx.fillRect(66, i - 8, 18, 16);
  }
  ctx.restore();

  for (let i = 0; i < 34; i++) {
    const a = rng.range(0, TAU);
    const r = rng.range(60, 470);
    drawCrater(ctx, rng, 2040 + Math.cos(a) * r, 1490 + Math.sin(a) * r * 0.7, rng.range(18, 62));
  }

  const trees = [];
  for (let i = 0; i < 1900; i++) {
    const x = rng.range(40, WORLD.w - 40);
    const y = rng.range(40, WORLD.h - 40);
    const forestNoise = fbm(x * 0.0012 + 19, y * 0.0012 - 7, 3, seed + 33);
    if (forestNoise < 0.43 && rng.chance(0.72)) continue;
    if (polylineDistance(x, y, RIVER_PATH) < 115) continue;
    let roadDist = Infinity;
    for (const path of ROAD_PATHS) roadDist = Math.min(roadDist, polylineDistance(x, y, path));
    if (roadDist < 52) continue;
    let nearPoint = false;
    for (const p of POINTS) if (dist(x, y, p.x, p.y) < p.r * 0.75) nearPoint = true;
    if (nearPoint) continue;
    const corrupted = x > 2500 && y < 1650;
    const dead = corrupted && rng.chance(0.35);
    const size = rng.range(17, 34) * (corrupted ? 0.9 : 1);
    trees.push({ x, y, size });
    drawTree(ctx, rng, x, y, size, corrupted, dead);
  }

  for (let i = 0; i < 130; i++) {
    const x = rng.range(60, WORLD.w - 60);
    const y = rng.range(60, WORLD.h - 60);
    if (polylineDistance(x, y, RIVER_PATH) < 100) continue;
    drawRocks(ctx, rng, x, y, rng.range(8, 26));
  }

  for (let i = 0; i < 52; i++) {
    const p = rng.pick(POINTS);
    const a = rng.range(0, TAU);
    const r = rng.range(p.r * 0.9, p.r * 2.3);
    drawRuins(ctx, rng, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, rng.range(18, 42));
  }

  ctx.lineCap = 'round';
  for (let i = 0; i < 5200; i++) {
    const x = rng.range(0, WORLD.w);
    const y = rng.range(0, WORLD.h);
    if (polylineDistance(x, y, RIVER_PATH) < 85) continue;
    const h = fbm(x * 0.002, y * 0.002, 2, seed + 8);
    const len = rng.range(2, 7);
    ctx.strokeStyle = h > 0.52 ? 'rgba(91,112,63,0.35)' : 'rgba(63,83,48,0.32)';
    ctx.lineWidth = rng.range(0.7, 1.6);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + rng.range(-2, 2), y - len);
    ctx.stroke();
  }

  for (let i = 0; i < 680; i++) {
    const x = rng.range(0, WORLD.w);
    const y = rng.range(0, WORLD.h);
    if (polylineDistance(x, y, RIVER_PATH) < 90) continue;
    const colors = ['rgba(214,166,92,0.55)', 'rgba(197,214,201,0.45)', 'rgba(163,112,180,0.4)', 'rgba(217,108,69,0.45)'];
    ctx.fillStyle = rng.pick(colors);
    ctx.beginPath();
    ctx.arc(x, y, rng.range(0.8, 2.2), 0, TAU);
    ctx.fill();
  }

  for (let i = 0; i < 900; i++) {
    const x = 2040 + rng.range(-620, 620);
    const y = 1490 + rng.range(-470, 470);
    const a = rng.range(0, TAU);
    ctx.strokeStyle = rng.chance(0.5) ? 'rgba(47,40,30,0.5)' : 'rgba(80,70,52,0.38)';
    ctx.lineWidth = rng.range(1, 3);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * rng.range(4, 18), y + Math.sin(a) * rng.range(4, 18));
    ctx.stroke();
  }

  const minimap = document.createElement('canvas');
  minimap.width = 256;
  minimap.height = 192;
  const mctx = minimap.getContext('2d');
  mctx.imageSmoothingEnabled = true;
  mctx.drawImage(terrain, 0, 0, 256, 192);
  mctx.fillStyle = 'rgba(5,8,7,0.26)';
  mctx.fillRect(0, 0, 256, 192);

  return { terrain, minimap, trees };
}
