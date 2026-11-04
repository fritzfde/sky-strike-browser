import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { Aircraft } from '../entities/Aircraft';
import { groundAt, height, WATER, WORLD, AIRFIELDS, RWY_HALF_W, RWY_HALF_L } from '../world/Terrain';
import { LOCK_TIME } from './WeaponSystem';
import { KT, FT, FPM, NM } from './FlightSystem';
const $ = (id: string) => document.getElementById(id)!;
const MAPN = 512, MPP = WORLD / MAPN; // terrain image: 512 px over the world, north (+Z) up
/** top-down shaded relief of the heightmap (water, lowlands, hills, snow) + runways, rendered once */
function terrainImage() {
  const cv = document.createElement('canvas'); cv.width = cv.height = MAPN; const g = cv.getContext('2d')!, im = g.createImageData(MAPN, MAPN);
  for (let j = 0; j < MAPN; j++) for (let i = 0; i < MAPN; i++) {
    const x = (i + .5) * MPP - WORLD / 2, z = WORLD / 2 - (j + .5) * MPP, h = height(x, z), o = (j * MAPN + i) * 4;
    let c: number[];
    if (h <= WATER) { const d = Math.min(1, (WATER - h) / 80); c = [20, 60 - d * 20, 120 - d * 30]; }
    else { const t = (h - WATER) / 450, sh = Math.max(.55, Math.min(1.25, 1 + (height(x - MPP, z + MPP) - h) * .02));
      c = t < .15 ? [190, 180, 120] : t < .45 ? [60 + t * 80, 120 - t * 30, 50] : t < .8 ? [110, 95, 70] : [225, 225, 230]; c = c.map(v => v * sh); }
    im.data[o] = c[0]; im.data[o + 1] = c[1]; im.data[o + 2] = c[2]; im.data[o + 3] = 255;
  }
  g.putImageData(im, 0, 0); g.fillStyle = '#ddd';
  for (const a of AIRFIELDS) g.fillRect((a.x - RWY_HALF_W * 2 + WORLD / 2) / MPP, (WORLD / 2 - a.z - RWY_HALF_L) / MPP, Math.max(2, RWY_HALF_W * 4 / MPP), RWY_HALF_L * 2 / MPP);
  return cv;
}
const toMap = (x: number, z: number) => [(x + WORLD / 2) / MPP, (WORLD / 2 - z) / MPP];
/** DOM HUD: compact center cluster near the jet, secondary data at the edges, terrain minimap (heading-up) and full map (M, north-up). */
export class HUD {
  private info = $('info'); private msg = $('msg'); private hp = $('hp'); private thr = $('thr'); private lock = $('lock');
  private rc = ($('radar') as HTMLCanvasElement).getContext('2d')!; private msgT = 0;
  private cl = $('cluster'); private mapEl = $('map') as HTMLCanvasElement; private mc = this.mapEl.getContext('2d')!; private terr = terrainImage();
  mapOpen = false; cockpit = false;
  toggleMap() { this.mapOpen = !this.mapOpen; this.mapEl.style.display = this.mapOpen ? 'block' : 'none'; }
  flash(t: string, dur = 2) { this.msg.textContent = t; this.msgT = dur; }
  update(p: Aircraft, enemies: Aircraft[], missiles: { a: Aircraft; target: Aircraft | null }[], score: number, wave: number, scene: Scene, cam: Camera, dt: number, persistent = '') {
    const agl = Math.round((p.pos.y - groundAt(p.pos.x, p.pos.z)) * FT); const incoming = missiles.some(m => m.target === p);
    const vs = Math.round((p.onGround ? 0 : p.vel.y) * FPM / 10) * 10, b = (t: string, c: string) => `<b style="color:${c}">${t}</b>`;
    const warnTxt = !p.onGround && p.stalled ? b(Math.abs(p.spinRate) > .8 ? 'SPIN' : 'STALL', '#f33') : !p.onGround && p.stallWarn ? b('AOA HIGH', '#fa0') : p.flapOver > 0 ? b('FLAP OVERSPEED', '#fa0') : '';
    const ball = (() => { const i = Math.round(Math.max(-1, Math.min(1, p.onGround ? 0 : p.beta * 6)) * 3) + 3; return '·······'.slice(0, i) + '●' + '·······'.slice(i + 1, 7); })();
    this.cl.style.display = this.cockpit ? 'none' : 'block';
    const tp = Math.round(p.throttle * 100), tcol = p.abLevel > .5 ? '#f80' : tp > 90 ? '#ff0' : tp > 60 ? '#0f0' : '#0af';
    this.cl.innerHTML = `<div class="hpb"><div style="width:${Math.max(0, p.hp)}%;background:${p.hp > 50 ? '#0f0' : p.hp > 25 ? '#ff0' : '#f00'}"></div><span>HP ${Math.max(0, Math.round(p.hp))}%</span></div>`
      + `<div class="tbar"><div class="tab" style="height:${p.abLevel * 100}%"></div><div class="tfill" style="height:${tp * .8}%;background:${tcol}"></div><div class="tmk"></div><span>${p.abLevel > .5 ? 'AB' : tp + '%'}</span></div>`
      + `<span class="big">${Math.round(p.speed * KT)}<small>kt</small></span><span class="big">${Math.round(p.pos.y * FT)}<small>ft</small></span><br>`
      + `GUN ${p.ammo} · <b class="cnt">MSL ${p.irMsl}×IR ${p.rdrMsl}×RDR</b> · <b class="cnt" style="color:${p.flares > 5 ? '#0f0' : '#f80'}">FLR ${p.flares}</b><br>FLP ${p.flapName} · α ${(p.aoa * 57.3).toFixed(0)}° · G ${p.gLoad.toFixed(1)} · ${ball}${warnTxt ? '<br>' + warnTxt : ''}`
      + (agl < 300 && !p.onGround && vs < -1500 && p.alive ? '<br>' + b('PULL UP!', '#f44') : '') + (p.threat === 2 ? '<br>' + `<b class="blink" style="color:#f22">MISSILE</b>` : p.threat === 1 ? '<br>' + b('LOCK', '#fa0') : '');
    const ta = $('threat'); ta.style.display = p.threat && p.alive ? 'block' : 'none'; ta.style.transform = `translate(-50%,-50%) rotate(${p.threatDir}rad) translateY(-130px)`; ta.style.color = p.threat === 2 ? '#f22' : '#fa0';
    this.info.innerHTML = `AGL ${agl} ft · VS ${vs > 0 ? '+' : ''}${vs} ft/min<br>AoA ${(p.aoa * 57.3).toFixed(1)}° · β ${(p.beta * 57.3).toFixed(0)}° · M ${(p.speed / 340).toFixed(2)}<br>`
      + `GEAR ${p.gear ? b('DN', '#4f4') : 'UP'} · FLAPS ${p.flapMode ? b(p.flapName, '#4f4') : 'AUTO'} · SPD BRK ${p.speedbrake ? b('OUT', '#fa4') : 'IN'} · BRK ${p.brakes ? b('ON', '#fa4') : 'OFF'}`
      + `<br>SCORE ${score} | WAVE ${wave}`;
    this.hp.style.width = Math.max(0, p.hp) + '%'; this.hp.style.background = p.hp > 50 ? '#0f0' : p.hp > 25 ? '#ff0' : '#f00'; this.thr.style.width = p.throttle * 100 + '%';
    this.msgT -= dt; if (persistent) this.msg.textContent = persistent; else if (this.msgT <= 0) this.msg.textContent = '';
    const L = p.lockTarget;
    if (L && p.alive) {
      const eng = scene.getEngine(); const v = Vector3.Project(L.pos, Matrix.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(eng.getRenderWidth(), eng.getRenderHeight()));
      const s = (eng.getRenderingCanvas()!.clientWidth) / eng.getRenderWidth();
      if (v.z > 0 && v.z < 1) { const locked = p.lockTime >= LOCK_TIME; Object.assign(this.lock.style, { display: 'block', left: v.x * s + 'px', top: v.y * s + 'px', borderColor: locked ? '#f00' : '#ff0' }); this.lock.innerHTML = `<div class="ehp"><div style="width:${Math.max(0, L.hp / L.maxHp * 100)}%"></div></div>${locked ? 'LOCK' : ''}<div class="ehpt">${Math.max(0, Math.round(L.hp / L.maxHp * 100))}% · ${(Vector3.Distance(L.pos, p.pos) * NM).toFixed(1)} NM</div>`; }
      else this.lock.style.display = 'none';
    } else this.lock.style.display = 'none';
    // ---- minimap: terrain + contacts, heading-up, 2.4 NM radius ----
    const r = this.rc, R = 90, SC = 50; r.clearRect(0, 0, 180, 180);
    const hd = Math.atan2(p.fwd.x, p.fwd.z), c = Math.cos(hd), s = Math.sin(hd), [px, pz] = toMap(p.pos.x, p.pos.z);
    r.save(); r.beginPath(); r.arc(R, R, R - 1, 0, 7); r.clip(); r.fillStyle = '#123'; r.fillRect(0, 0, 180, 180);
    r.translate(R, R); r.rotate(-hd); r.scale(MPP / SC, MPP / SC); r.globalAlpha = .85; r.drawImage(this.terr, -px, -pz); r.restore();
    r.strokeStyle = 'rgba(0,255,0,.35)'; r.beginPath(); r.arc(R, R, 45, 0, 7); r.stroke();
    r.fillStyle = '#0f0'; r.beginPath(); r.moveTo(R, R - 7); r.lineTo(R - 5, R + 5); r.lineTo(R + 5, R + 5); r.fill();
    const dot = (x: number, z: number, col: string, sz: number) => { const dx = x - p.pos.x, dz = z - p.pos.z; let rx = (dx * c - dz * s) / SC, ry = -(dx * s + dz * c) / SC;
      const l = Math.hypot(rx, ry); if (l > R - 6) { rx *= (R - 6) / l; ry *= (R - 6) / l; } r.fillStyle = col; r.strokeStyle = '#000'; r.fillRect(R + rx - sz / 2, R + ry - sz / 2, sz, sz); r.strokeRect(R + rx - sz / 2, R + ry - sz / 2, sz, sz); };
    for (const e of enemies) if (e.alive) dot(e.pos.x, e.pos.z, e === L ? '#f0f' : '#f33', 6);
    for (const m of missiles) dot(m.a.pos.x, m.a.pos.z, m.target === p ? '#ff0' : '#fff', 3);
    r.font = 'bold 10px monospace'; r.fillStyle = '#0f0'; r.fillText(`${(45 * SC * NM).toFixed(1)} NM`, R + 3, R - 47); r.fillText(`${((R - 6) * SC * NM).toFixed(1)} NM`, 4, 176);
    const nx = R - s * (R - 10), ny = R - c * (R - 10); r.fillStyle = '#fff'; r.fillText('N', nx - 3, ny + 4);
    if (this.mapOpen) this.drawMap(p, enemies, missiles);
  }
  /** full north-up map on the right half of the screen */
  private drawMap(p: Aircraft, enemies: Aircraft[], missiles: { a: Aircraft; target: Aircraft | null }[]) {
    const el = this.mapEl, w = el.clientWidth, h = el.clientHeight; if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
    const g = this.mc, sz = Math.min(w, h) - 40, ox = (w - sz) / 2, oy = (h - sz) / 2, k = sz / MAPN;
    g.fillStyle = 'rgba(0,10,20,.85)'; g.fillRect(0, 0, w, h); g.drawImage(this.terr, ox, oy, sz, sz); g.strokeStyle = '#0f0'; g.strokeRect(ox, oy, sz, sz);
    const P = (x: number, z: number) => { const [u, v] = toMap(x, z); return [ox + u * k, oy + v * k]; };
    g.font = 'bold 13px monospace'; g.textAlign = 'left';
    for (const a of AIRFIELDS) { const [x, y] = P(a.x, a.z); g.fillStyle = '#000'; g.fillText(a.name, x + 9, y + 1); g.fillStyle = '#ff0'; g.fillText(a.name, x + 8, y); }
    for (const e of enemies) if (e.alive) { const [x, y] = P(e.pos.x, e.pos.z); g.fillStyle = '#f33'; g.fillRect(x - 4, y - 4, 8, 8); }
    for (const m of missiles) { const [x, y] = P(m.a.pos.x, m.a.pos.z); g.fillStyle = m.target === p ? '#ff0' : '#fff'; g.fillRect(x - 2, y - 2, 4, 4); }
    const [x, y] = P(p.pos.x, p.pos.z), hd = Math.atan2(p.fwd.x, p.fwd.z); g.save(); g.translate(x, y); g.rotate(hd); g.fillStyle = '#0ff'; g.strokeStyle = '#000';
    g.beginPath(); g.moveTo(0, -11); g.lineTo(-7, 8); g.lineTo(0, 4); g.lineTo(7, 8); g.closePath(); g.fill(); g.stroke(); g.restore();
    const nm = 1852 * k / MPP, bx = ox + 12, by = oy + sz - 14; g.strokeStyle = g.fillStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + nm, by); g.moveTo(bx, by - 5); g.lineTo(bx, by + 5); g.moveTo(bx + nm, by - 5); g.lineTo(bx + nm, by + 5); g.stroke(); g.lineWidth = 1;
    g.fillText('1 NM', bx + nm + 6, by + 4); g.textAlign = 'center'; g.font = 'bold 16px monospace'; g.fillText('N ▲', ox + sz / 2, oy + 18);
    g.font = '12px monospace'; g.fillText(`MAP (M to close) · ${(WORLD * NM).toFixed(1)} × ${(WORLD * NM).toFixed(1)} NM`, ox + sz / 2, oy + sz + 15);
  }
}
