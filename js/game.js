import {
  clamp, lerp, dist, dist2, angleDiff, TAU, RNG, nearestPoint,
} from './util.js';
import {
  WORLD, ALLY, ENEMY, NEUTRAL, LANE, createPoints, createStructures, createResources,
} from './world.js';
import { INPUT } from './input.js';
import { Audio } from './audio.js';

const rng = new RNG(90817);

export const G = {
  mode: 'boot',
  paused: false,
  pausedForBoon: false,
  time: 0,
  worldData: null,
  points: [],
  structures: [],
  resources: [],
  units: [],
  squads: [],
  projectiles: [],
  particles: [],
  texts: [],
  effects: [],
  corpses: [],
  buildings: [],
  caravans: [],
  critters: [],
  player: null,
  camera: { x: 2040, y: 1490, zoom: 1, shake: 0, shakeX: 0, shakeY: 0 },
  war: { allySupply: 62, enemySupply: 72, momentum: 0, lowWarned: false },
  stats: {},
  events: [],
  toast: null,
  hint: null,
  quest: { stage: 0 },
  buildMode: null,
  context: null,
  harvest: null,
  boons: null,
  result: null,
  spawnTimer: { ally: 0, enemy: 0, caravan: 0, title: 0 },
  maxUnits: 220,
  id: 1,
  squadId: 1,
  grid: new Map(),
  gridTimer: 0,
  titleStats: { ally: 0, enemy: 0 },
  deathTimer: 0,
  quality: 'high',
  damageFlash: 0,
  chatterTimer: 9,
  titleTime: 0,
  squadTimer: 0,
};

const GRID = 150;

const UNIT_TYPES = {
  infantry: { hp: 78, speed: 64, radius: 9, range: 38, damage: 11, cd: 1.0, aggro: 250, ranged: false, weight: 1 },
  archer: { hp: 52, speed: 62, radius: 8, range: 255, damage: 10, cd: 1.55, aggro: 330, ranged: true, projectile: 'arrow', weight: 1 },
  mage: { hp: 46, speed: 56, radius: 8, range: 225, damage: 15, cd: 2.1, aggro: 315, ranged: true, projectile: 'orb', weight: 1 },
  knight: { hp: 165, speed: 47, radius: 12, range: 43, damage: 16, cd: 1.25, aggro: 220, ranged: false, weight: 1 },
  raider: { hp: 64, speed: 92, radius: 8, range: 34, damage: 10, cd: 0.82, aggro: 315, ranged: false, weight: 1 },
};

const SQUAD_NAMES = {
  [ALLY]: ['Iron Guard', 'Ember Vanguard', 'Ash Wardens', 'Cinder Company', 'Forgeborn', 'Dawnwatch', 'Riven Shield', 'Gilded Spear', 'Cinder Lancers', 'Hearth Company'],
  [ENEMY]: ['Hollow Choir', 'Bonewardens', 'Dusk Marchers', 'Pale Court', 'Gravebound', 'Mourn Guard', 'Sable Hand', 'Wraith Company', 'Tomb Lancers', 'Nightfall'],
};

const SQUAD_ROLES = {
  [ALLY]: ['infantry', 'infantry', 'infantry', 'infantry', 'archer', 'archer', 'mage', 'knight'],
  [ENEMY]: ['raider', 'raider', 'infantry', 'infantry', 'infantry', 'archer', 'mage', 'knight'],
};

export const BUILDS = {
  barricade: { name: 'Barricade', desc: 'A wall of iron-bound timber.', cost: { timber: 20 }, hp: 680, radius: 38, kind: 'barricade' },
  ballista: { name: 'Ballista', desc: 'Fires heavy bolts at the horde.', cost: { iron: 30, timber: 12 }, hp: 500, radius: 33, range: 340, damage: 30, cd: 1.25, kind: 'ballista' },
  ward: { name: 'Healing Ward', desc: 'Mends nearby allies and you.', cost: { essence: 25, timber: 10 }, hp: 360, radius: 30, range: 175, heal: 8, kind: 'ward' },
  rally: { name: 'Rally Banner', desc: 'Empowers nearby Iron Guard.', cost: { iron: 18, essence: 14 }, hp: 330, radius: 28, range: 225, kind: 'rally' },
};

export const QUESTS = [
  {
    id: 'vanguard', title: 'Break the vanguard', desc: 'Slay 12 Hollow soldiers at the ford.',
    progress: () => `${Math.min(G.stats.kills, 12)} / 12`,
    check: () => G.stats.kills >= 12, reward: 90,
  },
  {
    id: 'ford', title: 'Take the crossing', desc: 'Capture Ashen Ford with the Iron Guard.',
    progress: () => `${Math.round(Math.abs(getPoint('ashenford').control))}%`,
    check: () => getPoint('ashenford').owner === ALLY, reward: 140,
  },
  {
    id: 'fortify', title: 'Fortify the ford', desc: 'Raise a barricade near the crossing. Press Build.',
    progress: () => `${G.buildings.filter((b) => b.kind === 'barricade').length} / 1`,
    check: () => G.buildings.some((b) => b.kind === 'barricade' && !b.destroyed), reward: 120,
  },
  {
    id: 'supply', title: 'Feed the war', desc: 'Deposit 60 resources at an Iron Guard forge.',
    progress: () => `${Math.min(G.stats.deposited, 60)} / 60`,
    check: () => G.stats.deposited >= 60, reward: 150,
  },
  {
    id: 'push', title: 'March on Gloamwood', desc: 'Take the Gloamwood Spire from the Hollow Court.',
    progress: () => `${Math.round(Math.abs(getPoint('gloamwood').control))}%`,
    check: () => getPoint('gloamwood').owner === ALLY, reward: 240,
  },
  {
    id: 'break', title: 'Break the Mournspire', desc: 'Shatter the Hollow Court keep and end the war.',
    progress: () => {
      const keep = G.structures.find((s) => s.id === 'mournkeep');
      return keep ? `${Math.round((1 - keep.hp / keep.maxHp) * 100)}%` : '0%';
    },
    check: () => G.mode === 'ended' && G.result && G.result.win, reward: 0,
  },
];

const BOONS = [
  { id: 'edge', name: "Warden's Edge", desc: '+20% weapon damage.', apply: (p) => { p.damageMult += 0.2; } },
  { id: 'heart', name: 'Emberheart', desc: '+45 max health and heal fully.', apply: (p) => { p.maxHp += 45; p.hp = p.maxHp; } },
  { id: 'swift', name: 'Swiftstep', desc: '-25% dash cooldown.', apply: (p) => { p.dashCdMult *= 0.75; } },
  { id: 'reaper', name: 'Ashen Reaper', desc: 'Kills restore 10 health.', apply: (p) => { p.lifesteal += 10; } },
  { id: 'artificer', name: 'Artificer', desc: '-20% construction cost.', apply: (p) => { p.buildCostMult *= 0.8; } },
  { id: 'storm', name: 'Stormcaller', desc: '-22% Emberstorm cooldown.', apply: (p) => { p.abilityCdMult *= 0.78; } },
  { id: 'harvester', name: 'Harvester', desc: '+3 resources per harvest.', apply: (p) => { p.harvestBonus += 3; } },
  { id: 'warden', name: 'Ironhide', desc: '+12% damage reduction.', apply: (p) => { p.armor = Math.min(0.55, p.armor + 0.12); } },
];

function freshStats() {
  return {
    kills: 0, deaths: 0, captures: 0, gathered: 0, deposited: 0, built: 0,
    damageDealt: 0, allyKills: 0, enemyKills: 0,
  };
}

function makePlayer() {
  return {
    x: 2040, y: 1778, vx: 0, vy: 0, facing: -Math.PI / 2, aimAngle: -Math.PI / 2,
    radius: 16, speed: 196, hp: 240, maxHp: 240, dead: false, deathTimer: 0,
    level: 1, xp: 0, xpNext: 90,
    resources: { iron: 8, timber: 12, essence: 4 },
    attackCd: 0, meleeCd: 0, abilityCd: 0, dashCd: 0, dashTime: 0, dashVx: 0, dashVy: 0,
    invuln: 0, lastDamage: -99, damageMult: 1, abilityCdMult: 1, dashCdMult: 1,
    buildCostMult: 1, harvestBonus: 0, armor: 0, lifesteal: 0,
    moving: false, anim: 0, hitFlash: 0, attackAnim: 0,
  };
}

export function initGame(worldData) {
  G.worldData = worldData;
  G.maxUnits = window.matchMedia('(pointer: coarse)').matches ? 185 : 235;
  startAttract();
}

function clearDynamic() {
  G.points = createPoints();
  G.structures = createStructures();
  G.resources = createResources();
  G.units = [];
  G.squads = [];
  G.projectiles = [];
  G.particles = [];
  G.texts = [];
  G.effects = [];
  G.corpses = [];
  G.buildings = [];
  G.caravans = [];
  G.critters = [];
  G.events = [];
  G.toast = null;
  G.hint = null;
  G.quest = { stage: 0 };
  G.buildMode = null;
  G.context = null;
  G.harvest = null;
  G.boons = null;
  G.result = null;
  G.paused = false;
  G.pausedForBoon = false;
  G.deathTimer = 0;
  G.damageFlash = 0;
  G.time = 0;
  G.war = { allySupply: 62, enemySupply: 72, momentum: 0, lowWarned: false };
  G.stats = freshStats();
  G.spawnTimer = { ally: 4, enemy: 4, caravan: 18, title: 0 };
  G.chatterTimer = 9;
  G.squadTimer = 0;
  G.id = 1;
  G.squadId = 1;
  G.grid = new Map();
  G.gridTimer = 0;
  G.player = null;
  G.titleTime = 0;
  spawnCritters();
}

function startAttract() {
  clearDynamic();
  G.mode = 'title';
  for (let i = 0; i < 10; i++) {
    spawnSquad(ALLY, 'ashenford', 2040 + rng.range(-440, 440), 1620 + rng.range(-120, 200));
    spawnSquad(ENEMY, 'ashenford', 2040 + rng.range(-440, 440), 1360 + rng.range(-200, 120));
  }
  for (let i = 0; i < 4; i++) {
    spawnSquad(ALLY, 'ashenford', 1450 + rng.range(-80, 80), 1970 + rng.range(-70, 70));
    spawnSquad(ENEMY, 'ashenford', 2780 + rng.range(-80, 80), 1100 + rng.range(-70, 70));
  }
  G.camera.x = 2040;
  G.camera.y = 1490;
  G.camera.zoom = 0.98;
}

export function startNewGame() {
  clearDynamic();
  G.mode = 'playing';
  G.player = makePlayer();
  G.camera.x = G.player.x;
  G.camera.y = G.player.y - 40;
  G.camera.zoom = 1;
  for (let i = 0; i < 12; i++) {
    spawnSquad(ALLY, 'ashenford', 2040 + rng.range(-430, 430), 1600 + rng.range(-80, 230));
    spawnSquad(ENEMY, 'ashenford', 2040 + rng.range(-430, 430), 1380 + rng.range(-230, 80));
  }
  for (let i = 0; i < 5; i++) {
    spawnSquad(ALLY, 'ashenford', 1340 + rng.range(-80, 80), 1990 + rng.range(-80, 80));
    spawnSquad(ENEMY, 'ashenford', 2820 + rng.range(-80, 80), 1080 + rng.range(-80, 80));
  }
  addEvent('The Hollow Court storms Ashen Ford.', ENEMY, 'war');
  addEvent('Iron Captain: Hold the crossing. For the Ember Throne!', ALLY, 'speech');
  addEvent('Warden, you are needed at the front.', NEUTRAL, 'info');
  G.hint = {
    text: 'Left side to move · Right side to aim & cast · Hold Interact to harvest',
    time: 9,
  };
  Audio.ensure();
  Audio.sfx('capture', 0.6);
}

export function getPoint(id) {
  return G.points.find((p) => p.id === id);
}

export function aliveCount(faction) {
  let n = 0;
  for (const u of G.units) if (!u.dead && u.faction === faction) n++;
  return n;
}

export function supplyMult(faction) {
  const s = faction === ALLY ? G.war.allySupply : G.war.enemySupply;
  return 0.72 + clamp(s, 0, 100) * 0.0048;
}

function cellKey(x, y) {
  return `${Math.floor(x / GRID)},${Math.floor(y / GRID)}`;
}

function rebuildGrid() {
  G.grid = new Map();
  for (const u of G.units) {
    if (u.dead) continue;
    const key = cellKey(u.x, u.y);
    let arr = G.grid.get(key);
    if (!arr) {
      arr = [];
      G.grid.set(key, arr);
    }
    arr.push(u);
  }
  G.gridTimer = 0.12;
}

function forEachNear(x, y, radius, cb) {
  const minX = Math.floor((x - radius) / GRID);
  const maxX = Math.floor((x + radius) / GRID);
  const minY = Math.floor((y - radius) / GRID);
  const maxY = Math.floor((y + radius) / GRID);
  for (let gx = minX; gx <= maxX; gx++) {
    for (let gy = minY; gy <= maxY; gy++) {
      const arr = G.grid.get(`${gx},${gy}`);
      if (!arr) continue;
      for (const u of arr) cb(u);
    }
  }
}

function spawnSquad(faction, targetId, x, y) {
  const names = SQUAD_NAMES[faction];
  const name = names[(G.squadId - 1) % names.length];
  const numeral = Math.floor((G.squadId - 1) / names.length) + 1;
  const squad = {
    id: G.squadId++,
    faction,
    name: numeral > 1 ? `${name} ${numeral}` : name,
    targetId,
    units: [],
    elite: rng.chance(0.2),
  };
  const roles = SQUAD_ROLES[faction];
  for (let i = 0; i < roles.length; i++) {
    const cls = roles[i];
    const type = UNIT_TYPES[cls];
    const angle = (i / roles.length) * TAU + rng.range(-0.25, 0.25);
    const spread = 10 + (i % 3) * 13;
    const unit = {
      id: G.id++, faction, cls, type,
      x: x + Math.cos(angle) * spread,
      y: y + Math.sin(angle) * spread,
      vx: 0, vy: 0,
      hp: type.hp, maxHp: type.hp,
      speed: type.speed * rng.range(0.94, 1.06),
      radius: type.radius,
      facing: rng.range(0, TAU),
      attackCd: rng.range(0, 0.8),
      thinkTimer: rng.range(0, 0.35),
      target: null,
      structureTarget: null,
      squadId: squad.id,
      targetId,
      slotAngle: angle,
      slotRadius: 16 + (i % 3) * 17,
      dead: false,
      hitFlash: 0,
      burn: 0,
      burnDps: 0,
      anim: rng.range(0, 10),
      moving: false,
      elite: i === 0 && squad.elite,
      lastHitByPlayer: 0,
    };
    if (unit.elite) {
      unit.hp *= 1.45;
      unit.maxHp = unit.hp;
      unit.radius += 1.2;
      unit.speed *= 0.96;
    }
    squad.units.push(unit);
    G.units.push(unit);
  }
  G.squads.push(squad);
  return squad;
}

function spawnCritters() {
  for (let i = 0; i < 30; i++) {
    const crow = rng.chance(0.35);
    G.critters.push({
      x: rng.range(200, WORLD.w - 200),
      y: rng.range(200, WORLD.h - 200),
      vx: 0, vy: 0,
      type: crow ? 'crow' : 'deer',
      phase: rng.range(0, TAU),
      timer: rng.range(0, 4),
      speed: crow ? rng.range(48, 80) : rng.range(20, 34),
      dir: rng.range(0, TAU),
    });
  }
}

function chooseTarget(faction) {
  if (faction === ALLY) {
    if (rng.chance(0.22)) {
      const sides = G.points.filter((p) => p.owner !== ALLY && (p.kind === 'watch' || p.kind === 'shrine'));
      if (sides.length) return rng.pick(sides).id;
    }
    for (const id of LANE) {
      const p = getPoint(id);
      if (p.owner !== ALLY) return id;
    }
    return 'mournspire';
  }
  if (rng.chance(0.22)) {
    const sides = G.points.filter((p) => p.owner !== ENEMY && (p.kind === 'watch' || p.kind === 'shrine'));
    if (sides.length) return rng.pick(sides).id;
  }
  for (let i = LANE.length - 1; i >= 0; i--) {
    const p = getPoint(LANE[i]);
    if (p.owner !== ENEMY) return p.id;
  }
  return 'emberhold';
}

function chooseSpawnPoint(faction, targetId) {
  const target = getPoint(targetId);
  let best = null;
  let bd = Infinity;
  for (const p of G.points) {
    if (p.owner !== faction) continue;
    if (p.kind === 'keep' || p.kind === 'town' || p.kind === 'ford') {
      const d = dist2(p.x, p.y, target.x, target.y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
  }
  if (!best) best = getPoint(faction === ALLY ? 'emberhold' : 'mournspire');
  return best;
}

function spawnReinforcement(faction) {
  if (aliveCount(faction) >= G.maxUnits) return;
  const targetId = chooseTarget(faction);
  const spawn = chooseSpawnPoint(faction, targetId);
  const count = aliveCount(faction) < G.maxUnits * 0.55 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, TAU);
    const r = rng.range(40, 130);
    spawnSquad(faction, targetId, spawn.x + Math.cos(a) * r, spawn.y + Math.sin(a) * r);
  }
}

function updateSpawning(dt) {
  if (G.mode === 'title') {
    G.spawnTimer.title -= dt;
    if (G.spawnTimer.title <= 0) {
      G.spawnTimer.title = 2.4;
      if (aliveCount(ALLY) < 78) spawnSquad(ALLY, 'ashenford', 2040 + rng.range(-440, 440), 1650 + rng.range(-100, 180));
      if (aliveCount(ENEMY) < 78) spawnSquad(ENEMY, 'ashenford', 2040 + rng.range(-440, 440), 1330 + rng.range(-180, 100));
    }
    return;
  }
  if (G.mode !== 'playing') return;
  G.spawnTimer.ally -= dt;
  G.spawnTimer.enemy -= dt;
  if (G.spawnTimer.ally <= 0) {
    spawnReinforcement(ALLY);
    G.spawnTimer.ally = 3.4;
  }
  if (G.spawnTimer.enemy <= 0) {
    spawnReinforcement(ENEMY);
    G.spawnTimer.enemy = 3.2;
  }
  G.spawnTimer.caravan -= dt;
  if (G.spawnTimer.caravan <= 0) {
    G.spawnTimer.caravan = 26;
    if (G.war.allySupply < 94) spawnCaravan();
  }
}

function updateSquadTargets() {
  for (const squad of G.squads) {
    const p = getPoint(squad.targetId);
    if (!p || p.owner === squad.faction || rng.chance(0.12)) {
      squad.targetId = chooseTarget(squad.faction);
      for (const u of squad.units) {
        if (!u.dead) u.targetId = squad.targetId;
      }
    }
  }
}

function findUnitTarget(u) {
  let best = null;
  let bd = u.type.aggro * u.type.aggro;
  forEachNear(u.x, u.y, u.type.aggro, (o) => {
    if (o.dead || o.faction === u.faction) return;
    const d = dist2(u.x, u.y, o.x, o.y);
    if (d < bd) {
      bd = d;
      best = o;
    }
  });
  return best;
}

function findStructureTarget(u) {
  let best = null;
  let bd = (u.type.aggro + 90) ** 2;
  for (const s of G.structures) {
    if (s.destroyed || s.maxHp <= 0 || s.faction === NEUTRAL || s.faction === u.faction) continue;
    const d = dist2(u.x, u.y, s.x, s.y);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  for (const b of G.buildings) {
    if (b.destroyed || b.faction === u.faction) continue;
    const d = dist2(u.x, u.y, b.x, b.y);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

function unitThink(u) {
  u.thinkTimer = 0.28 + Math.random() * 0.24;
  const target = findUnitTarget(u);
  u.target = target;
  u.playerTarget = false;
  if (target) {
    u.structureTarget = null;
    return;
  }
  if (u.faction === ENEMY && G.player && !G.player.dead) {
    const d = dist(u.x, u.y, G.player.x, G.player.y);
    if (d < u.type.aggro * 0.95) {
      u.playerTarget = true;
      u.structureTarget = null;
      return;
    }
  }
  u.structureTarget = findStructureTarget(u);
}

function pushOutOfSolids(u) {
  for (const s of G.structures) {
    if (s.destroyed || s.maxHp <= 0) continue;
    const dx = u.x - s.x;
    const dy = u.y - s.y;
    const min = s.radius + u.radius;
    const d = Math.hypot(dx, dy);
    if (d < min && d > 0.001) {
      u.x = s.x + (dx / d) * min;
      u.y = s.y + (dy / d) * min;
    }
  }
  for (const b of G.buildings) {
    if (b.destroyed) continue;
    const dx = u.x - b.x;
    const dy = u.y - b.y;
    const min = b.radius + u.radius;
    const d = Math.hypot(dx, dy);
    if (d < min && d > 0.001) {
      u.x = b.x + (dx / d) * min;
      u.y = b.y + (dy / d) * min;
    }
  }
}

function moveUnit(u, tx, ty, dt) {
  const dx = tx - u.x;
  const dy = ty - u.y;
  const d = Math.hypot(dx, dy);
  let dvx = 0;
  let dvy = 0;
  if (d > 7) {
    dvx = (dx / d) * u.speed;
    dvy = (dy / d) * u.speed;
  }
  let sx = 0;
  let sy = 0;
  forEachNear(u.x, u.y, 34, (o) => {
    if (o === u || o.dead || o.faction !== u.faction) return;
    const ox = u.x - o.x;
    const oy = u.y - o.y;
    const od = Math.hypot(ox, oy);
    if (od < 27 && od > 0.01) {
      const f = (27 - od) / 27;
      sx += (ox / od) * f;
      sy += (oy / od) * f;
    }
  });
  dvx += sx * 85;
  dvy += sy * 85;
  const smooth = 1 - Math.exp(-dt * 7);
  u.vx = lerp(u.vx, dvx, smooth);
  u.vy = lerp(u.vy, dvy, smooth);
  u.x += u.vx * dt;
  u.y += u.vy * dt;
  u.moving = Math.hypot(u.vx, u.vy) > 8;
  if (u.moving) u.facing = Math.atan2(u.vy, u.vx);
  u.x = clamp(u.x, 20, WORLD.w - 20);
  u.y = clamp(u.y, 20, WORLD.h - 20);
  pushOutOfSolids(u);
}

function unitAttack(u, target) {
  const dx = target.x - u.x;
  const dy = target.y - u.y;
  const d = Math.hypot(dx, dy);
  u.facing = Math.atan2(dy, dx);
  if (u.type.ranged) {
    if (u.attackCd <= 0 && d <= u.type.range + (target.radius || 20)) {
      u.attackCd = u.type.cd * rng.range(0.9, 1.12);
      spawnProjectile({
        x: u.x + Math.cos(u.facing) * 12,
        y: u.y + Math.sin(u.facing) * 12,
        target,
        damage: u.type.damage,
        faction: u.faction,
        type: u.type.projectile,
        speed: u.type.projectile === 'arrow' ? 560 : 380,
      });
      if (nearPlayer(u.x, u.y, 520)) Audio.sfx(u.type.projectile === 'arrow' ? 'arrow' : 'bolt', 0.45);
    }
  } else if (u.attackCd <= 0 && d <= u.type.range + (target.radius || 10)) {
    u.attackCd = u.type.cd * rng.range(0.9, 1.15);
    const amount = u.type.damage * (u.elite ? 1.18 : 1);
    damageUnit(target, amount, { faction: u.faction, x: u.x, y: u.y });
    spawnSlash(u.x + Math.cos(u.facing) * 18, u.y + Math.sin(u.facing) * 18, u.facing, u.faction, 22);
    if (nearPlayer(u.x, u.y, 300)) Audio.sfx('sword', 0.32);
  }
}

function unitAttackStructure(u, s) {
  const dx = s.x - u.x;
  const dy = s.y - u.y;
  const d = Math.hypot(dx, dy);
  u.facing = Math.atan2(dy, dx);
  const reach = (s.radius || 20) + (u.type.ranged ? u.type.range : 16);
  if (u.attackCd <= 0 && d <= reach) {
    u.attackCd = (u.type.ranged ? u.type.cd : 1.05) * rng.range(0.9, 1.1);
    const amount = u.type.damage * (u.type.ranged ? 1.4 : 2.2);
    damageStructure(s, amount, u.faction, false);
    if (!u.type.ranged) spawnSlash(u.x + Math.cos(u.facing) * 16, u.y + Math.sin(u.facing) * 16, u.facing, u.faction, 20);
    if (nearPlayer(u.x, u.y, 350)) Audio.sfx('hit', 0.28);
  }
}

function updateUnits(dt) {
  if (G.gridTimer <= 0) rebuildGrid();
  else G.gridTimer -= dt;

  for (const u of G.units) {
    if (u.dead) continue;
    u.attackCd -= dt;
    u.hitFlash = Math.max(0, u.hitFlash - dt);
    u.anim += dt * (u.moving ? 7 : 2.5);
    u.lastHitByPlayer = Math.max(0, u.lastHitByPlayer - dt);
    if (u.burn > 0) {
      u.burn -= dt;
      damageUnit(u, u.burnDps * dt, { faction: ALLY, burn: true });
      if (u.dead) continue;
    }
    u.thinkTimer -= dt;
    if (u.thinkTimer <= 0) unitThink(u);

    let target = u.target;
    if (target && target.dead) target = null;
    if (target) {
      const d = dist(u.x, u.y, target.x, target.y);
      if (d <= u.type.range + target.radius + 4) {
        unitAttack(u, target);
        u.moving = false;
        u.vx *= 0.86;
        u.vy *= 0.86;
      } else {
        moveUnit(u, target.x, target.y, dt);
      }
      continue;
    }
    if (u.playerTarget && G.player && !G.player.dead) {
      const pp = G.player;
      const d = dist(u.x, u.y, pp.x, pp.y);
      u.facing = Math.atan2(pp.y - u.y, pp.x - u.x);
      if (u.type.ranged) {
        if (u.attackCd <= 0 && d <= u.type.range + 22) {
          u.attackCd = u.type.cd * rng.range(0.9, 1.12);
          spawnProjectile({
            x: u.x + Math.cos(u.facing) * 12,
            y: u.y + Math.sin(u.facing) * 12,
            dir: u.facing,
            damage: u.type.damage,
            faction: u.faction,
            type: u.type.projectile,
            speed: u.type.projectile === 'arrow' ? 560 : 380,
          });
          if (nearPlayer(u.x, u.y, 520)) Audio.sfx(u.type.projectile === 'arrow' ? 'arrow' : 'bolt', 0.45);
        }
      } else if (u.attackCd <= 0 && d <= u.type.range + pp.radius + 4) {
        u.attackCd = u.type.cd * rng.range(0.9, 1.15);
        damagePlayer(u.type.damage * (u.elite ? 1.18 : 1) * supplyMult(ENEMY));
        spawnSlash(u.x + Math.cos(u.facing) * 18, u.y + Math.sin(u.facing) * 18, u.facing, u.faction, 22);
        Audio.sfx('sword', 0.4);
      }
      if (d > (u.type.ranged ? u.type.range : u.type.range + pp.radius)) {
        moveUnit(u, pp.x, pp.y, dt);
      } else {
        u.moving = false;
        u.vx *= 0.86;
        u.vy *= 0.86;
      }
      continue;
    }
    const struct = u.structureTarget;
    if (struct && !struct.destroyed && struct.hp > 0) {
      const d = dist(u.x, u.y, struct.x, struct.y);
      const reach = (struct.radius || 20) + (u.type.ranged ? u.type.range : 14);
      if (d <= reach) {
        unitAttackStructure(u, struct);
        u.moving = false;
        u.vx *= 0.86;
        u.vy *= 0.86;
      } else {
        moveUnit(u, struct.x, struct.y, dt);
      }
      continue;
    }

    const p = getPoint(u.targetId);
    if (!p) continue;
    const tx = p.x + Math.cos(u.slotAngle) * u.slotRadius;
    const ty = p.y + Math.sin(u.slotAngle) * u.slotRadius * 0.82;
    const d = dist(u.x, u.y, tx, ty);
    if (d > 22) {
      moveUnit(u, tx, ty, dt);
    } else {
      u.vx = lerp(u.vx, 0, 1 - Math.exp(-dt * 5));
      u.vy = lerp(u.vy, 0, 1 - Math.exp(-dt * 5));
      u.moving = false;
      u.x += u.vx * dt;
      u.y += u.vy * dt;
    }
  }
}

function spawnProjectile({ x, y, target = null, dir = null, damage, faction, type = 'bolt', speed = 500, player = false, structure = null }) {
  let vx = 0;
  let vy = 0;
  if (target) {
    const a = Math.atan2(target.y - y, target.x - x);
    vx = Math.cos(a) * speed;
    vy = Math.sin(a) * speed;
  } else if (dir !== null) {
    vx = Math.cos(dir) * speed;
    vy = Math.sin(dir) * speed;
  }
  G.projectiles.push({
    x, y, vx, vy, target, structure, damage, faction, type, speed, player,
    life: 2.2, trail: 0,
  });
}

function damageUnit(u, amount, opts = {}) {
  if (!u || u.dead || amount <= 0) return;
  let dmg = amount;
  if (u.cls === 'knight') dmg *= 0.82;
  if (opts.faction === ALLY) {
    dmg *= supplyMult(ALLY);
    for (const b of G.buildings) {
      if (b.kind === 'rally' && !b.destroyed && dist(b.x, b.y, u.x, u.y) < b.range) {
        dmg *= 1.16;
        break;
      }
    }
  } else if (opts.faction === ENEMY) {
    dmg *= supplyMult(ENEMY);
  }
  if (opts.player) dmg *= G.player ? G.player.damageMult : 1;
  u.hp -= dmg;
  u.hitFlash = 0.16;
  if (opts.player) {
    u.lastHitByPlayer = 4;
    G.stats.damageDealt += dmg;
  }
  if (nearPlayer(u.x, u.y, 600)) {
    spawnHit(u.x, u.y, opts.faction === ALLY ? '#ffd27a' : '#9fe6d3', opts.player ? 7 : 4);
    if (opts.player && rng.chance(0.55)) {
      spawnText(u.x, u.y - 16, String(Math.round(dmg)), '#ffd27a', 15);
    }
  }
  if (u.hp <= 0) dieUnit(u, opts);
}

function dieUnit(u, opts = {}) {
  if (u.dead) return;
  u.dead = true;
  G.corpses.push({ x: u.x, y: u.y, faction: u.faction, cls: u.cls, angle: u.facing, ttl: 24, maxTtl: 24 });
  if (G.corpses.length > 220) G.corpses.shift();
  const col = u.faction === ALLY ? '#b4523b' : '#6e4a86';
  for (let i = 0; i < 7; i++) {
    spawnParticle(u.x, u.y, rng.range(-1, 1) * 60, rng.range(-1, 1) * 60, rng.range(0.3, 0.7), rng.range(1, 3), col, 40);
  }
  if (u.faction === ENEMY && opts.player) {
    G.stats.kills++;
    addXP(12);
    if (G.player && G.player.lifesteal > 0) {
      G.player.hp = Math.min(G.player.maxHp, G.player.hp + G.player.lifesteal);
    }
  } else if (u.faction === ENEMY) {
    G.stats.allyKills++;
  } else {
    G.stats.enemyKills++;
  }
  if (G.mode === 'playing') {
    if (u.faction === ALLY) G.war.allySupply = clamp(G.war.allySupply - 0.09, 0, 100);
    else G.war.enemySupply = clamp(G.war.enemySupply - 0.07, 0, 100);
  }
  if (nearPlayer(u.x, u.y, 480)) {
    Audio.sfx('death', 0.35);
    if (u.faction === ENEMY) {
      G.effects.push({ type: 'soul', x: u.x, y: u.y, life: 1.2, maxLife: 1.2, color: '#a98bd6' });
    }
  }
}

function damageStructure(s, amount, faction, player = false) {
  if (!s || s.destroyed || s.maxHp <= 0) return;
  const mult = player ? 1 : 0.34;
  s.hp -= amount * mult;
  s.flash = 0.18;
  if (nearPlayer(s.x, s.y, 520)) {
    spawnHit(s.x + rng.range(-s.radius * 0.4, s.radius * 0.4), s.y + rng.range(-10, 20), '#ffb36b', 4);
    if (player) spawnText(s.x, s.y - 30, String(Math.round(amount * mult)), '#ffd27a', 14);
  }
  if (s.hp <= 0) {
    s.hp = 0;
    s.destroyed = true;
    if (s.id === 'mournkeep') {
      endGame(true);
    } else if (s.id === 'emberkeep') {
      endGame(false);
    } else if (s.id === 'gloamtower') {
      addEvent('The Gloamwood Spire has fallen!', ALLY, 'war');
      addXP(80);
    } else if (s.kind === 'forge') {
      addEvent(`${s.name} has been razed.`, ENEMY, 'war');
    }
    if (s.kind !== 'keep') {
      for (let i = 0; i < 24; i++) {
        spawnParticle(s.x, s.y, rng.range(-1, 1) * 130, rng.range(-1, 1) * 130, rng.range(0.5, 1.2), rng.range(2, 5), '#8a6a45', 80);
      }
    }
  }
}

function updateProjectiles(dt) {
  for (const p of G.projectiles) {
    p.life -= dt;
    if (p.life <= 0) continue;
    const target = p.target;
    if (target && !target.dead && target.hp > 0) {
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.1) {
        const wantX = (dx / d) * p.speed;
        const wantY = (dy / d) * p.speed;
        const turn = Math.min(1, dt * (p.type === 'orb' ? 7 : 3.2));
        p.vx = lerp(p.vx, wantX, turn);
        p.vy = lerp(p.vy, wantY, turn);
      }
      if (d < (target.radius || 8) + 7) {
        damageUnit(target, p.damage, { faction: p.faction, player: p.player });
        p.life = 0;
        spawnHit(target.x, target.y, p.player ? '#ffd27a' : p.faction === ALLY ? '#f7c66a' : '#8fe3d1', 5);
        continue;
      }
    } else if (p.structure && !p.structure.destroyed) {
      const d = dist(p.x, p.y, p.structure.x, p.structure.y);
      if (d < p.structure.radius + 8) {
        damageStructure(p.structure, p.damage, p.faction, p.player);
        p.life = 0;
        continue;
      }
    } else if (target && target.dead) {
      p.target = null;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.trail -= dt;
    if (p.trail <= 0) {
      p.trail = 0.03;
      if (p.type === 'orb' || p.type === 'bolt') {
        spawnParticle(p.x, p.y, rng.range(-8, 8), rng.range(-8, 8), 0.25, p.type === 'orb' ? 2.4 : 1.7, p.faction === ALLY ? '#ffb15e' : '#8de0d0', 0);
      }
    }

    if (!p.target) {
      let hit = null;
      forEachNear(p.x, p.y, 26, (u) => {
        if (hit || u.dead || u.faction === p.faction) return;
        if (dist(p.x, p.y, u.x, u.y) < u.radius + 7) hit = u;
      });
      if (hit) {
        damageUnit(hit, p.damage, { faction: p.faction, player: p.player });
        spawnHit(hit.x, hit.y, p.player ? '#ffd27a' : '#f4d08a', 5);
        p.life = 0;
        continue;
      }
      if (p.faction === ENEMY && G.player && !G.player.dead && G.player.invuln <= 0) {
        if (dist(p.x, p.y, G.player.x, G.player.y) < G.player.radius + 7) {
          damagePlayer(p.damage);
          p.life = 0;
          continue;
        }
      }
      if (p.faction === ALLY) {
        for (const s of G.structures) {
          if (s.faction !== ENEMY || s.destroyed || s.maxHp <= 0) continue;
          if (dist(p.x, p.y, s.x, s.y) < s.radius) {
            damageStructure(s, p.damage, p.faction, p.player);
            p.life = 0;
            break;
          }
        }
      }
    }
    if (p.x < 0 || p.y < 0 || p.x > WORLD.w || p.y > WORLD.h) p.life = 0;
  }
  G.projectiles = G.projectiles.filter((p) => p.life > 0);
}

function findPlayerTarget(range, requireAim = false) {
  const p = G.player;
  if (!p) return null;
  let best = null;
  let bestScore = Infinity;
  forEachNear(p.x, p.y, range, (u) => {
    if (u.dead || u.faction !== ENEMY) return;
    const dx = u.x - p.x;
    const dy = u.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > range) return;
    let dot = 1;
    if (d > 0.1) dot = (dx / d) * INPUT.aim.x + (dy / d) * INPUT.aim.y;
    if (requireAim && dot < 0.12) return;
    const score = d - dot * 95;
    if (score < bestScore) {
      bestScore = score;
      best = u;
    }
  });
  return best;
}

function findPlayerStructureTarget(range) {
  const p = G.player;
  if (!p) return null;
  let best = null;
  let bd = range * range;
  for (const s of G.structures) {
    if (s.faction !== ENEMY || s.destroyed || s.maxHp <= 0) continue;
    const d = dist2(p.x, p.y, s.x, s.y);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

function playerAttack(dt) {
  const p = G.player;
  p.attackCd -= dt;
  p.meleeCd -= dt;
  const aimed = findPlayerTarget(370, INPUT.aimActive);
  const target = aimed || findPlayerTarget(370, false);
  if (target) {
    const d = dist(p.x, p.y, target.x, target.y);
    if (d < 105 && p.meleeCd <= 0) {
      p.meleeCd = 0.5;
      p.attackAnim = 0.2;
      const ang = Math.atan2(target.y - p.y, target.x - p.x);
      p.facing = ang;
      let hits = 0;
      forEachNear(p.x, p.y, 112, (u) => {
        if (hits >= 3 || u.dead || u.faction !== ENEMY) return;
        const dd = dist(p.x, p.y, u.x, u.y);
        if (dd < 112 && Math.abs(angleDiff(ang, Math.atan2(u.y - p.y, u.x - p.x))) < 0.8) {
          damageUnit(u, 44, { faction: ALLY, player: true, x: p.x, y: p.y });
          hits++;
        }
      });
      spawnSlash(p.x + Math.cos(ang) * 28, p.y + Math.sin(ang) * 28, ang, ALLY, 48, true);
      Audio.sfx('sword', 0.65);
      return;
    }
    if (p.attackCd <= 0 && d < 365) {
      p.attackCd = 0.38;
      p.attackAnim = 0.16;
      p.facing = Math.atan2(target.y - p.y, target.x - p.x);
      spawnProjectile({
        x: p.x + Math.cos(p.facing) * 16,
        y: p.y + Math.sin(p.facing) * 16,
        target,
        damage: 27 + p.level * 2.2,
        faction: ALLY,
        type: 'bolt',
        speed: 680,
        player: true,
      });
      Audio.sfx('bolt', 0.55);
      return;
    }
  }

  const struct = findPlayerStructureTarget(300);
  if (struct && p.attackCd <= 0) {
    p.attackCd = 0.42;
    p.attackAnim = 0.16;
    p.facing = Math.atan2(struct.y - p.y, struct.x - p.x);
    spawnProjectile({
      x: p.x + Math.cos(p.facing) * 16,
      y: p.y + Math.sin(p.facing) * 16,
      structure: struct,
      damage: 30 + p.level * 2.4,
      faction: ALLY,
      type: 'bolt',
      speed: 680,
      player: true,
    });
    Audio.sfx('bolt', 0.5);
    return;
  }

  if ((INPUT.firing || INPUT.aimActive) && p.attackCd <= 0) {
    p.attackCd = 0.42;
    p.attackAnim = 0.14;
    spawnProjectile({
      x: p.x + Math.cos(p.facing) * 16,
      y: p.y + Math.sin(p.facing) * 16,
      dir: p.facing,
      damage: 24 + p.level * 2,
      faction: ALLY,
      type: 'bolt',
      speed: 660,
      player: true,
    });
    Audio.sfx('bolt', 0.45);
  }
}

function updatePlayer(dt) {
  const p = G.player;
  if (!p) return;
  p.invuln = Math.max(0, p.invuln - dt);
  p.hitFlash = Math.max(0, p.hitFlash - dt);
  p.attackAnim = Math.max(0, p.attackAnim - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.abilityCd = Math.max(0, p.abilityCd - dt);

  if (p.dead) {
    p.deathTimer -= dt;
    G.deathTimer = p.deathTimer;
    if (p.deathTimer <= 0) respawnPlayer();
    return;
  }

  if (p.dashTime > 0) {
    p.dashTime -= dt;
    p.x += p.dashVx * dt;
    p.y += p.dashVy * dt;
    p.moving = true;
    p.anim += dt * 12;
  } else {
    const mx = INPUT.move.x;
    const my = INPUT.move.y;
    const len = Math.hypot(mx, my);
    const targetVx = len > 0 ? (mx / Math.max(1, len)) * p.speed : 0;
    const targetVy = len > 0 ? (my / Math.max(1, len)) * p.speed : 0;
    const smooth = 1 - Math.exp(-dt * 13);
    p.vx = lerp(p.vx, targetVx, smooth);
    p.vy = lerp(p.vy, targetVy, smooth);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.moving = Math.hypot(p.vx, p.vy) > 12;
    if (p.moving) p.anim += dt * 9;
  }
  p.x = clamp(p.x, 30, WORLD.w - 30);
  p.y = clamp(p.y, 30, WORLD.h - 30);
  pushOutOfSolids(p);

  let aimX = INPUT.aim.x;
  let aimY = INPUT.aim.y;
  if (!INPUT.aimActive && !INPUT.stickAim) {
    const t = findPlayerTarget(400, false);
    if (t) {
      const dx = t.x - p.x;
      const dy = t.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.1) {
        aimX = dx / d;
        aimY = dy / d;
      }
    }
  }
  const aimAngle = Math.atan2(aimY, aimX);
  p.aimAngle = aimAngle;
  p.facing += angleDiff(p.facing, aimAngle) * Math.min(1, dt * 16);

  if (G.time - p.lastDamage > 5 && p.hp < p.maxHp) {
    p.hp = Math.min(p.maxHp, p.hp + (3 + p.level * 0.3) * dt);
  }
  for (const b of G.buildings) {
    if (b.kind === 'ward' && !b.destroyed && dist(b.x, b.y, p.x, p.y) < b.range) {
      p.hp = Math.min(p.maxHp, p.hp + b.heal * dt);
    }
  }

  playerAttack(dt);
  G.context = getContextAction();

  if (G.harvest) {
    if (!INPUT.interactHeld || dist(G.harvest.node.x, G.harvest.node.y, p.x, p.y) > 120) {
      G.harvest = null;
    } else {
      G.harvest.timer -= dt;
      if (G.harvest.timer <= 0) {
        G.harvest.timer = 0.38;
        harvestTick(G.harvest.node);
      }
    }
  }
}

function nearPlayer(x, y, range) {
  const p = G.player;
  if (!p) return false;
  return dist2(x, y, p.x, p.y) < range * range;
}

function spawnParticle(x, y, vx, vy, life, size, color, gravity = 0, type = 'dot') {
  if (G.particles.length > 900) return;
  G.particles.push({ x, y, vx, vy, life, maxLife: life, size, color, gravity, type });
}

function spawnHit(x, y, color, count = 4) {
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, TAU);
    const s = rng.range(20, 95);
    spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, rng.range(0.2, 0.5), rng.range(1, 2.8), color, 60);
  }
}

function spawnSlash(x, y, angle, faction, size = 30, player = false) {
  G.effects.push({
    type: 'slash', x, y, angle, life: 0.2, maxLife: 0.2, size,
    color: player ? '#ffcf7d' : faction === ALLY ? '#f5c26c' : '#93dccc',
  });
}

function spawnText(x, y, text, color, size = 12) {
  if (G.texts.length > 70) G.texts.shift();
  G.texts.push({ x, y, text, color, size, life: 0.85, maxLife: 0.85, vy: -34 });
}

function addEvent(text, faction = NEUTRAL, kind = 'info') {
  G.events.push({ text, faction, kind, time: G.time });
  if (G.events.length > 8) G.events.shift();
}

export function addXP(amount) {
  const p = G.player;
  if (!p) return;
  p.xp += amount;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level++;
    p.xpNext = Math.round(p.xpNext * 1.34);
    p.maxHp += 12;
    p.hp = Math.min(p.maxHp, p.hp + 36);
    Audio.sfx('level', 0.7);
    G.toast = { text: `Level ${p.level} — the Warden grows stronger`, time: 3 };
    if (p.level % 2 === 0) offerBoons();
  }
}

function offerBoons() {
  const pool = [...BOONS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  G.boons = pool.slice(0, 3);
  G.pausedForBoon = true;
}

export function chooseBoon(id) {
  if (!G.boons) return;
  const boon = G.boons.find((b) => b.id === id);
  if (!boon) return;
  boon.apply(G.player);
  G.boons = null;
  G.pausedForBoon = false;
  G.toast = { text: `${boon.name} — ${boon.desc}`, time: 3.2 };
  Audio.sfx('level', 0.8);
}

export function dash() {
  const p = G.player;
  if (G.mode !== 'playing' || G.paused || G.pausedForBoon || !p || p.dead || p.dashCd > 0) {
    if (p && p.dashCd > 0) Audio.sfx('deny', 0.5);
    return;
  }
  let dx = INPUT.move.x;
  let dy = INPUT.move.y;
  if (Math.hypot(dx, dy) < 0.1) {
    dx = Math.cos(p.facing);
    dy = Math.sin(p.facing);
  }
  const len = Math.hypot(dx, dy) || 1;
  p.dashVx = (dx / len) * 620;
  p.dashVy = (dy / len) * 620;
  p.dashTime = 0.16;
  p.dashCd = 5 * p.dashCdMult;
  p.invuln = Math.max(p.invuln, 0.34);
  G.effects.push({ type: 'dash', x: p.x, y: p.y, angle: Math.atan2(dy, dx), life: 0.4, maxLife: 0.4, color: '#ffb76b' });
  Audio.sfx('dash', 0.7);
}

export function useAbility() {
  const p = G.player;
  if (G.mode !== 'playing' || G.paused || G.pausedForBoon || !p || p.dead) return;
  if (p.abilityCd > 0) {
    Audio.sfx('deny', 0.55);
    G.toast = { text: `Emberstorm recharging — ${p.abilityCd.toFixed(1)}s`, time: 1.2 };
    return;
  }
  p.abilityCd = 16 * p.abilityCdMult;
  const radius = 215;
  let hits = 0;
  forEachNear(p.x, p.y, radius, (u) => {
    if (u.dead || u.faction !== ENEMY) return;
    if (dist(p.x, p.y, u.x, u.y) <= radius) {
      damageUnit(u, 72, { faction: ALLY, player: true, x: p.x, y: p.y });
      u.burn = Math.max(u.burn, 2.6);
      u.burnDps = 9;
      hits++;
    }
  });
  for (const s of G.structures) {
    if (s.faction === ENEMY && !s.destroyed && dist(p.x, p.y, s.x, s.y) < radius + s.radius) {
      damageStructure(s, 80, ALLY, true);
    }
  }
  for (const b of G.buildings) {
    if (b.faction === ENEMY && !b.destroyed && dist(p.x, p.y, b.x, b.y) < radius) damageStructure(b, 80, ALLY, true);
  }
  G.effects.push({ type: 'nova', x: p.x, y: p.y, life: 0.7, maxLife: 0.7, maxR: radius, color: '#ff8c4a' });
  for (let i = 0; i < 46; i++) {
    const a = rng.range(0, TAU);
    const s = rng.range(80, 330);
    spawnParticle(p.x, p.y, Math.cos(a) * s, Math.sin(a) * s, rng.range(0.4, 0.9), rng.range(1.5, 4), rng.chance(0.5) ? '#ffb35c' : '#ff6d3a', -20);
  }
  G.camera.shake = Math.max(G.camera.shake, 16);
  Audio.sfx('ability', 0.9);
  if (hits > 0) spawnText(p.x, p.y - 40, `EMBERSTORM · ${hits}`, '#ffd27a', 17);
}

export function damagePlayer(amount) {
  const p = G.player;
  if (!p || p.dead || p.invuln > 0) return;
  const dmg = amount * (1 - p.armor);
  p.hp -= dmg;
  p.lastDamage = G.time;
  p.hitFlash = 0.2;
  G.damageFlash = Math.min(0.65, G.damageFlash + 0.24);
  G.camera.shake = Math.max(G.camera.shake, 6);
  Audio.sfx('hit', 0.8);
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    p.deathTimer = 5;
    G.deathTimer = 5;
    G.stats.deaths++;
    G.harvest = null;
    G.buildMode = null;
    p.resources.iron = Math.floor(p.resources.iron * 0.85);
    p.resources.timber = Math.floor(p.resources.timber * 0.85);
    p.resources.essence = Math.floor(p.resources.essence * 0.85);
    addEvent('The Warden has fallen. The line wavers.', ENEMY, 'war');
    Audio.sfx('death', 1);
    G.camera.shake = 18;
  }
}

export function respawnPlayer() {
  const p = G.player;
  if (!p) return;
  const owned = G.points.filter((pt) => pt.owner === ALLY && pt.kind !== 'keep');
  const fallback = getPoint('emberhold');
  let spawn = nearestPoint(p.x, p.y, owned.length ? owned : [fallback], (pt) => !pt.contested);
  if (!spawn) spawn = fallback;
  p.x = spawn.x + rng.range(-50, 50);
  p.y = spawn.y + 80 + rng.range(-30, 30);
  p.vx = 0;
  p.vy = 0;
  p.hp = p.maxHp * 0.72;
  p.dead = false;
  p.deathTimer = 0;
  p.invuln = 2.6;
  p.dashTime = 0;
  G.deathTimer = 0;
  G.camera.x = p.x;
  G.camera.y = p.y;
  G.effects.push({ type: 'respawn', x: p.x, y: p.y, life: 1.2, maxLife: 1.2, color: '#ffd27a' });
  addEvent('The Warden rises again at ' + spawn.name + '.', ALLY, 'info');
  Audio.sfx('capture', 0.5);
}

export function getContextAction() {
  const p = G.player;
  if (!p || p.dead || G.buildMode) return null;
  let best = null;
  let bd = Infinity;
  for (const node of G.resources) {
    if (node.amount <= 0) continue;
    const d = dist(p.x, p.y, node.x, node.y);
    if (d < 95 && d < bd) {
      bd = d;
      best = { type: 'harvest', label: 'Harvest ' + node.name, node, dist: d };
    }
  }
  for (const s of G.structures) {
    if (s.kind !== 'forge' || s.faction !== ALLY || s.destroyed) continue;
    const d = dist(p.x, p.y, s.x, s.y);
    if (d < 145 && d < bd) {
      bd = d;
      best = { type: 'deposit', label: 'Deposit supplies', structure: s, dist: d };
    }
  }
  for (const b of G.buildings) {
    if (b.destroyed || b.hp >= b.maxHp) continue;
    const d = dist(p.x, p.y, b.x, b.y);
    if (d < 135 && d < bd) {
      bd = d;
      best = { type: 'repair', label: 'Repair ' + b.name, building: b, dist: d };
    }
  }
  return best;
}

function harvestTick(node) {
  const p = G.player;
  if (!p || !node || node.amount <= 0) return;
  const take = Math.min(6 + p.harvestBonus, node.amount);
  node.amount -= take;
  p.resources[node.type] += take;
  G.stats.gathered += take;
  addXP(1.4);
  spawnHit(node.x, node.y - 8, node.type === 'iron' ? '#b9c7cc' : node.type === 'timber' ? '#c49a61' : '#a7e5dd', 4);
  Audio.sfx('harvest', 0.4);
  if (node.amount <= 0) {
    node.respawn = 30;
    addEvent(`${node.name} is exhausted. It will replenish.`, NEUTRAL, 'logistics');
  }
}

export function interactStart() {
  if (G.mode !== 'playing' || G.paused || G.pausedForBoon) return;
  const p = G.player;
  if (!p || p.dead) return;
  const ctx = getContextAction();
  if (!ctx) return;
  if (ctx.type === 'harvest') {
    G.harvest = { node: ctx.node, timer: 0.38 };
    harvestTick(ctx.node);
  } else if (ctx.type === 'deposit') {
    depositSupplies();
  } else if (ctx.type === 'repair') {
    repairBuilding(ctx.building);
  }
}

export function interactEnd() {
  G.harvest = null;
}

function depositSupplies() {
  const p = G.player;
  if (!p) return;
  let total = 0;
  for (const key of ['iron', 'timber', 'essence']) {
    const take = Math.min(15, p.resources[key]);
    p.resources[key] -= take;
    total += take;
  }
  if (total <= 0) {
    G.toast = { text: 'No resources to deposit. Harvest iron, timber, or essence.', time: 2.2 };
    Audio.sfx('deny', 0.5);
    return;
  }
  G.war.allySupply = clamp(G.war.allySupply + total * 0.48, 0, 100);
  G.stats.deposited += total;
  addXP(total * 1.6);
  G.toast = { text: `Supplies delivered — +${Math.round(total * 0.48)} war supply`, time: 2.2 };
  addEvent(`Quartermaster: ${total} resources delivered to the front.`, ALLY, 'logistics');
  Audio.sfx('deposit', 0.8);
  G.effects.push({ type: 'ring', x: p.x, y: p.y, life: 0.8, maxLife: 0.8, maxR: 90, color: '#ffd27a' });
}

function repairBuilding(b) {
  if (!b || b.destroyed || b.hp >= b.maxHp) return;
  b.hp = Math.min(b.maxHp, b.hp + 120);
  G.effects.push({ type: 'ring', x: b.x, y: b.y, life: 0.5, maxLife: 0.5, maxR: 50, color: '#9fe6c5' });
  spawnHit(b.x, b.y, '#9fe6c5', 5);
  Audio.sfx('build', 0.4);
}

export function getBuildCost(kind) {
  const def = BUILDS[kind];
  if (!def) return {};
  const p = G.player;
  const mult = p ? p.buildCostMult : 1;
  const out = {};
  for (const [k, v] of Object.entries(def.cost)) out[k] = Math.max(1, Math.round(v * mult));
  return out;
}

function canAfford(cost) {
  const p = G.player;
  if (!p) return false;
  return Object.entries(cost).every(([k, v]) => (p.resources[k] || 0) >= v);
}

export function getBuildInfo() {
  return Object.entries(BUILDS).map(([id, def]) => ({
    id, name: def.name, desc: def.desc, cost: getBuildCost(id), affordable: canAfford(getBuildCost(id)),
  }));
}

export function toggleBuild(kind = null) {
  if (G.mode !== 'playing' || G.paused || G.pausedForBoon) return;
  if (G.player && G.player.dead) return;
  if (kind === null || G.buildMode === kind) {
    G.buildMode = null;
    Audio.sfx('ui', 0.5);
  } else {
    G.buildMode = kind;
    Audio.sfx('ui', 0.6);
  }
  G.context = getContextAction();
}

export function cancelBuild() {
  G.buildMode = null;
}

export function placeBuilding(x, y) {
  if (G.mode !== 'playing' || !G.buildMode || !G.player) return { ok: false, reason: 'none' };
  const p = G.player;
  const kind = G.buildMode;
  const def = BUILDS[kind];
  const cost = getBuildCost(kind);
  if (dist(p.x, p.y, x, y) > 220) return { ok: false, reason: 'too-far' };
  if (!canAfford(cost)) {
    Audio.sfx('deny', 0.6);
    G.toast = { text: 'Not enough resources for ' + def.name, time: 2 };
    return { ok: false, reason: 'cost' };
  }
  if (x < 40 || y < 40 || x > WORLD.w - 40 || y > WORLD.h - 40) return { ok: false, reason: 'bounds' };
  for (const s of G.structures) {
    if (!s.destroyed && s.maxHp > 0 && dist(x, y, s.x, s.y) < s.radius + def.radius + 12) {
      return { ok: false, reason: 'blocked' };
    }
  }
  for (const b of G.buildings) {
    if (!b.destroyed && dist(x, y, b.x, b.y) < b.radius + def.radius + 10) {
      return { ok: false, reason: 'blocked' };
    }
  }
  for (const [k, v] of Object.entries(cost)) p.resources[k] -= v;
  G.buildings.push({
    id: 'b' + G.id++,
    kind,
    name: def.name,
    x, y,
    radius: def.radius,
    hp: def.hp,
    maxHp: def.hp,
    faction: ALLY,
    range: def.range || 0,
    damage: def.damage || 0,
    heal: def.heal || 0,
    cd: 0,
    healTimer: 0,
    destroyed: false,
    flash: 0,
    born: G.time,
  });
  G.stats.built++;
  addXP(18);
  G.buildMode = null;
  G.effects.push({ type: 'ring', x, y, life: 0.8, maxLife: 0.8, maxR: def.radius * 2, color: '#ffd27a' });
  for (let i = 0; i < 16; i++) {
    spawnParticle(x, y, rng.range(-70, 70), rng.range(-70, 20), rng.range(0.4, 0.9), rng.range(1, 3), '#b9945e', 40);
  }
  Audio.sfx('build', 0.9);
  G.toast = { text: `${def.name} raised`, time: 1.6 };
  addEvent(`${def.name} raised at the front.`, ALLY, 'logistics');
  return { ok: true };
}

function spawnCaravan() {
  const cinder = getPoint('cinderfield');
  const ford = getPoint('ashenford');
  const route = [{ x: cinder.x, y: cinder.y }];
  if (ford.owner === ALLY) route.push({ x: ford.x, y: ford.y + 40 });
  G.caravans.push({
    x: getPoint('emberhold').x + 40,
    y: getPoint('emberhold').y + 20,
    faction: ALLY,
    hp: 320,
    maxHp: 320,
    speed: 54,
    route,
    idx: 0,
    angle: 0,
    bob: rng.range(0, TAU),
  });
  addEvent('A supply caravan leaves Emberhold.', ALLY, 'logistics');
}

function updateCaravans(dt) {
  for (const c of G.caravans) {
    if (c.hp <= 0) continue;
    const wp = c.route[c.idx];
    if (!wp) {
      c.hp = 0;
      continue;
    }
    const dx = wp.x - c.x;
    const dy = wp.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d < 36) {
      c.idx++;
      if (c.idx >= c.route.length) {
        c.hp = 0;
        G.war.allySupply = clamp(G.war.allySupply + 14, 0, 100);
        addEvent('Supply caravan reached the front. +14 supply.', ALLY, 'logistics');
        G.effects.push({ type: 'ring', x: c.x, y: c.y, life: 0.7, maxLife: 0.7, maxR: 70, color: '#ffd27a' });
        continue;
      }
    } else {
      const vx = (dx / d) * c.speed;
      const vy = (dy / d) * c.speed;
      c.x += vx * dt;
      c.y += vy * dt;
      c.angle = Math.atan2(vy, vx);
      c.bob += dt * 4;
    }
    for (const u of G.units) {
      if (u.dead || u.faction !== ENEMY) continue;
      if (dist(u.x, u.y, c.x, c.y) < 78) {
        c.hp -= (u.type.ranged ? 5 : 9) * dt * supplyMult(ENEMY);
      }
    }
    if (c.hp <= 0) {
      addEvent('Hollow raiders destroyed a supply caravan.', ENEMY, 'logistics');
      G.war.allySupply = clamp(G.war.allySupply - 5, 0, 100);
      for (let i = 0; i < 16; i++) {
        spawnParticle(c.x, c.y, rng.range(-90, 90), rng.range(-90, 90), rng.range(0.4, 0.9), rng.range(1, 3), '#d39b55', 50);
      }
    }
  }
  G.caravans = G.caravans.filter((c) => c.hp > 0);
}

function updateBuildings(dt) {
  for (const b of G.buildings) {
    if (b.destroyed) continue;
    b.flash = Math.max(0, (b.flash || 0) - dt);
    if (b.kind === 'ballista') {
      b.cd -= dt;
      if (b.cd <= 0) {
        let target = null;
        let bd = b.range * b.range;
        forEachNear(b.x, b.y, b.range, (u) => {
          if (u.dead || u.faction !== ENEMY) return;
          const d = dist2(b.x, b.y, u.x, u.y);
          if (d < bd) {
            bd = d;
            target = u;
          }
        });
        if (target) {
          b.cd = BUILDS.ballista.cd;
          const a = Math.atan2(target.y - b.y, target.x - b.x);
          spawnProjectile({
            x: b.x + Math.cos(a) * 18,
            y: b.y + Math.sin(a) * 18,
            target,
            damage: BUILDS.ballista.damage,
            faction: ALLY,
            type: 'bolt',
            speed: 620,
          });
          if (nearPlayer(b.x, b.y, 600)) Audio.sfx('bolt', 0.3);
        }
      }
    } else if (b.kind === 'ward') {
      b.healTimer -= dt;
      if (b.healTimer <= 0) {
        b.healTimer = 0.5;
        forEachNear(b.x, b.y, b.range, (u) => {
          if (u.dead || u.faction !== ALLY) return;
          u.hp = Math.min(u.maxHp, u.hp + b.heal * 0.5);
        });
        if (G.player && !G.player.dead && dist(b.x, b.y, G.player.x, G.player.y) < b.range) {
          G.player.hp = Math.min(G.player.maxHp, G.player.hp + b.heal * 0.5);
        }
        if (rng.chance(0.3)) spawnParticle(b.x + rng.range(-30, 30), b.y + rng.range(-30, 30), 0, -20, 0.8, 1.6, '#9fe6c5', -10);
      }
    }
  }
  G.buildings = G.buildings.filter((b) => !b.destroyed);
}

function updateStructures(dt) {
  for (const s of G.structures) {
    s.flash = Math.max(0, (s.flash || 0) - dt);
    if (s.destroyed || s.maxHp <= 0) continue;
    if (s.kind === 'keep' || s.kind === 'tower') {
      s.cooldown = (s.cooldown || 0) - dt;
      if (s.cooldown <= 0) {
        const range = s.kind === 'keep' ? 430 : 360;
        let target = null;
        let bd = range * range;
        forEachNear(s.x, s.y, range, (u) => {
          if (u.dead || u.faction === s.faction) return;
          const d = dist2(s.x, s.y, u.x, u.y);
          if (d < bd) {
            bd = d;
            target = u;
          }
        });
        if (target) {
          s.cooldown = s.kind === 'keep' ? 1.3 : 1.6;
          const a = Math.atan2(target.y - s.y, target.x - s.x);
          spawnProjectile({
            x: s.x + Math.cos(a) * 30,
            y: s.y + Math.sin(a) * 30,
            target,
            damage: s.kind === 'keep' ? 24 : 18,
            faction: s.faction,
            type: s.faction === ALLY ? 'bolt' : 'orb',
            speed: 520,
          });
          if (nearPlayer(s.x, s.y, 650)) Audio.sfx(s.faction === ALLY ? 'bolt' : 'ability', 0.18);
        }
      }
    }
  }
}

function updateCritters(dt) {
  for (const c of G.critters) {
    c.timer -= dt;
    if (c.timer <= 0) {
      c.timer = rng.range(1.8, 5.5);
      c.dir = rng.range(0, TAU);
    }
    let speed = c.speed;
    if (G.player && !G.player.dead) {
      const d = dist(c.x, c.y, G.player.x, G.player.y);
      if (d < 180) {
        c.dir = Math.atan2(c.y - G.player.y, c.x - G.player.x);
        speed = c.type === 'crow' ? 150 : 80;
      }
    }
    c.vx = lerp(c.vx, Math.cos(c.dir) * speed, 1 - Math.exp(-dt * 3));
    c.vy = lerp(c.vy, Math.sin(c.dir) * speed, 1 - Math.exp(-dt * 3));
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.phase += dt * (c.type === 'crow' ? 8 : 3);
    if (c.x < 60 || c.x > WORLD.w - 60) c.dir = Math.PI - c.dir;
    if (c.y < 60 || c.y > WORLD.h - 60) c.dir = -c.dir;
    c.x = clamp(c.x, 60, WORLD.w - 60);
    c.y = clamp(c.y, 60, WORLD.h - 60);
  }
}

function updateResources(dt) {
  for (const node of G.resources) {
    if (node.amount <= 0) {
      node.respawn -= dt;
      if (node.respawn <= 0) node.amount = node.max;
    }
  }
}

function updateWar(dt) {
  if (G.mode !== 'playing') return;
  const allyAlive = aliveCount(ALLY);
  const enemyAlive = aliveCount(ENEMY);
  let allyGen = 0;
  let enemyGen = 0;
  for (const p of G.points) {
    if (p.owner === ALLY) allyGen += p.kind === 'keep' ? 0.8 : p.kind === 'town' || p.kind === 'ford' ? 0.55 : 0.35;
    else if (p.owner === ENEMY) enemyGen += p.kind === 'keep' ? 0.8 : p.kind === 'town' || p.kind === 'ford' ? 0.55 : 0.35;
  }
  for (const s of G.structures) {
    if (!s.destroyed && s.kind === 'forge') {
      if (s.faction === ALLY) allyGen += 0.25;
      else enemyGen += 0.25;
    }
  }
  const allyDrain = 0.15 + allyAlive * 0.0075;
  const enemyDrain = 0.15 + enemyAlive * 0.0075;
  G.war.allySupply = clamp(G.war.allySupply + (allyGen - allyDrain) * dt, 0, 100);
  G.war.enemySupply = clamp(G.war.enemySupply + (enemyGen + 0.32 - enemyDrain) * dt, 0, 100);

  if (G.war.allySupply < 20 && !G.war.lowWarned) {
    G.war.lowWarned = true;
    addEvent('Quartermaster: War supply is critical. Bring resources to a forge!', ALLY, 'logistics');
  } else if (G.war.allySupply > 38) {
    G.war.lowWarned = false;
  }

  const p = G.player;
  for (const point of G.points) {
    if (point.kind === 'keep') continue;
    let ally = 0;
    let enemy = 0;
    for (const u of G.units) {
      if (u.dead) continue;
      if (dist2(u.x, u.y, point.x, point.y) > point.r * point.r) continue;
      if (u.faction === ALLY) ally++;
      else enemy++;
    }
    if (p && !p.dead && dist2(p.x, p.y, point.x, point.y) < point.r * point.r) ally += 6;
    point.contested = ally > 0 && enemy > 0;
    const delta = (ally - enemy) * 1.15;
    const oldOwner = point.owner;
    point.control = clamp(point.control + delta * dt, -100, 100);
    if (point.control >= 100 && point.owner !== ALLY) {
      point.owner = ALLY;
      point.control = 100;
      addEvent(`Iron Guard seized ${point.name}!`, ALLY, 'war');
      Audio.sfx('capture', 0.85);
      G.effects.push({ type: 'ring', x: point.x, y: point.y, life: 1.1, maxLife: 1.1, maxR: point.r, color: '#ffd27a' });
      if (p && dist(p.x, p.y, point.x, point.y) < point.r * 1.4) {
        G.stats.captures++;
        addXP(75);
        G.toast = { text: `${point.name} captured — +75 renown`, time: 2.8 };
      }
    } else if (point.control <= -100 && point.owner !== ENEMY) {
      point.owner = ENEMY;
      point.control = -100;
      addEvent(`Hollow Court took ${point.name}.`, ENEMY, 'war');
      Audio.sfx('capture', 0.7);
      G.effects.push({ type: 'ring', x: point.x, y: point.y, life: 1.1, maxLife: 1.1, maxR: point.r, color: '#a98bd6' });
    }
    if (oldOwner !== point.owner) {
      G.squads.forEach((sq) => {
        if (sq.faction === point.owner) sq.targetId = chooseTarget(sq.faction);
      });
    }
  }

  let allyScore = 0;
  let enemyScore = 0;
  let total = 0;
  for (const point of G.points) {
    total += point.weight;
    if (point.owner === ALLY) allyScore += point.weight * (0.4 + Math.abs(point.control) / 160);
    else if (point.owner === ENEMY) enemyScore += point.weight * (0.4 + Math.abs(point.control) / 160);
  }
  G.war.momentum = clamp((allyScore - enemyScore) / Math.max(1, total), -1, 1);
}

function updateQuest() {
  if (G.mode !== 'playing') return;
  const q = QUESTS[G.quest.stage];
  if (!q) return;
  if (q.check()) {
    if (q.reward > 0) addXP(q.reward);
    G.toast = { text: `${q.title} — complete`, time: 3 };
    addEvent(`Objective complete: ${q.title}`, ALLY, 'war');
    G.quest.stage++;
    Audio.sfx('capture', 0.8);
    const next = QUESTS[G.quest.stage];
    if (next) setTimeout(() => {
      if (G.mode === 'playing') addEvent(`New objective: ${next.title}`, ALLY, 'info');
    }, 800);
  }
}

function updateChatter(dt) {
  if (G.mode !== 'playing') return;
  G.chatterTimer -= dt;
  if (G.chatterTimer > 0) return;
  G.chatterTimer = rng.range(11, 19);
  const ford = getPoint('ashenford');
  const lines = [];
  if (G.war.allySupply < 30) {
    lines.push(['Quartermaster: The forges are running thin. Bring iron and timber.', ALLY]);
  }
  if (ford.contested) {
    lines.push(['Scout: Ashen Ford is contested. Push them off the crossing!', ALLY]);
    lines.push(['Hollow Herald: The ford will drown in your embers.', ENEMY]);
  }
  if (G.war.momentum > 0.25) lines.push(['Iron Captain: The line advances. Keep pressure on the crossing.', ALLY]);
  if (G.war.momentum < -0.25) lines.push(['Iron Captain: We are giving ground. Rally at the ford!', ALLY]);
  lines.push(['Veteran: The Hollow Court never tires. Neither do we.', ALLY]);
  lines.push(['Scout: Warbands sighted on the north road.', ENEMY]);
  lines.push(['Quartermaster: Every crate of iron is a blade at the front.', ALLY]);
  lines.push(['Hollow Choir: Your embers gutter. The long night comes.', ENEMY]);
  const pick = rng.pick(lines);
  addEvent(pick[0], pick[1], 'speech');
}

function updateEffects(dt) {
  for (const p of G.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.gravity * dt;
    p.vx *= 1 - Math.min(0.9, dt * 1.6);
    p.vy *= 1 - Math.min(0.9, dt * 1.6);
  }
  G.particles = G.particles.filter((p) => p.life > 0);
  for (const t of G.texts) {
    t.life -= dt;
    t.y += t.vy * dt;
    t.vy *= 1 - Math.min(0.9, dt * 2);
  }
  G.texts = G.texts.filter((t) => t.life > 0);
  for (const e of G.effects) e.life -= dt;
  G.effects = G.effects.filter((e) => e.life > 0);
  for (const c of G.corpses) c.ttl -= dt;
  G.corpses = G.corpses.filter((c) => c.ttl > 0);
  G.damageFlash = Math.max(0, G.damageFlash - dt * 1.5);
}

function updateCamera(dt) {
  const cam = G.camera;
  cam.shake = Math.max(0, cam.shake - dt * 24);
  cam.shakeX = (Math.random() - 0.5) * cam.shake;
  cam.shakeY = (Math.random() - 0.5) * cam.shake;
  if (G.mode === 'title') {
    G.titleTime += dt;
    const t = G.titleTime;
    cam.x = 2040 + Math.cos(t * 0.075) * 300;
    cam.y = 1490 + Math.sin(t * 0.055) * 190;
    cam.zoom = 0.94 + Math.sin(t * 0.09) * 0.025;
    return;
  }
  const p = G.player;
  if (!p) return;
  const targetX = p.x + (p.dead ? 0 : INPUT.aim.x * 26);
  const targetY = p.y + (p.dead ? 0 : INPUT.aim.y * 26);
  const smooth = 1 - Math.exp(-dt * 5.5);
  cam.x = lerp(cam.x, targetX, smooth);
  cam.y = lerp(cam.y, targetY, smooth);
  const vw = window.innerWidth / cam.zoom;
  const vh = window.innerHeight / cam.zoom;
  cam.x = clamp(cam.x, vw / 2, WORLD.w - vw / 2);
  cam.y = clamp(cam.y, vh / 2, WORLD.h - vh / 2);
}

export function updateGame(dt) {
  dt = Math.min(dt, 0.05);
  if (G.mode === 'title') {
    updateUnits(dt);
    updateProjectiles(dt);
    updateEffects(dt);
    updateSpawning(dt);
    updateCritters(dt);
    updateCamera(dt);
    G.titleStats.ally = aliveCount(ALLY);
    G.titleStats.enemy = aliveCount(ENEMY);
    return;
  }
  if (G.mode === 'ended') {
    updateEffects(dt);
    updateCamera(dt);
    return;
  }
  if (G.mode !== 'playing') return;
  if (G.paused || G.pausedForBoon) return;

  G.time += dt;
  updateUnits(dt);
  updatePlayer(dt);
  updateProjectiles(dt);
  updateStructures(dt);
  updateBuildings(dt);
  updateCaravans(dt);
  updateCritters(dt);
  updateResources(dt);
  updateWar(dt);
  G.squadTimer -= dt;
  if (G.squadTimer <= 0) {
    G.squadTimer = 4;
    updateSquadTargets();
  }
  updateQuest();
  updateChatter(dt);
  updateSpawning(dt);
  updateEffects(dt);
  updateCamera(dt);

  if (G.toast) {
    G.toast.time -= dt;
    if (G.toast.time <= 0) G.toast = null;
  }
  if (G.hint) {
    G.hint.time -= dt;
    if (G.hint.time <= 0) G.hint = null;
  }

  G.units = G.units.filter((u) => !u.dead);
  if (G.squads.length > 180) G.squads = G.squads.filter((s) => s.units.some((u) => !u.dead));
  if (G.squads.length > 260) G.squads = G.squads.slice(-220);

  let nearbyEnemies = 0;
  forEachNear(G.player ? G.player.x : 0, G.player ? G.player.y : 0, 620, (u) => {
    if (!u.dead && u.faction === ENEMY) nearbyEnemies++;
  });
  Audio.setIntensity(clamp(nearbyEnemies / 42, 0.15, 1));
}

function endGame(win) {
  if (G.mode === 'ended') return;
  G.mode = 'ended';
  G.result = { win, time: G.time, stats: { ...G.stats }, level: G.player ? G.player.level : 1 };
  G.buildMode = null;
  G.boons = null;
  G.pausedForBoon = false;
  G.harvest = null;
  if (win) {
    addEvent('The Mournspire shatters. The Hollow Court breaks.', ALLY, 'war');
    Audio.sfx('victory', 1);
  } else {
    addEvent('Emberhold has fallen. The long night begins.', ENEMY, 'war');
    Audio.sfx('defeat', 1);
  }
}

export function togglePause() {
  if (G.mode !== 'playing') return;
  G.paused = !G.paused;
  Audio.sfx('ui', 0.6);
}

export function setPaused(v) {
  if (G.mode !== 'playing') return;
  G.paused = Boolean(v);
}

export function toggleQuality() {
  G.quality = G.quality === 'high' ? 'low' : 'high';
  return G.quality;
}

export function getQuestView() {
  const q = QUESTS[G.quest.stage] || QUESTS[QUESTS.length - 1];
  return {
    title: q.title,
    desc: q.desc,
    progress: q.progress(),
    stage: Math.min(G.quest.stage + 1, QUESTS.length),
    total: QUESTS.length,
  };
}

export function getQuestTarget() {
  const stage = G.quest.stage;
  if (stage <= 1) {
    const p = getPoint('ashenford');
    return { x: p.x, y: p.y, name: p.name };
  }
  if (stage === 2) {
    const p = getPoint('ashenford');
    return { x: p.x, y: p.y + 70, name: 'the ford' };
  }
  if (stage === 3) {
    const forge = G.structures.find((s) => s.kind === 'forge' && s.faction === ALLY && !s.destroyed);
    if (forge) return { x: forge.x, y: forge.y, name: forge.name };
  }
  if (stage === 4) {
    const p = getPoint('gloamwood');
    return { x: p.x, y: p.y, name: p.name };
  }
  const p = getPoint('mournspire');
  return { x: p.x, y: p.y, name: p.name };
}

export function getContextLabel() {
  return G.context ? G.context.label : '';
}



