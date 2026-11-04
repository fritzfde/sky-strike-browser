import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Aircraft } from '../entities/Aircraft';
import { groundAt, runwayAt, airfieldAt } from '../world/Terrain';
const tq = new Quaternion();
/** Local-axis rotation (post-multiply). Babylon is left-handed: +X right, +Y up, +Z forward. Rotation about X: negative = nose up. */
export function rotLocal(a: Aircraft, axis: Vector3, ang: number) { Quaternion.RotationAxisToRef(axis, ang, tq); a.rot.multiplyInPlace(tq); }
export const AX = new Vector3(1, 0, 0), AY = new Vector3(0, 1, 0), AZ = new Vector3(0, 0, 1);
// ---------- airframe (light-weight F-16-class, SI units internally) ----------
export const G = 9.81, MASS = 12000, WING_AREA = 28, GEAR_H = 2.6, BELLY_H = 1.4;
export const T_MIL = 64000, T_AB = 42000, T_IDLE = .04;            // N; T/W with AB ≈ 0.9
export const CL_ALPHA = 4.6, ALPHA_CRIT = .36, CL_FLAPS = .35;      // per rad; ~20.6° critical AoA
const CD0 = .021, K_IND = .11, CD_GEAR = .02, CD_FLAPS = .03, CD_SB = .075;
const CY_BETA = 1.6, DIHEDRAL = 1.3, BETA_RUD = .21, WARN_MARGIN = .045; // side force / dihedral / full-rudder β (≈12°) / stall-warning margin (2.5°)
const MU_ROLL = .025, MU_BRAKE = .42;
export const V_ROTATE = 62;                                         // m/s (≈120 kt) earliest rotation
export const SAFE_LAND = { maxSink: 5, maxSpeed: 100, maxBankDeg: 12, minPitchDeg: -4, maxPitchDeg: 18 };
export const KT = 1.943844, FT = 3.28084, NM = 1 / 1852, FPM = 196.85;
const DEG = 180 / Math.PI, W = MASS * G;
export const pitchDeg = (a: Aircraft) => Math.asin(Math.max(-1, Math.min(1, a.fwd.y))) * DEG;
export const bankDeg = (a: Aircraft) => Math.atan2(-a.right.y, a.up.y) * DEG;
export const rho = (y: number) => 1.225 * Math.exp(-Math.max(0, y) / 9000);
/** lift coefficient vs AoA: linear to critical AoA, then post-stall drop */
export function liftCoef(alpha: number, flaps: number) {
  const s = Math.sign(alpha), aa = Math.abs(alpha);
  const cl = aa <= ALPHA_CRIT ? CL_ALPHA * aa : CL_ALPHA * ALPHA_CRIT * Math.max(.45, 1 - (aa - ALPHA_CRIT) * 2.2);
  return s * cl + CL_FLAPS * flaps * Math.max(0, Math.cos(alpha));
}
/** 1-g stall speed (m/s) for the current config */
export const stallSpeed = (a: Aircraft, y = a.pos.y) => Math.sqrt(2 * W / (rho(y) * WING_AREA * (CL_ALPHA * ALPHA_CRIT + CL_FLAPS * a.flapPos)));
const toward = (v: number, t: number, r: number) => v + Math.max(-r, Math.min(r, t - v));
/**
 * Flight model (per aircraft, per frame):
 *  forces: thrust (spooling engine, AB, altitude lapse) · lift = q·S·CL(α) ⟂ velocity · drag = q·S·(CD0 + k·CL² + gear/flaps/speed-brake + wave + sideslip) · side force from β · gravity.
 *  attitude: body follows its velocity vector (weathervane stability) + fly-by-wire AoA command:
 *    neutral stick holds ~1 g, full aft stick commands max AoA limited to 9 g (so it CAN stall at low speed), push → negative g.
 *  rudder commands sideslip (yaw stability pulls it back), ailerons roll rate. Authority scales with dynamic pressure.
 *  ground: thrust vs rolling friction / wheel brakes (friction from weight on wheels), nosewheel steering, rotation, liftoff when lift ≥ weight.
 */
export class FlightSystem {
  onCrash?: (a: Aircraft, reason: string) => void;
  onLand?: (a: Aircraft) => void;
  private vd = new Vector3(); private vd0 = new Vector3(); private t1 = new Vector3(); private t2 = new Vector3(); private dq = new Quaternion();
  update(list: Aircraft[], dt: number) {
    for (const a of list) {
      if (!a.alive) continue;
      const c = a.ctrl, sm = a.sm, r = 3.2 * dt; // keyboard smoothing (≈0.3 s to full deflection)
      sm.p = toward(sm.p, c.pitch, r); sm.r = toward(sm.r, c.roll, r * 1.3); sm.y = toward(sm.y, c.yaw, r);
      a.throttle = Math.min(1, Math.max(0, a.throttle + c.throttle * dt * 1.2));
      a.afterburner = c.afterburner && a.throttle > .9;
      a.n += (a.throttle - a.n) * Math.min(1, dt * 2.2);                         // engine spool ≈ 1.4 s to 95%
      a.abLevel = toward(a.abLevel, a.afterburner && a.n > .85 ? 1 : 0, dt * 2.5); // AB light-up ≈ 0.4 s
      a.flapPos = toward(a.flapPos, a.flaps ? 1 : 0, dt * .5); a.sbPos = toward(a.sbPos, a.speedbrake ? 1 : 0, dt * 1.2);
      if (a.onGround) this.ground(a, dt); else this.air(a, dt);
      a.speed = a.vel.length();
      this.animate(a);
    }
  }
  thrust(a: Aircraft) { return (T_MIL * (T_IDLE + (1 - T_IDLE) * a.n) + T_AB * a.abLevel) * Math.pow(rho(a.pos.y) / 1.225, .75); }
  dragCoef(a: Aircraft, cl: number, mach: number, beta = 0) {
    return CD0 + K_IND * cl * cl + (a.gear ? CD_GEAR : 0) + CD_FLAPS * a.flapPos + CD_SB * a.sbPos + Math.min(.05, 2.5 * Math.max(0, mach - .85) ** 2) + 1.3 * beta * beta;
  }
  private air(a: Aircraft, dt: number) {
    a.updateAxes();
    let v = a.vel.length(); if (v < 1) { a.vel.addInPlace(a.fwd); v = a.vel.length(); }
    const vd = this.vd.copyFrom(a.vel).scaleInPlace(1 / v); this.vd0.copyFrom(vd);
    const vx = Vector3.Dot(a.vel, a.right), vy = Vector3.Dot(a.vel, a.up), vz = Vector3.Dot(a.vel, a.fwd);
    const alpha = Math.atan2(-vy, Math.max(.1, vz)), beta = Math.atan2(vx, Math.max(.1, vz));
    const den = rho(a.pos.y), q = .5 * den * v * v, qS = Math.max(50, q * WING_AREA), mach = v / 340;
    const cl = liftCoef(alpha, a.flapPos), L = qS * cl, sa = Math.sin(Math.min(1.4, Math.abs(alpha))), sc = Math.sin(ALPHA_CRIT);
    const D = qS * (this.dragCoef(a, cl, mach, beta) + (Math.abs(alpha) > ALPHA_CRIT ? 1.8 * (sa * sa - sc * sc) : 0)); // post-stall: flat-plate drag
    a.aoa = alpha; a.beta = beta; a.gLoad = L / W;
    a.stalled = alpha > ALPHA_CRIT; a.stallWarn = alpha > ALPHA_CRIT - WARN_MARGIN;   // warning = AoA within ~2.5° of critical
    a.buffet = toward(a.buffet, Math.max(0, Math.min(1, (alpha - (ALPHA_CRIT - .03)) * 12)), dt * 4);
    // ---- forces ----
    const lift = this.t1.copyFrom(a.up).subtractInPlace(vd.scale(Vector3.Dot(a.up, vd))).normalize().scaleInPlace(L * Math.cos(beta) ** 2);
    const side = this.t2.copyFrom(a.right).subtractInPlace(vd.scale(Vector3.Dot(a.right, vd))).normalize().scaleInPlace(-qS * CY_BETA * beta);
    const F = a.fwd.scale(this.thrust(a)).addInPlace(vd.scale(-D)).addInPlace(lift).addInPlace(side);
    F.y -= W;
    a.vel.addInPlace(F.scaleInPlace(dt / MASS));
    a.pos.addInPlace(a.vel.scale(dt));
    // ---- body follows velocity vector (kinematic coupling) ----
    const nv = a.vel.length(); this.vd.copyFrom(a.vel).scaleInPlace(1 / Math.max(.1, nv));
    Quaternion.FromUnitVectorsToRef(this.vd0, this.vd, this.dq); this.dq.multiplyToRef(a.rot, a.rot);
    // ---- pitch: AoA command (no hard limiter: full aft stick goes past critical AoA → you CAN stall) ----
    const sm = a.sm, auth = Math.min(1, Math.max(.12, q / 6125)), perG = W / (qS * CL_ALPHA), flapA = CL_FLAPS * a.flapPos / CL_ALPHA;
    const deep = alpha > ALPHA_CRIT, sAuth = deep ? .45 : 1;                          // separated flow → control authority drops
    const a1g = Math.min(ALPHA_CRIT * .9, perG - flapA), aMax = Math.min(ALPHA_CRIT * (a.aoaLimiter ? .85 : 1.3), 9 * perG - flapA), aNeg = Math.max(-.15, -3 * perG - flapA);
    const aCmd = sm.p >= 0 ? a1g + sm.p * (aMax - a1g) : a1g + -sm.p * (aNeg - a1g);
    const pr = Math.max(-.6, Math.min(.6, (aCmd - alpha) * 3.5 * auth * sAuth));
    rotLocal(a, AX, -pr * dt);
    if (deep) rotLocal(a, AX, (alpha - ALPHA_CRIT) * (Math.abs(a.spinRate) > .8 ? .4 : 1.6) * dt); // nose drop (weaker once spinning)
    // ---- stall wing drop (asymmetric, biased by sideslip & aileron) ----
    if (deep && a.wingDrop === 0) a.wingDrop = Math.sign(-beta * 8 - sm.r * .5 + (Math.random() - .5) * .3) || 1;  // +1 = right wing drops
    if (!deep && alpha < ALPHA_CRIT - .04) a.wingDrop = 0;
    // ---- spin / autorotation (Trudeln): stalled + yaw (rudder or sideslip) ----
    const yawIn = sm.y, spinSign = Math.sign(a.spinRate) || a.wingDrop || Math.sign(yawIn) || 1;
    if (deep) {
      const pro = yawIn * spinSign;                                                       // rudder with (+) or against (−) the spin
      const drive = .25 + Math.max(0, pro) * 1.4 + Math.abs(beta) * 4 + Math.max(0, -sm.r * spinSign) * .3;
      const target = pro < -.3 ? 0 : Math.min(2.4, drive * 1.3);
      a.spinRate = toward(a.spinRate, spinSign * target, dt * (pro < -.3 ? 1.6 : .9));
    } else a.spinRate = toward(a.spinRate, 0, dt * (yawIn * Math.sign(a.spinRate) < -.3 ? 2.5 : 1.4));
    if (a.spinRate !== 0) { rotLocal(a, AY, a.spinRate * dt); rotLocal(a, AZ, -a.spinRate * .55 * dt); }   // yaw + roll into the spin
    // ---- roll: aileron rate command + dihedral effect (roll away from sideslip) + slight spiral tendency + stall wing drop ----
    const bank = Math.atan2(-a.right.y, a.up.y);
    let roll = sm.r * 3.3 * auth * sAuth + beta * DIHEDRAL * auth + bank * .04 * (Math.abs(sm.r) < .05 ? 1 : 0);
    if (deep) roll += -a.wingDrop * Math.min(1.5, (alpha - ALPHA_CRIT) * 10) + (Math.random() - .5) * 2 * a.buffet;
    rotLocal(a, AZ, roll * dt);
    // ---- yaw: rudder commands sideslip, weathervane stability restores β → 0 (weak when stalled) ----
    const rAuth = Math.min(1, Math.max(.3, q / 3500));
    rotLocal(a, AY, (beta * (deep ? .5 : 1) + sm.y * BETA_RUD) * 3.0 * rAuth * dt);
    a.rot.normalize(); a.updateAxes();
    if (a.pos.y > 15000) { a.pos.y = 15000; a.vel.y = Math.min(0, a.vel.y); }
    const lim = 5800; a.pos.x = Math.max(-lim, Math.min(lim, a.pos.x)); a.pos.z = Math.max(-lim, Math.min(lim, a.pos.z));
    const gy = groundAt(a.pos.x, a.pos.z);
    if (a.pos.y < gy + (a.gear ? GEAR_H : BELLY_H)) this.touchdown(a, gy);
  }
  /** Decide safe landing vs crash at the moment of ground contact. */
  touchdown(a: Aircraft, gy: number) {
    a.updateAxes();
    const sink = -a.vel.y, spd = a.vel.length(), bank = Math.abs(bankDeg(a)), pitch = pitchDeg(a), rw = runwayAt(a.pos.x, a.pos.z), L = SAFE_LAND;
    const reason = !rw ? 'CRASHED — not on a runway' : !a.gear ? 'CRASHED — gear up (G)' : sink > L.maxSink ? `CRASHED — sink rate ${Math.round(sink * FPM)} ft/min` :
      spd > L.maxSpeed ? `CRASHED — too fast (${Math.round(spd * KT)} kt)` : bank > L.maxBankDeg ? 'CRASHED — wings not level' :
      pitch < L.minPitchDeg || pitch > L.maxPitchDeg ? 'CRASHED — bad attitude' : '';
    if (reason) { a.pos.y = gy + 1; this.onCrash?.(a, reason); return; }
    a.onGround = true; a.heading = Math.atan2(a.fwd.x, a.fwd.z); a.groundPitch = Math.min(0, -pitch / DEG);
    const h = Math.hypot(a.vel.x, a.vel.z); a.vel.set(Math.sin(a.heading) * h, 0, Math.cos(a.heading) * h); a.pos.y = gy + GEAR_H; a.stalled = a.stallWarn = false; a.spinRate = 0;
    a.touchdownAt = a.pos.clone(); this.onLand?.(a);
  }
  private ground(a: Aircraft, dt: number) {
    const c = a.ctrl, sm = a.sm; let s = Math.hypot(a.vel.x, a.vel.z);
    const qS = .5 * rho(a.pos.y) * s * s * WING_AREA, cl = liftCoef(-a.groundPitch, a.flapPos), L = qS * cl, N = Math.max(0, W - L);
    const braking = a.brakes || c.brake;
    const fric = (MU_ROLL + (braking ? MU_BRAKE : 0)) * N * Math.min(1, s * 2);
    s += (this.thrust(a) - qS * this.dragCoef(a, cl, s / 340) - fric) / MASS * dt;
    s = Math.max(0, s);
    a.heading += sm.y * .6 * Math.min(1, s / 8) * Math.max(.15, 1 - s / 70) * dt; // nosewheel steering, weaker at speed
    const want = sm.p > 0 && s > V_ROTATE ? -.22 * sm.p : 0;                    // rotate (≈7°/s) once past Vr
    a.groundPitch = toward(a.groundPitch, want, .13 * dt);
    Quaternion.RotationYawPitchRollToRef(a.heading, a.groundPitch, 0, a.rot);
    a.vel.set(Math.sin(a.heading) * s, 0, Math.cos(a.heading) * s);
    a.pos.addInPlace(a.vel.scale(dt));
    a.pos.y = groundAt(a.pos.x, a.pos.z) + GEAR_H;
    a.stalled = a.stallWarn = false; a.spinRate = 0; a.buffet = 0; a.aoa = -a.groundPitch; a.beta = 0; a.gLoad = 1; a.updateAxes();
    if (!airfieldAt(a.pos.x, a.pos.z) && s > 22) { this.onCrash?.(a, 'CRASHED — ran off the runway'); return; }
    if (L > W && a.groundPitch < -.05) { a.onGround = false; a.everAirborne = true; a.pos.y += .2; a.vel.y = .5; } // liftoff
  }
  /** control surfaces follow (smoothed) inputs */
  private animate(a: Aircraft) {
    const s = a.node.metadata?.surf as Record<string, TransformNode[]> | undefined; if (!s) return;
    const sm = a.sm, f = .45;
    s.stab[0].rotation.x = f * (sm.p + sm.r * .4); s.stab[1].rotation.x = f * (sm.p - sm.r * .4);  // stabilators (+ differential)
    s.ail[0].rotation.x = f * sm.r - .35 * a.flapPos * .3; s.ail[1].rotation.x = -f * sm.r - .35 * a.flapPos * .3;
    for (const fl of s.flap) fl.rotation.x = -.55 * a.flapPos;
    for (const r of s.rud) r.rotation.x = -.5 * sm.y;
    for (const b of s.sb) b.rotation.x = .9 * a.sbPos;
    const fl = a.flame, t = a.n + a.abLevel * .9;
    fl.scaling.y = .15 + t * (0.8 + Math.random() * .2); fl.scaling.x = fl.scaling.z = .5 + t * .35; fl.setEnabled(t > .05);
  }
}
