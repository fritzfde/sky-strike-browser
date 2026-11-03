/** Unified input: keyboard (by KeyboardEvent.code), pointer-locked mouse, touch. Produces normalized axes. */
export interface Controls { pitch: number; roll: number; yaw: number; throttle: number; fireGun: boolean; fireMissile: boolean; }
export class Input {
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, l: false, r: false };
  private touch = { x: 0, y: 0, gun: false, msl: false, thr: false, brk: false };
  locked = false;
  onToggleMute?: () => void; onPauseKey?: () => void; onLockLost?: () => void;
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }
  clear() { this.keys.clear(); this.mouse.l = this.mouse.r = false; }
  readonly c: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, fireGun: false, fireMissile: false };
  constructor(private canvas: HTMLCanvasElement) {
    const block = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyF', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight']);
    // capture phase on window so nothing (canvas focus, Babylon) swallows keys
    window.addEventListener('keydown', e => { const k = this.code(e); this.keys.add(k); if (block.has(k)) e.preventDefault(); if (k === 'KeyM' && !e.repeat) this.onToggleMute?.(); if ((k === 'KeyP' || k === 'Escape') && !e.repeat) this.onPauseKey?.(); }, { capture: true });
    window.addEventListener('keyup', e => this.keys.delete(this.code(e)), { capture: true });
    window.addEventListener('blur', () => { this.clear(); this.onLockLost?.(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.onLockLost?.(); });
    document.addEventListener('pointerlockchange', () => { const was = this.locked; this.locked = document.pointerLockElement === canvas; this.mouse.x = this.mouse.y = 0; if (was && !this.locked) this.onLockLost?.(); });
    window.addEventListener('mousemove', e => {
      if (this.locked) { // virtual stick from relative motion
        this.mouse.x = clamp(this.mouse.x + e.movementX / 250); this.mouse.y = clamp(this.mouse.y + e.movementY / 250);
      } else { this.mouse.x = (e.clientX / innerWidth) * 2 - 1; this.mouse.y = (e.clientY / innerHeight) * 2 - 1; }
    });
    canvas.addEventListener('mousedown', e => { if (e.button === 0) this.mouse.l = true; if (e.button === 2) this.mouse.r = true; canvas.focus(); });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
    window.addEventListener('contextmenu', e => e.preventDefault());
    if ('ontouchstart' in window) this.setupTouch();
  }
  /** Fallback to e.key for layouts/browsers that give empty code. */
  private code(e: KeyboardEvent) {
    if (e.code) return e.code;
    const k = e.key.length === 1 ? 'Key' + e.key.toUpperCase() : e.key; return k === 'Key ' ? 'Space' : k === 'Shift' ? 'ShiftLeft' : k === 'Control' ? 'ControlLeft' : k;
  }
  requestLock() { try { (this.canvas.requestPointerLock as any)?.call(this.canvas)?.catch?.(() => {}); } catch {} this.canvas.focus(); }
  private setupTouch() {
    document.body.classList.add('touch');
    document.getElementById('bPause')!.addEventListener('touchend', e => { e.preventDefault(); this.onPauseKey?.(); });
    const sk = document.getElementById('stick')!, knob = document.getElementById('knob')!;
    const mv = (e: TouchEvent) => { const t = e.targetTouches[0], r = sk.getBoundingClientRect();
      this.touch.x = clamp((t.clientX - r.left - 65) / 65); this.touch.y = clamp((t.clientY - r.top - 65) / 65);
      knob.style.transform = `translate(${this.touch.x * 45}px,${this.touch.y * 45}px)`; e.preventDefault(); };
    sk.addEventListener('touchstart', mv, { passive: false }); sk.addEventListener('touchmove', mv, { passive: false });
    sk.addEventListener('touchend', () => { this.touch.x = this.touch.y = 0; knob.style.transform = ''; });
    ([['bGun', 'gun'], ['bMsl', 'msl'], ['bThr', 'thr'], ['bBrk', 'brk']] as const).forEach(([id, k]) => {
      const b = document.getElementById(id)!;
      b.addEventListener('touchstart', e => { (this.touch as any)[k] = true; e.preventDefault(); }, { passive: false });
      b.addEventListener('touchend', () => { (this.touch as any)[k] = false; });
    });
  }
  private down(...c: string[]) { return c.some(k => this.keys.has(k)); }
  update(dt: number) {
    const c = this.c, m = this.mouse;
    if (this.locked) { m.x *= Math.pow(0.15, dt); m.y *= Math.pow(0.15, dt); } // stick recenters
    const dz = (v: number) => Math.abs(v) < 0.06 ? 0 : v;
    c.pitch = clamp((this.down('ArrowUp') ? 1 : 0) - (this.down('ArrowDown') ? 1 : 0) - dz(m.y) * 1.3 - this.touch.y);
    c.roll = clamp((this.down('ArrowLeft') ? 1 : 0) - (this.down('ArrowRight') ? 1 : 0) - dz(m.x) * 1.3 - this.touch.x);
    c.yaw = clamp((this.down('KeyD', 'KeyE') ? 1 : 0) - (this.down('KeyA', 'KeyQ') ? 1 : 0));
    c.throttle = (this.down('KeyW', 'ShiftLeft', 'ShiftRight') || this.touch.thr ? 1 : 0) - (this.down('KeyS', 'ControlLeft', 'ControlRight') || this.touch.brk ? 1 : 0);
    c.fireGun = m.l || this.down('Space') || this.touch.gun;
    c.fireMissile = m.r || this.down('KeyF') || this.touch.msl;
  }
}
export const clamp = (v: number, a = -1, b = 1) => Math.max(a, Math.min(b, v));
