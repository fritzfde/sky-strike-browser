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
export interface Missile { m: InstancedMesh; a: Aircraft; target: Aircraft | null; life: number; owner: Aircraft; trail?: ParticleSystem; }
export const LOCK_TIME = 1, LOCK_RANGE = 2500, LOCK_CONE = .97;
/** Guns (pooled tracer instances) + homing missiles (pooled, steer via same Aircraft model). */
export class WeaponSystem {
  bullets: Pool<Bullet>; bulletsRed: Pool<Bullet>; missiles: Pool<Missile>;
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
    this.missiles = new Pool<Missile>(() => { const m = mb.createInstance('m'); const node = m; node.rotationQuaternion = Quaternion.Identity(); return { m, a: new Aircraft(node, 'blue'), target: null, life: 0, owner: null! }; },
      x => x.m.setEnabled(true), x => x.m.setEnabled(false), 20);
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
    if (c.fireMissile && a.missileCd <= 0 && a.missiles > 0) { a.missileCd = 1; a.missiles--; this.launch(a, a.lockTime >= LOCK_TIME ? a.lockTarget : null); }
  }
  launch(a: Aircraft, target: Aircraft | null) {
    const m = this.missiles.acquire(); m.owner = a; m.target = target; m.life = a.isPlayer ? 8 : 6;
    m.a.pos.copyFrom(a.pos).addInPlace(a.up.scale(-2)); m.a.rot.copyFrom(a.rot); m.a.speed = a.speed + 80; m.a.alive = true;
    m.trail = this.fx.startTrail(m.a.pos); if (a.isPlayer || target?.isPlayer) this.audio.missile();
  }
  incomingFor(a: Aircraft) { return this.missiles.active.some(m => m.target === a); }
  update(dt: number) {
    const targets = this.getTargets(); const tmp = new Vector3();
    for (const pool of [this.bullets, this.bulletsRed]) for (let i = pool.active.length - 1; i >= 0; i--) {
      const b = pool.active[i]; b.vel.scaleToRef(dt, tmp); b.m.position.addInPlace(tmp); b.life -= dt; let hit = false;
      for (const t of targets) if (t.alive && t.team !== b.owner.team && Vector3.DistanceSquared(t.pos, b.m.position) < 81) {
        hit = true; this.fx.spark(b.m.position); this.damage(t, t.isPlayer ? 3 : 4, b.owner); break; }
      if (hit || b.life < 0 || b.m.position.y < groundAt(b.m.position.x, b.m.position.z)) pool.release(b);
    }
    for (let i = this.missiles.active.length - 1; i >= 0; i--) {
      const m = this.missiles.active[i]; const ma = m.a; m.life -= dt; ma.updateAxes();
      if (m.target?.alive) { // proportional-ish pursuit with turn-rate limit
        const to = m.target.pos.subtract(ma.pos).normalize(); const inv = Quaternion.Inverse(ma.rot); const loc = new Vector3(); to.rotateByQuaternionToRef(inv, loc);
        const rate = (m.owner.isPlayer ? 2.6 : 1.5) * dt;
        rotLocal(ma, AX, -Math.max(-1, Math.min(1, loc.y * 4)) * rate); rotLocal(ma, AY, Math.max(-1, Math.min(1, loc.x * 4)) * rate); ma.updateAxes();
      }
      ma.speed = Math.min(ma.speed + 120 * dt, 520); ma.pos.addInPlace(ma.fwd.scale(ma.speed * dt));
      let done = m.life < 0 || ma.pos.y < groundAt(ma.pos.x, ma.pos.z);
      for (const t of targets) if (!done && t.alive && t.team !== m.owner.team && Vector3.DistanceSquared(t.pos, ma.pos) < 196) { this.damage(t, t.isPlayer ? 45 : 100, m.owner); done = true; }
      if (done) { this.fx.explosion(ma.pos, .5); this.audio.explosion(.4); if (m.trail) this.fx.stopTrail(m.trail); m.trail = undefined; this.missiles.release(m); }
    }
  }
  damage(t: Aircraft, amt: number, by: Aircraft) {
    if (!t.alive) return; t.hp -= amt; this.onDamage?.(t, amt);
    if (t.hp <= 0) { t.alive = false; this.onKill?.(t, by); }
  }
}
