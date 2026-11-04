/**
 * Unified input -> normalized Controls. Flight-sim layout:
 * Arrow Down = nose up, Arrow Up = nose down, Arrow Left/Right = roll, A/D = rudder,
 * W/S = persistent throttle, Shift (hold) = afterburner. Mouse / right-side touch = free-look only.
 */
export interface Controls { pitch: number; roll: number; yaw: number; throttle: number; afterburner: boolean; brake: boolean; fireGun: boolean; fireMissile: boolean; }
export class Input {
  private keys = new Set<string>();
  private mouse = { l: false, r: false };
  private touch = { x: 0, y: 0, gun: false, msl: false, thr: false, brk: false, ab: false };
  locked = false;
  /** accumulated free-look deltas (radians), consumed by the camera */
  look = { dx: 0, dy: 0, active: false, idle: 0 };
  onToggleMute?: () => void; onPauseKey?: () => void; onLockLost?: () => void;
  onGear?: () => void; onBrake?: () => void; onRecenter?: () => void; onView?: () => void; onSpeedBrake?: () => void; onFlaps?: () => void; onMap?: () => void; onThrottleSet?: (v: number) => void; onFlare?: () => void;
  readonly c: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, afterburner: false, brake: false, fireGun: false, fireMissile: false };
  constructor(private canvas: HTMLCanvasElement) {
    const block = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyF', 'KeyG', 'KeyB', 'KeyC', 'KeyV', 'KeyX', 'KeyL', 'KeyM', 'KeyN', 'KeyR', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'ShiftLeft', 'ShiftRight']);
    window.addEventListener('keydown', e => {
      const k = this.code(e); this.keys.add(k); if (block.has(k)) e.preventDefault(); if (e.repeat) return;
      if (/^Digit\d$/.test(k)) this.onThrottleSet?.((+k[5] || 10) / 10); if (k === 'KeyR') this.onFlare?.(); if (k === 'KeyN') this.onToggleMute?.(); if (k === 'KeyM') this.onMap?.(); if (k === 'KeyP' || k === 'Escape') this.onPauseKey?.();
      if (k === 'KeyG') this.onGear?.(); if (k === 'KeyB') this.onBrake?.(); if (k === 'KeyC') this.onRecenter?.(); if (k === 'KeyV') this.onView?.(); if (k === 'KeyX') this.onSpeedBrake?.(); if (k === 'KeyL') this.onFlaps?.();
    }, { capture: true });
    window.addEventListener('keyup', e => this.keys.delete(this.code(e)), { capture: true });
    window.addEventListener('blur', () => { this.clear(); this.onLockLost?.(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.onLockLost?.(); });
    document.addEventListener('pointerlockchange', () => { const was = this.locked; this.locked = document.pointerLockElement === canvas; if (was && !this.locked) this.onLockLost?.(); });
    // free look: pointer-locked movement, or drag while right button held
    window.addEventListener('mousemove', e => { if (this.locked || this.mouse.r) this.addLook(e.movementX, e.movementY); });
    canvas.addEventListener('mousedown', e => { if (e.button === 0) this.mouse.l = true; if (e.button === 2) this.mouse.r = true; canvas.focus(); });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
    window.addEventListener('contextmenu', e => e.preventDefault());
    if ('ontouchstart' in window) this.setupTouch();
  }
  private addLook(dx: number, dy: number) { this.look.dx += dx * .005; this.look.dy += dy * .005; this.look.idle = 0; }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }
  clear() { this.keys.clear(); this.mouse.l = this.mouse.r = false; }
  private code(e: KeyboardEvent) {
    if (e.code) return e.code;
    const k = e.key.length === 1 ? 'Key' + e.key.toUpperCase() : e.key; return k === 'Key ' ? 'Space' : k === 'Shift' ? 'ShiftLeft' : k;
  }
  requestLock() { try { (this.canvas.requestPointerLock as any)?.call(this.canvas)?.catch?.(() => {}); } catch {} this.canvas.focus(); }
  private setupTouch() {
    document.body.classList.add('touch');
    const tap = (id: string, fn: () => void) => document.getElementById(id)!.addEventListener('touchend', e => { e.preventDefault(); fn(); });
    tap('bPause', () => this.onPauseKey?.()); tap('bGear', () => this.onGear?.()); tap('bBrake', () => this.onBrake?.()); tap('bView', () => this.onView?.()); tap('bSB', () => this.onSpeedBrake?.()); tap('bMap', () => this.onMap?.()); tap('bFlr', () => this.onFlare?.());
    const sk = document.getElementById('stick')!, knob = document.getElementById('knob')!;
    const mv = (e: TouchEvent) => { const t = e.targetTouches[0], r = sk.getBoundingClientRect();
      this.touch.x = clamp((t.clientX - r.left - 65) / 65); this.touch.y = clamp((t.clientY - r.top - 65) / 65);
      knob.style.transform = `translate(${this.touch.x * 45}px,${this.touch.y * 45}px)`; e.preventDefault(); };
    sk.addEventListener('touchstart', mv, { passive: false }); sk.addEventListener('touchmove', mv, { passive: false });
    sk.addEventListener('touchend', () => { this.touch.x = this.touch.y = 0; knob.style.transform = ''; });
    ([['bGun', 'gun'], ['bMsl', 'msl'], ['bThr', 'thr'], ['bBrk', 'brk'], ['bAB', 'ab']] as const).forEach(([id, k]) => {
      const b = document.getElementById(id)!;
      b.addEventListener('touchstart', e => { (this.touch as any)[k] = true; e.preventDefault(); }, { passive: false });
      b.addEventListener('touchend', () => { (this.touch as any)[k] = false; });
    });
    // right half of screen (outside buttons) = free look drag
    let last: { id: number; x: number; y: number } | null = null;
    this.canvas.addEventListener('touchstart', e => { for (const t of Array.from(e.changedTouches)) if (t.clientX > innerWidth / 2 && !last) last = { id: t.identifier, x: t.clientX, y: t.clientY }; }, { passive: true });
    this.canvas.addEventListener('touchmove', e => { for (const t of Array.from(e.changedTouches)) if (last && t.identifier === last.id) { this.addLook((t.clientX - last.x) * 1.5, (t.clientY - last.y) * 1.5); last.x = t.clientX; last.y = t.clientY; } }, { passive: true });
    this.canvas.addEventListener('touchend', e => { for (const t of Array.from(e.changedTouches)) if (last && t.identifier === last.id) last = null; });
  }
  private down(...c: string[]) { return c.some(k => this.keys.has(k)); }
  update(dt: number) {
    const c = this.c; this.look.idle += dt; this.look.active = this.mouse.r || this.look.idle < 1.5;
    c.pitch = clamp((this.down('ArrowDown') ? 1 : 0) - (this.down('ArrowUp') ? 1 : 0) + this.touch.y); // +1 = nose up
    c.roll = clamp((this.down('ArrowLeft') ? 1 : 0) - (this.down('ArrowRight') ? 1 : 0) - this.touch.x); // +1 = roll left
    c.yaw = clamp((this.down('KeyD') ? 1 : 0) - (this.down('KeyA') ? 1 : 0)); // +1 = nose right
    c.throttle = (this.down('KeyW') || this.touch.thr ? 1 : 0) - (this.down('KeyS') || this.touch.brk ? 1 : 0);
    c.afterburner = this.down('ShiftLeft', 'ShiftRight') || this.touch.ab;
    c.fireGun = this.mouse.l || this.down('Space') || this.touch.gun;
    c.fireMissile = this.down('KeyF') || this.touch.msl;
  }
}
export const clamp = (v: number, a = -1, b = 1) => Math.max(a, Math.min(b, v));
