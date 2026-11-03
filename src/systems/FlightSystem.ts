import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Aircraft } from '../entities/Aircraft';
import { groundAt } from '../world/Terrain';
const tq = new Quaternion();
/** Local-axis rotation (post-multiply). Babylon is left-handed: +X right, +Y up, +Z forward. */
export function rotLocal(a: Aircraft, axis: Vector3, ang: number) { Quaternion.RotationAxisToRef(axis, ang, tq); a.rot.multiplyInPlace(tq); }
export const AX = new Vector3(1, 0, 0), AY = new Vector3(0, 1, 0), AZ = new Vector3(0, 0, 1);
export const MIN_SPEED = 60, MAX_SPEED = 280;
/** Arcade flight model: throttle -> target speed, gravity-ish energy on climb/dive, stick -> body rates. */
export class FlightSystem {
  onCrash?: (a: Aircraft) => void;
  update(list: Aircraft[], dt: number) {
    for (const a of list) {
      if (!a.alive) continue;
      const c = a.ctrl;
      a.throttle = Math.min(1, Math.max(0, a.throttle + c.throttle * dt * .6));
      a.updateAxes();
      const target = MIN_SPEED + a.throttle * (MAX_SPEED - MIN_SPEED) - a.fwd.y * 40; // climbing bleeds speed
      a.speed += (target - a.speed) * Math.min(1, dt * .8);
      const auth = Math.min(1, a.speed / 120);
      rotLocal(a, AX, -c.pitch * 1.3 * auth * dt);
      rotLocal(a, AZ, c.roll * 2.6 * dt);
      rotLocal(a, AY, c.yaw * .6 * dt);
      // bank induces gentle turn (coordinated-ish)
      a.updateAxes();
      rotLocal(a, AY, -a.right.y * .5 * dt);
      a.rot.normalize();
      a.pos.addInPlace(a.fwd.scale(a.speed * dt));
      if (a.pos.y > 3000) a.pos.y = 3000;
      const lim = 5800; a.pos.x = Math.max(-lim, Math.min(lim, a.pos.x)); a.pos.z = Math.max(-lim, Math.min(lim, a.pos.z));
      if (a.pos.y < groundAt(a.pos.x, a.pos.z) + 2) this.onCrash?.(a);
      const fl = a.flame; fl.scaling.y = .3 + a.throttle * (0.9 + Math.random() * .2); fl.scaling.x = fl.scaling.z = .6 + a.throttle * .4;
    }
  }
}
