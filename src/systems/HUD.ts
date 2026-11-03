import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { Aircraft } from '../entities/Aircraft';
import { groundAt } from '../world/Terrain';
import { LOCK_TIME } from './WeaponSystem';
import { KT, FT, FPM, NM } from './FlightSystem';
const $ = (id: string) => document.getElementById(id)!;
/** DOM HUD (cheap, crisp) + canvas radar. */
export class HUD {
  private info = $('info'); private msg = $('msg'); private hp = $('hp'); private thr = $('thr'); private lock = $('lock');
  private rc = ($('radar') as HTMLCanvasElement).getContext('2d')!; private msgT = 0;
  flash(t: string, dur = 2) { this.msg.textContent = t; this.msgT = dur; }
  update(p: Aircraft, enemies: Aircraft[], missiles: { a: Aircraft; target: Aircraft | null }[], score: number, wave: number, scene: Scene, cam: Camera, dt: number, persistent = '') {
    const agl = Math.round((p.pos.y - groundAt(p.pos.x, p.pos.z)) * FT); const incoming = missiles.some(m => m.target === p);
    const vs = Math.round((p.onGround ? 0 : p.vel.y) * FPM / 10) * 10, b = (t: string, c: string) => `<b style="color:${c}">${t}</b>`;
    this.info.innerHTML = `SPD ${Math.round(p.speed * KT)} kt<br>ALT ${Math.round(p.pos.y * FT)} ft · AGL ${agl} ft<br>VS ${vs > 0 ? '+' : ''}${vs} ft/min<br>THR ${Math.round(p.throttle * 100)}%${p.abLevel > .5 ? ' ' + b('AB', '#f80') : ''} · G ${p.gLoad.toFixed(1)} · AoA ${(p.aoa * 57.3).toFixed(0)}°<br>`
      + `GEAR ${p.gear ? b('DN', '#4f4') : 'UP'} · FLAPS ${p.flaps ? b('DN', '#4f4') : 'UP'} · SPD BRK ${p.speedbrake ? b('OUT', '#fa4') : 'IN'} · BRK ${p.brakes ? b('ON', '#fa4') : 'OFF'}`
      + `${p.stalled && !p.onGround ? '<br>' + b('STALL', '#f33') : ''}<br>GUN ${p.ammo} | MSL ${p.missiles}<br>SCORE ${score} | WAVE ${wave}`
      + (agl < 300 && !p.onGround && vs < -1500 && p.alive ? '<br>' + b('PULL UP!', '#f44') : '') + (incoming ? '<br>' + b('MISSILE!', '#f44') : '');
    this.hp.style.width = Math.max(0, p.hp) + '%'; this.hp.style.background = p.hp > 50 ? '#0f0' : p.hp > 25 ? '#ff0' : '#f00'; this.thr.style.width = p.throttle * 100 + '%';
    this.msgT -= dt; if (persistent) this.msg.textContent = persistent; else if (this.msgT <= 0) this.msg.textContent = '';
    const L = p.lockTarget;
    if (L && p.alive) {
      const eng = scene.getEngine(); const v = Vector3.Project(L.pos, Matrix.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(eng.getRenderWidth(), eng.getRenderHeight()));
      const s = (eng.getRenderingCanvas()!.clientWidth) / eng.getRenderWidth();
      if (v.z > 0 && v.z < 1) { const locked = p.lockTime >= LOCK_TIME; Object.assign(this.lock.style, { display: 'block', left: v.x * s + 'px', top: v.y * s + 'px', borderColor: locked ? '#f00' : '#ff0' }); this.lock.textContent = locked ? 'LOCK' : ''; }
      else this.lock.style.display = 'none';
    } else this.lock.style.display = 'none';
    const r = this.rc; r.clearRect(0, 0, 160, 160); r.strokeStyle = 'rgba(0,255,0,.3)'; r.beginPath(); r.arc(80, 80, 40, 0, 7); r.stroke();
    r.fillStyle = '#0f0'; r.beginPath(); r.moveTo(80, 74); r.lineTo(76, 84); r.lineTo(84, 84); r.fill();
    const hd = Math.atan2(p.fwd.x, p.fwd.z), c = Math.cos(hd), s = Math.sin(hd);
    const dot = (x: number, z: number, col: string, sz: number) => { const dx = x - p.pos.x, dz = z - p.pos.z; let rx = (dx * c - dz * s) / 30, ry = -(dx * s + dz * c) / 30;
      const l = Math.hypot(rx, ry); if (l > 74) { rx *= 74 / l; ry *= 74 / l; } r.fillStyle = col; r.fillRect(80 + rx - sz / 2, 80 + ry - sz / 2, sz, sz); };
    r.font = '10px monospace'; r.fillStyle = 'rgba(0,255,0,.7)'; r.fillText(`${(1200 * NM).toFixed(1)} NM`, 84, 38); r.fillText(`${(2220 * NM).toFixed(1)}`, 128, 154);
    for (const e of enemies) if (e.alive) dot(e.pos.x, e.pos.z, e === L ? '#f0f' : '#f33', 6);
    for (const m of missiles) if (m.target === p) dot(m.a.pos.x, m.a.pos.z, '#ff0', 4);
  }
}
