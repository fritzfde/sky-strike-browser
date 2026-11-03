import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Aircraft } from '../entities/Aircraft';
import { groundAt } from '../world/Terrain';
/** Simple pursuit AI: writes control inputs (same interface as player) so AI planes obey the same flight model. */
export class AISystem {
  private loc = new Vector3();
  update(ai: Aircraft[], targets: Aircraft[], dt: number) {
    for (const a of ai) {
      if (!a.alive) continue; a.updateAxes();
      const enemy = targets.find(t => t.alive && t.team !== a.team);
      let goal = enemy ? enemy.pos.add(enemy.fwd.scale(enemy.speed * .6)) : a.pos.add(a.fwd.scale(500));
      const agl = a.pos.y - groundAt(a.pos.x, a.pos.z);
      if (agl < 180 || a.fwd.y < -.5 && agl < 400) goal = a.pos.add(a.fwd.scale(200)).addInPlaceFromFloats(0, 600, 0);
      const to = goal.subtract(a.pos).normalize(); to.rotateByQuaternionToRef(Quaternion.Inverse(a.rot), this.loc);
      const l = this.loc, c = a.ctrl;
      // bank toward target, then pull
      const wantRoll = Math.atan2(l.x, Math.max(.2, l.y + .3)) * .8; const curRoll = Math.atan2(-a.right.y, a.up.y);
      c.roll = clamp((curRoll - wantRoll) * 1.5);
      c.pitch = clamp(l.y * 3 + Math.abs(l.x) * 1.2 * (Math.abs(curRoll) > .3 ? 1 : 0));
      c.yaw = clamp(l.x * 3);
      const d = enemy ? Vector3.Distance(a.pos, enemy.pos) : 1e9;
      c.throttle = d > 1200 ? 1 : d < 400 ? -1 : 0;
      c.fireGun = !!enemy && l.z > .985 && d < 900;
      c.fireMissile = !!enemy && a.lockTime > 1.5 && d < 2000 && Math.random() < dt * .25;
    }
  }
}
const clamp = (v: number) => Math.max(-1, Math.min(1, v));
