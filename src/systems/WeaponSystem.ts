import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { Pool } from '../core/Pool';
import { Aircraft } from '../entities/Aircraft';
import { Effects } from './Effects';
import { AudioSystem } from './AudioSystem';
import { groundAt } from '../world/Terrain';
import { rotLocal, AX, AY } from './FlightSystem';
interface Bullet { m: InstancedMesh; vel: Vector3; life: number; owner: Aircraft; }
export interface Missile { m: InstancedMesh; a: Aircraft; target: Aircraft | null; life: number; owner: Aircraft; trail?: ParticleSystem; age: number; decoy: Flare | null; vel: Vector3; kind: 'ir' | 'rdr'; aLat: number; }
interface Flare { m: InstancedMesh; pos: Vector3; vel: Vector3; life: number; trail?: ParticleSystem; }
export const FLARES = 30;
export const LOCK_TIME = 1, LOCK_RANGE = 6000, IR_RANGE = 3000, LOCK_CONE = .97;
/** missile kinematics: boost (s, m/s²), max lateral G, seeker half-angle (rad), max flight time */
export const MSL = { ir: { burn: 2.5, acc: 230, g: 35, fov: .7, life: 14, track: .45 }, rdr: { burn: 4, acc: 190, g: 30, fov: .9, life: 22, track: .35 } };
export const DMG_MISSILE = 60, DMG_GUN = 3.5, PROX = 11;
/** Guns (pooled tracer instances) + homing missiles (pooled, steer via same Aircraft model). */
export class WeaponSystem {
  flares: Pool<Flare>; decoyed = 0; now = 0; bullets: Pool<Bullet>; bulletsRed: Pool<Bullet>; missiles: Pool<Missile>;
  onKill?: (victim: Aircraft, killer: Aircraft) => void;
  onDamage?: (victim: Aircraft, amount: number) => void;
  constructor(private scene: Scene, private fx: Effects, private audio: AudioSystem, private getTargets: () => Aircraft[]) {
    const tracerB = this.tracer('tb', new Color3(1, 1, .4)), tracerR = this.tracer('tr', new Color3(1, .35, .2));
    const mb = MeshBuilder.CreateCylinder('msl', { diameter: .5, height: 4, tessellation: 6 }, scene); mb.rotation.x = Math.PI / 2; mb.bakeCurrentTransformIntoVertices();
    const mm = new StandardMaterial('mm', scene); mm.diffuseColor = new Color3(.9, .9, .9); mb.material = mm; mb.isVisible = false;
    this.bullets = new Pool<Bullet>(() => ({ m: tracerB.createInstance('b'), vel: new Vector3(), life: 0, owner: null! }),
      b => b.m.setEnabled(true), b => b.m.setEnabled(false), 300);
    this.bulletsRed = new Pool<Bullet>(() => ({ m: tracerR.createInstance('br'), vel: new Vector3(), life: 0, owner: null! }),
      b => b.m.setEnabled(true), b => b.m.setEnabled(false), 100);
    for (const b of [...(this.bulletsRed as any).free]) b.m.setEnabled(false);
    this.missiles = new Pool<Missile>(() => { const m = mb.createInstance('m'); const node = m; node.rotationQuaternion = Quaternion.Identity(); return { m, a: new Aircraft(node, 'blue'), target: null, life: 0, owner: null!, age: 0, decoy: null, vel: new Vector3(), kind: 'ir', aLat: 0 }; },
      x => x.m.setEnabled(true), x => x.m.setEnabled(false), 20);
    const fb = MeshBuilder.CreateSphere('flare', { diameter: 1.6, segments: 6 }, scene), fm = new StandardMaterial('fm', scene);
    fm.emissiveColor = new Color3(1, .95, .7); fm.disableLighting = true; fb.material = fm; fb.isVisible = false;
    this.flares = new Pool<Flare>(() => ({ m: fb.createInstance('f'), pos: new Vector3(), vel: new Vector3(), life: 0 }), f => f.m.setEnabled(true), f => f.m.setEnabled(false), 12);
    for (const b of [...(this.flares as any).free]) b.m.setEnabled(false);
    for (const b of [...(this.bullets as any).free]) b.m.setEnabled(false);
    for (const b of [...(this.missiles as any).free]) b.m.setEnabled(false);
  }
  private tracer(n: string, c: Color3) {
    const t = MeshBuilder.CreateBox(n, { width: .35, height: .35, depth: 7 }, this.scene); const m = new StandardMaterial(n + 'm', this.scene);
    m.emissiveColor = c; m.disableLighting = true; t.material = m; t.isVisible = false; return t;
  }
  /** Lock-on: target nearest to boresight inside cone & range, must be held LOCK_TIME. */
  updateLock(a: Aircraft, dt: number) {
    let best: Aircraft | null = null, bd = LOCK_CONE;
    for (const e of this.getTargets()) { if (!e.alive || e.team === a.team) continue; const to = e.pos.subtract(a.pos); const d = to.length(); if (d > LOCK_RANGE) continue;
      const dot = Vector3.Dot(to.scaleInPlace(1 / d), a.fwd); if (dot > bd) { bd = dot; best = e; } }
    if (best && best === a.lockTarget) a.lockTime += dt; else { a.lockTarget = best; a.lockTime = 0; }
  }
  fire(a: Aircraft, dt: number) {
    a.gunCd -= dt; a.missileCd -= dt; const c = a.ctrl;
    if (c.fireGun && a.gunCd <= 0 && a.ammo > 0) {
      a.gunCd = a.isPlayer ? .06 : .15; a.ammo--; const b = (a.team === 'red' ? this.bulletsRed : this.bullets).acquire();
      b.owner = a; b.life = 2; b.m.position.copyFrom(a.pos).addInPlace(a.fwd.scale(10)).addInPlaceFromFloats((Math.random() - .5) * .8, (Math.random() - .5) * .8, 0);
      b.m.rotationQuaternion = a.rot.clone(); const spr = a.isPlayer ? .004 : (1 - a.skill) * .03 + .006; b.vel.copyFrom(a.fwd).addInPlaceFromFloats((Math.random() - .5) * spr, (Math.random() - .5) * spr, (Math.random() - .5) * spr).normalize().scaleInPlace(a.speed + 750);
      if (a.isPlayer) this.audio.gun();
    }
    if (c.fireMissile && a.missileCd <= 0 && a.missiles > 0) {
      const t = a.lockTime >= LOCK_TIME ? a.lockTarget : null, d = t ? Vector3.Distance(t.pos, a.pos) : 0;
      const kind: 'ir' | 'rdr' = (t && d > IR_RANGE && a.rdrMsl > 0) || a.irMsl === 0 ? 'rdr' : 'ir';   // radar missile beyond IR range
      if (kind === 'ir') a.irMsl--; else a.rdrMsl--; a.missileCd = 1; this.launch(a, t && (kind === 'rdr' || d <= IR_RANGE) ? t : null, kind);
    }
  }
  /** Flare salvo (2), 0.5 s cooldown. Each IR missile guiding on `a` may be seduced: more likely early in its flight, when close, and when the flare is inside its seeker cone. */
  dropFlares(a: Aircraft) {
    if (!a.alive || a.flares <= 0 || a.flareCd > 0) return false; a.flareCd = .5; let last: Flare | null = null; a.updateAxes();
    for (let k = 0; k < 2 && a.flares > 0; k++) {
      a.flares--; const f = this.flares.acquire(); f.life = 3.2; f.pos.copyFrom(a.pos).addInPlace(a.up.scale(-1.5)).addInPlace(a.fwd.scale(-4));
      f.vel.copyFrom(a.fwd.scale(a.speed * .6)).addInPlace(a.right.scale((k ? 1 : -1) * 18)).addInPlace(a.up.scale(-12)); f.m.position.copyFrom(f.pos);
      f.trail = this.fx.startTrail(f.pos); last = f;
    }
    if (a.isPlayer || a.team === 'red') this.audio.flare?.();
    for (const m of this.missiles.active) if (m.target === a && last && !m.decoy && m.kind === 'ir') {
      const to = last.pos.subtract(m.a.pos), d = to.length(); m.a.updateAxes(); const inCone = Vector3.Dot(to.scaleInPlace(1 / Math.max(1, d)), m.a.fwd);
      const pr = (.3 + (m.age < 1.5 ? .25 : 0) + (d < 900 ? .3 : d < 1600 ? .12 : 0)) * (inCone > .85 ? 1 : inCone > .5 ? .6 : .25);
      if (Math.random() < pr) { m.decoy = last; m.target = null; this.decoyed++; }
    }
    return true;
  }
  launch(a: Aircraft, target: Aircraft | null, kind: 'ir' | 'rdr' = 'ir') {
    const m = this.missiles.acquire(); m.owner = a; m.target = target; m.age = 0; m.decoy = null; m.kind = kind; m.life = MSL[kind].life; m.aLat = 0;
    a.updateAxes(); m.a.pos.copyFrom(a.pos).addInPlace(a.up.scale(-2)); m.a.rot.copyFrom(a.rot); m.a.alive = true; m.vel.copyFrom(a.fwd.scale(Math.max(a.vel.length(), 60) + 25)); m.a.speed = m.vel.length();
    m.trail = this.fx.startTrail(m.a.pos); if (a.isPlayer || target?.isPlayer) this.audio.missile();
  }
  incomingFor(a: Aircraft) { return this.missiles.active.some(m => m.target === a); }
  update(dt: number) {
    this.now += dt;
    for (const a of this.getTargets()) if (a.alive && a.hp < a.maxHp && this.now - a.lastHit > 5) a.hp = Math.min(a.maxHp, a.hp + 3 * dt); // regen after 5 s
    this.updateFlares(dt); for (const a of this.getTargets()) a.flareCd -= dt;
    const targets = this.getTargets(); const tmp = new Vector3();
    for (const pool of [this.bullets, this.bulletsRed]) for (let i = pool.active.length - 1; i >= 0; i--) {
      const b = pool.active[i]; b.vel.scaleToRef(dt, tmp); b.m.position.addInPlace(tmp); b.life -= dt; let hit = false;
      for (const t of targets) if (t.alive && t.team !== b.owner.team && Vector3.DistanceSquared(t.pos, b.m.position) < 81) {
        hit = true; this.fx.spark(b.m.position); this.damage(t, DMG_GUN, b.owner); break; }
      if (hit || b.life < 0 || b.m.position.y < groundAt(b.m.position.x, b.m.position.z)) pool.release(b);
    }
    for (let i = this.missiles.active.length - 1; i >= 0; i--) {
      const m = this.missiles.active[i]; const ma = m.a; m.life -= dt; m.age += dt; ma.updateAxes();
      if (m.decoy && m.decoy.life <= 0) m.decoy = null;
      const t = m.target, aim = m.decoy ? m.decoy.pos : t?.alive ? t.pos : null;
      if (t && !t.isPlayer && t.alive && t.skill > .55 && t.flares > 0 && m.age > .6 && Vector3.DistanceSquared(t.pos, ma.pos) < 1.4e6 && Math.random() < dt * 2 * t.skill) this.dropFlares(t); // AI flares (later waves)
      const K = MSL[m.kind], v = m.vel.length(), vd = m.vel.scale(1 / Math.max(1, v)), acc = new Vector3();
      if (aim) { // proportional navigation: a = N · Vc · (LOS rate), limited to max G and seeker field of view
        const rel = aim.subtract(ma.pos), R = rel.length(), los = rel.scale(1 / Math.max(1, R));
        const tv = m.decoy ? m.decoy.vel : t!.vel, vr = tv.subtract(m.vel), losRate = Vector3.Cross(los, vr).scaleInPlace(1 / Math.max(1, R)); // ω = (r × v)/|r|²
        const Vc = -Vector3.Dot(vr, los);
        if (Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(vd, los)))) > K.fov) { m.target = null; m.decoy = null; (m as any).why = 'fov'; }      // target left the seeker FOV → lost
        else if (m.age > .8 && losRate.length() > K.track) { m.target = null; m.decoy = null; (m as any).why = 'track'; }                // seeker gimbal can't follow a hard break at close range
        else if (m.kind === 'rdr' && t && !m.decoy && Math.abs(Vector3.Dot(tv, los)) < 60 && t.speed > 80 && Math.random() < dt * 2) { m.target = null; (m as any).why = 'notch'; } // beam/notch: no Doppler
        else { acc.copyFrom(Vector3.Cross(losRate, vd)).scaleInPlace(4 * Math.max(Vc, 150)); acc.y += 9.81 * (1 - vd.y * vd.y); // gravity compensation                                  // a ⟂ v, N = 4
          const lim = K.g * 9.81 * Math.min(1, (v / 650) ** 2); const al = acc.length(); if (al > lim) acc.scaleInPlace(lim / al); }
      }
      m.aLat = acc.length() / 9.81;
      const thrust = m.age < K.burn ? K.acc : 0, drag = .00011 * Math.exp(-ma.pos.y / 9000) * v * v + .06 * acc.length();       // induced drag: hard turns bleed missile energy
      acc.addInPlace(vd.scale(thrust - drag)); acc.y -= 9.81; m.vel.addInPlace(acc.scaleInPlace(dt));
      ma.pos.addInPlace(m.vel.scale(dt)); ma.speed = m.vel.length();
      { const d = m.vel.scale(1 / Math.max(1, ma.speed)); Quaternion.RotationYawPitchRollToRef(Math.atan2(d.x, d.z), -Math.asin(Math.max(-1, Math.min(1, d.y))), 0, ma.rot); } ma.updateAxes();
      if (ma.speed < 140 && m.age > K.burn) m.life = Math.min(m.life, .1);                                                       // out of energy
      let done = m.life < 0 || ma.pos.y < groundAt(ma.pos.x, ma.pos.z);
      for (const t of targets) if (!done && m.age > .4 && t.alive && t.team !== m.owner.team && Vector3.DistanceSquared(t.pos, ma.pos) < PROX * PROX) { this.damage(t, DMG_MISSILE, m.owner); done = true; (m as any).why = 'hit'; } // proximity fuse
      if (done) { this.fx.explosion(ma.pos, .5); this.audio.explosion(.4); if (m.trail) this.fx.stopTrail(m.trail); m.trail = undefined; this.missiles.release(m); }
    }
  }
  updateFlares(dt: number) {
    for (let i = this.flares.active.length - 1; i >= 0; i--) { const f = this.flares.active[i]; f.life -= dt;
      f.vel.scaleInPlace(1 - Math.min(1, dt * 1.2)); f.vel.y -= 9.81 * dt; f.pos.addInPlace(f.vel.scale(dt)); f.m.position.copyFrom(f.pos);
      const s = Math.max(.2, Math.min(1, f.life / 1.5)) * (.8 + Math.random() * .4); f.m.scaling.setAll(s);
      if (f.life <= 0) { if (f.trail) this.fx.stopTrail(f.trail); f.trail = undefined; this.flares.release(f); } }
  }
  damage(t: Aircraft, amt: number, by: Aircraft) {
    if (!t.alive) return; t.hp -= amt; t.lastHit = this.now; this.onDamage?.(t, amt);
    if (t.hp <= 0) { t.alive = false; this.onKill?.(t, by); }
  }
}
