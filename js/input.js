import { clamp, TAU } from './util.js';

export const INPUT = {
  move: { x: 0, y: 0 },
  aim: { x: 1, y: 0 },
  aimActive: false,
  firing: false,
  interactHeld: false,
  keys: new Set(),
  mouse: { x: 0, y: 0, worldX: 0, worldY: 0, active: false, down: false },
  stickMove: null,
  stickAim: null,
  tiltEnabled: false,
  tiltAvailable: false,
  tiltCalibrated: false,
  tiltStatus: 'Off',
  tiltMove: { x: 0, y: 0 },
  tiltRaw: { x: 0, y: 0 },
  tiltBaseline: null,
  tiltHandler: null,
  isTouch: false,
  placing: false,
  lastAimTap: 0,
};

const MOVE_RADIUS = 62;
const DEADZONE = 7;

function normStick(dx, dy, radius = MOVE_RADIUS) {
  const len = Math.hypot(dx, dy);
  if (len < DEADZONE) return { x: 0, y: 0, len: 0 };
  const capped = Math.min(len, radius);
  const power = (capped - DEADZONE) / (radius - DEADZONE);
  return { x: (dx / len) * power, y: (dy / len) * power, len: power };
}

export function initInput(canvas, { actions = {}, screenToWorld = (x, y) => ({ x, y }), getPlayer = () => null, isPlacing = () => false } = {}) {
  INPUT.isTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  INPUT.tiltAvailable = typeof DeviceOrientationEvent !== 'undefined';

  const pointers = new Map();

  const updateAimFromStick = () => {
    if (!INPUT.stickAim) return;
    const v = normStick(INPUT.stickAim.dx, INPUT.stickAim.dy, 58);
    if (v.len > 0.05) {
      INPUT.aim.x = v.x / Math.max(v.len, 0.001);
      INPUT.aim.y = v.y / Math.max(v.len, 0.001);
      INPUT.aimActive = true;
      INPUT.firing = true;
    }
  };

  const updateMouseAim = (clientX, clientY) => {
    const w = screenToWorld(clientX, clientY);
    INPUT.mouse.worldX = w.x;
    INPUT.mouse.worldY = w.y;
    INPUT.mouse.x = clientX;
    INPUT.mouse.y = clientY;
    INPUT.mouse.active = true;
    const p = getPlayer();
    if (p) {
      const dx = w.x - p.x;
      const dy = w.y - p.y;
      const len = Math.hypot(dx, dy);
      if (len > 4) {
        INPUT.aim.x = dx / len;
        INPUT.aim.y = dy / len;
      }
    }
  };

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const w = screenToWorld(e.clientX, e.clientY);
    if (isPlacing()) {
      actions.place?.(w.x, w.y);
      return;
    }
    INPUT.mouse.active = INPUT.mouse.active || e.pointerType === 'mouse';
    if (e.pointerType === 'mouse') {
      INPUT.mouse.down = true;
      INPUT.firing = true;
      INPUT.aimActive = true;
      updateMouseAim(e.clientX, e.clientY);
      canvas.setPointerCapture?.(e.pointerId);
      return;
    }
    const left = e.clientX < window.innerWidth * 0.5;
    const stick = {
      id: e.pointerId,
      ox: e.clientX,
      oy: e.clientY,
      x: e.clientX,
      y: e.clientY,
      dx: 0,
      dy: 0,
    };
    pointers.set(e.pointerId, { stick, left });
    if (left) {
      if (!INPUT.stickMove) INPUT.stickMove = stick;
    } else {
      if (!INPUT.stickAim) INPUT.stickAim = stick;
      INPUT.aimActive = true;
      INPUT.firing = true;
    }
    canvas.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (e.pointerType === 'mouse') {
      updateMouseAim(e.clientX, e.clientY);
      if (INPUT.mouse.down) {
        INPUT.firing = true;
        INPUT.aimActive = true;
      }
      return;
    }
    const rec = pointers.get(e.pointerId);
    if (!rec) return;
    const s = rec.stick;
    s.x = e.clientX;
    s.y = e.clientY;
    s.dx = e.clientX - s.ox;
    s.dy = e.clientY - s.oy;
    const max = 62;
    const len = Math.hypot(s.dx, s.dy);
    if (len > max) {
      s.ox += (s.dx / len) * (len - max);
      s.oy += (s.dy / len) * (len - max);
      s.dx = e.clientX - s.ox;
      s.dy = e.clientY - s.oy;
    }
    if (rec.left) {
      INPUT.stickMove = s;
    } else {
      INPUT.stickAim = s;
      updateAimFromStick();
    }
  };

  const endPointer = (e) => {
    if (e.pointerType === 'mouse') {
      INPUT.mouse.down = false;
      INPUT.firing = false;
      INPUT.aimActive = false;
      return;
    }
    const rec = pointers.get(e.pointerId);
    if (!rec) return;
    pointers.delete(e.pointerId);
    if (rec.left) {
      if (INPUT.stickMove?.id === e.pointerId) INPUT.stickMove = null;
    } else {
      if (INPUT.stickAim?.id === e.pointerId) {
        const s = INPUT.stickAim;
        const len = Math.hypot(s.dx, s.dy);
        if (len < 10) {
          actions.tapAttack?.();
          INPUT.lastAimTap = performance.now();
        }
        INPUT.stickAim = null;
        INPUT.aimActive = false;
        INPUT.firing = false;
      }
    }
  };

  canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', endPointer, { passive: true });
  window.addEventListener('pointercancel', endPointer, { passive: true });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const onKeyDown = (e) => {
    if (e.repeat) {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      return;
    }
    const code = e.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) e.preventDefault();
    INPUT.keys.add(code);
    if (code === 'Space') actions.dash?.();
    else if (code === 'KeyQ') actions.ability?.();
    else if (code === 'KeyE') {
      INPUT.interactHeld = true;
      actions.interactStart?.();
    } else if (code === 'KeyB') actions.build?.();
    else if (code === 'Escape') actions.pause?.();
    else if (code === 'KeyM') actions.toggleSound?.();
    else if (code === 'KeyT') actions.toggleTilt?.();
    else if (code === 'KeyF') actions.tapAttack?.();
  };
  const onKeyUp = (e) => {
    INPUT.keys.delete(e.code);
    if (e.code === 'KeyE') {
      INPUT.interactHeld = false;
      actions.interactEnd?.();
    }
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => {
    INPUT.keys.clear();
    INPUT.interactHeld = false;
  });

  window.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaY) < 1) return;
      actions.zoom?.(e.deltaY > 0 ? -0.08 : 0.08);
    },
    { passive: true },
  );

  function mapOrientation(beta, gamma, angle) {
    const a = ((angle % 360) + 360) % 360;
    if (a === 90) return { x: beta, y: -gamma };
    if (a === 270) return { x: -beta, y: gamma };
    if (a === 180) return { x: -gamma, y: -beta };
    return { x: gamma, y: beta };
  }

  function onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    const angle = window.screen?.orientation?.angle ?? window.orientation ?? 0;
    const raw = mapOrientation(e.beta, e.gamma, angle);
    INPUT.tiltRaw = raw;
    if (!INPUT.tiltBaseline) {
      INPUT.tiltBaseline = { x: raw.x, y: raw.y };
      INPUT.tiltCalibrated = true;
      INPUT.tiltStatus = 'Calibrated';
      return;
    }
    const dx = raw.x - INPUT.tiltBaseline.x;
    const dy = raw.y - INPUT.tiltBaseline.y;
    const maxTilt = 24;
    const nx = clamp(dx / maxTilt, -1, 1);
    const ny = clamp(dy / maxTilt, -1, 1);
    const dead = 0.08;
    INPUT.tiltMove.x = Math.abs(nx) < dead ? 0 : (nx - Math.sign(nx) * dead) / (1 - dead);
    INPUT.tiltMove.y = Math.abs(ny) < dead ? 0 : (ny - Math.sign(ny) * dead) / (1 - dead);
    if (!INPUT.tiltEnabled) {
      INPUT.tiltMove.x = 0;
      INPUT.tiltMove.y = 0;
    }
  }

  INPUT.enableTilt = async function () {
    if (!INPUT.tiltAvailable) {
      INPUT.tiltStatus = 'Unsupported';
      return { ok: false, reason: 'unsupported' };
    }
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        INPUT.tiltStatus = 'Requesting';
        const result = await DeviceOrientationEvent.requestPermission();
        if (result !== 'granted') {
          INPUT.tiltStatus = 'Denied';
          INPUT.tiltEnabled = false;
          return { ok: false, reason: 'denied' };
        }
      }
    } catch (err) {
      INPUT.tiltStatus = 'Denied';
      INPUT.tiltEnabled = false;
      return { ok: false, reason: 'denied' };
    }
    if (!INPUT.tiltHandler) {
      INPUT.tiltHandler = onOrientation;
      window.addEventListener('deviceorientation', INPUT.tiltHandler, true);
    }
    INPUT.tiltBaseline = null;
    INPUT.tiltCalibrated = false;
    INPUT.tiltEnabled = true;
    INPUT.tiltStatus = 'Calibrating';
    setTimeout(() => {
      if (INPUT.tiltEnabled && !INPUT.tiltCalibrated) INPUT.tiltStatus = 'No sensor data';
      else if (INPUT.tiltEnabled) INPUT.tiltStatus = 'On';
    }, 1400);
    return { ok: true };
  };

  INPUT.disableTilt = function () {
    INPUT.tiltEnabled = false;
    INPUT.tiltMove.x = 0;
    INPUT.tiltMove.y = 0;
    INPUT.tiltStatus = 'Off';
  };

  INPUT.calibrateTilt = function () {
    INPUT.tiltBaseline = null;
    INPUT.tiltCalibrated = false;
    INPUT.tiltMove.x = 0;
    INPUT.tiltMove.y = 0;
    INPUT.tiltStatus = 'Calibrating';
  };

  INPUT.setInteract = (v) => {
    INPUT.interactHeld = v;
  };

  INPUT.update = function () {
    let mx = 0;
    let my = 0;
    if (INPUT.stickMove) {
      const v = normStick(INPUT.stickMove.dx, INPUT.stickMove.dy);
      mx = v.x;
      my = v.y;
    } else {
      if (INPUT.keys.has('KeyA') || INPUT.keys.has('ArrowLeft')) mx -= 1;
      if (INPUT.keys.has('KeyD') || INPUT.keys.has('ArrowRight')) mx += 1;
      if (INPUT.keys.has('KeyW') || INPUT.keys.has('ArrowUp')) my -= 1;
      if (INPUT.keys.has('KeyS') || INPUT.keys.has('ArrowDown')) my += 1;
      if (mx === 0 && my === 0 && INPUT.tiltEnabled) {
        mx = INPUT.tiltMove.x;
        my = INPUT.tiltMove.y;
      }
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    INPUT.move.x = mx;
    INPUT.move.y = my;
  };

  return INPUT;
}
