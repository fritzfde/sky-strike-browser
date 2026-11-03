import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Aircraft } from '../entities/Aircraft';
import { groundAt, runwayAt, airfieldAt } from '../world/Terrain';
const tq = new Quaternion();
/** Local-axis rotation (post-multiply). Babylon is left-handed: +X right, +Y up, +Z forward. */
export function rotLocal(a: Aircraft, axis: Vector3, ang: number) { Quaternion.RotationAxisToRef(axis, ang, tq); a.rot.multiplyInPlace(tq); }
export const AX = new Vector3(1, 0, 0), AY = new Vector3(0, 1, 0), AZ = new Vector3(0, 0, 1);
// --- tuning (SI-ish, m/s) ---
export const G = 9.81, V_STALL = 62, V_ROTATE = 68, GEAR_H = 2.6, BELLY_H = 1.4;
const THRUST = 9, THRUST_AB = 7, CD = 1.95e-4, CD_GEAR = 1.1e-4, ROLL_FRICTION = .3, BRAKE_DECEL = 7;
export const SAFE_LAND = { maxSink: 6, maxSpeed: 105, maxBankDeg: 12, minPitchDeg: -4, maxPitchDeg: 18 };
const DEG = 180 / Math.PI;
export const pitchDeg = (a: Aircraft) => Math.asin(Math.max(-1, Math.min(1, a.fwd.y))) * DEG;
export const bankDeg = (a: Aircraft) => Math.atan2(-a.right.y, a.up.y) * DEG;
/**
 * Arcade-sim flight model:
 *  - thrust along nose, quadratic drag (+gear drag), gravity
 *  - lift cancels gravity in proportion to (v/Vstall)^2 * up.y (so banking/inverting sinks)
 *  - velocity vector is pulled toward the nose (aero alignment) — weaker when slow
 *  - stall below V_STALL: nose drops, controls go mushy
 *  - ground roll with brakes, nosewheel steering, rotation & liftoff; touchdown checks
 */
export class FlightSystem {
  onCrash?: (a: Aircraft, reason: string) => void;
  onLand?: (a: Aircraft) => void;
  private tmp = new Vector3(); private dir = new Vector3();
  update(list: Aircraft[], dt: number) {
    for (const a of list) {
      if (!a.alive) continue;
      const c = a.ctrl;
      a.throttle = Math.min(1, Math.max(0, a.throttle + c.throttle * dt * .5));
      a.afterburner = c.afterburner && a.throttle > .9;
      if (a.onGround) this.ground(a, dt); else this.air(a, dt);
      a.speed = a.vel.length();
      const fl = a.flame, t = a.throttle + (a.afterburner ? .9 : 0);
      fl.scaling.y = .15 + t * (0.8 + Math.random() * .2); fl.scaling.x = fl.scaling.z = .5 + t * .35; fl.setEnabled(t > .05);
    }
  }
  private air(a: Aircraft, dt: number) {
    const c = a.ctrl; a.updateAxes();
    const v = a.vel.length() || .001; this.dir.copyFrom(a.vel).scaleInPlace(1 / v);
    const liftF = Math.min(1, (v / V_STALL) ** 2);
    a.stalled = v < V_STALL * .95;
    // control authority scales with dynamic pressure
    const auth = Math.min(1, Math.max(.15, (v / 110) ** 2)), slowAuth = a.stalled ? .4 : 1;
    rotLocal(a, AX, -c.pitch * 1.0 * auth * slowAuth * dt);
    rotLocal(a, AZ, c.roll * 2.4 * auth * dt);
    rotLocal(a, AY, c.yaw * .35 * auth * dt);
    a.updateAxes();
    // bank -> turn (lift vector tilt), weathervane yaw into the wind
    rotLocal(a, AY, -a.right.y * .55 * liftF * dt);
    if (a.stalled) { // nose drops toward the velocity vector / ground
      const k = (1 - v / V_STALL) * 1.8 + .3; rotLocal(a, AX, Math.max(0, a.fwd.y + .3) * k * dt);
    }
    a.rot.normalize(); a.updateAxes();
    // forces
    const thrust = a.throttle * THRUST + (a.afterburner ? THRUST_AB : 0);
    const drag = (CD + (a.gear ? CD_GEAR : 0)) * v * v;
    a.vel.addInPlace(a.fwd.scale(thrust * dt));
    a.vel.addInPlace(this.dir.scale(-drag * dt));
    a.vel.addInPlace(this.dir.scale(-G * this.dir.y * dt)); // climbing bleeds speed, diving gains it
    a.vel.y -= G * (1 - liftF * Math.max(0, a.up.y)) * dt;    // unsupported weight (slow / banked / inverted)
    // aero alignment: velocity follows the nose (this is what makes pulling turn/climb, and climbing trades speed via gravity)
    const nv = a.vel.length(); this.dir.copyFrom(a.vel).scaleInPlace(1 / (nv || 1));
    const k = Math.min(1, 2.6 * liftF * dt);
    Vector3.LerpToRef(this.dir, a.fwd, k, this.tmp); this.tmp.normalize().scaleInPlace(nv); a.vel.copyFrom(this.tmp);
    a.pos.addInPlace(a.vel.scale(dt));
    if (a.pos.y > 3500) { a.pos.y = 3500; a.vel.y = Math.min(0, a.vel.y); }
    const lim = 5800; a.pos.x = Math.max(-lim, Math.min(lim, a.pos.x)); a.pos.z = Math.max(-lim, Math.min(lim, a.pos.z));
    // ground contact
    const gy = groundAt(a.pos.x, a.pos.z);
    if (a.pos.y < gy + (a.gear ? GEAR_H : BELLY_H)) this.touchdown(a, gy);
  }
  /** Decide safe landing vs crash at the moment of ground contact. */
  touchdown(a: Aircraft, gy: number) {
    a.updateAxes();
    const sink = -a.vel.y, spd = a.vel.length(), bank = Math.abs(bankDeg(a)), pitch = pitchDeg(a), rw = runwayAt(a.pos.x, a.pos.z), L = SAFE_LAND;
    const reason = !rw ? 'CRASHED — not on a runway' : !a.gear ? 'CRASHED — gear up (G)' : sink > L.maxSink ? `CRASHED — sink rate ${sink.toFixed(1)} m/s` :
      spd > L.maxSpeed ? `CRASHED — too fast (${Math.round(spd * 3.6)} km/h)` : bank > L.maxBankDeg ? `CRASHED — wings not level` :
      pitch < L.minPitchDeg || pitch > L.maxPitchDeg ? 'CRASHED — bad attitude' : '';
    if (reason) { a.pos.y = gy + 1; this.onCrash?.(a, reason); return; }
    a.onGround = true; a.heading = Math.atan2(a.fwd.x, a.fwd.z); a.groundPitch = Math.min(0, -pitch / DEG);
    const h = Math.hypot(a.vel.x, a.vel.z); a.vel.set(Math.sin(a.heading) * h, 0, Math.cos(a.heading) * h); a.pos.y = gy + GEAR_H; a.stalled = false;
    this.onLand?.(a);
  }
  private ground(a: Aircraft, dt: number) {
    const c = a.ctrl; let s = Math.hypot(a.vel.x, a.vel.z);
    const thrust = a.throttle * THRUST + (a.afterburner ? THRUST_AB : 0);
    s += (thrust - (CD + CD_GEAR) * s * s - ROLL_FRICTION - (a.brakes || c.brake ? BRAKE_DECEL * Math.min(1, s / 3 + .2) : 0)) * dt;
    if (a.brakes && thrust < 2 && s < .5) s = 0; s = Math.max(0, s);
    a.heading += c.yaw * .6 * Math.min(1, s / 8) * Math.max(.2, 1 - s / 90) * dt; // nosewheel steering, weaker at speed
    // rotation: nose up only when fast enough
    const want = c.pitch > 0 && s > V_ROTATE * .9 ? -.22 : c.pitch > 0 ? -.03 : 0;
    a.groundPitch += (want - a.groundPitch) * Math.min(1, dt * 2.5);
    Quaternion.RotationYawPitchRollToRef(a.heading, a.groundPitch, 0, a.rot);
    a.vel.set(Math.sin(a.heading) * s, 0, Math.cos(a.heading) * s);
    a.pos.addInPlace(a.vel.scale(dt));
    a.pos.y = groundAt(a.pos.x, a.pos.z) + GEAR_H;
    a.stalled = false; a.updateAxes();
    if (!airfieldAt(a.pos.x, a.pos.z) && s > 22) { this.onCrash?.(a, 'CRASHED — ran off the runway'); return; }
    if (s > V_STALL && a.groundPitch < -.12) { // liftoff
      a.onGround = false; a.everAirborne = true; a.vel.copyFrom(a.fwd).scaleInPlace(s); a.vel.y += 1.5; a.pos.y += .3;
    }
  }
}
