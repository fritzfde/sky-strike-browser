import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Aircraft } from '../entities/Aircraft';
import { groundAt } from '../world/Terrain';
/** Pursuit AI. Writes the same Controls as the player, so it obeys the same flight model. `skill` (0..1) scales agility, aim, missile use. */
export class AISystem {
  private loc = new Vector3();
  update(ai: Aircraft[], targets: Aircraft[], dt: number) {
    for (const a of ai) {
      if (!a.alive) continue; a.updateAxes(); const sk = a.skill;
      const enemy = targets.find(t => t.alive && t.team !== a.team && !t.onGround);
      let goal = enemy ? enemy.pos.add(enemy.vel.scale(.4 + sk * .6)) : a.pos.add(a.fwd.scale(800)).addInPlaceFromFloats(0, 0, 0);
      const agl = a.pos.y - groundAt(a.pos.x, a.pos.z);
      if (agl < 250 || (a.fwd.y < -.4 && agl < 600)) goal = a.pos.add(a.fwd.scale(300)).addInPlaceFromFloats(0, 700, 0);
      const to = goal.subtract(a.pos).normalize(); to.rotateByQuaternionToRef(Quaternion.Inverse(a.rot), this.loc);
      const l = this.loc, c = a.ctrl, agil = .45 + .55 * sk;
      const wantRoll = Math.atan2(l.x, Math.max(.2, l.y + .3)) * .8; const curRoll = Math.atan2(-a.right.y, a.up.y);
      c.roll = clamp((curRoll - wantRoll) * 1.5) * agil;
      c.pitch = clamp(l.y * 3 + Math.abs(l.x) * 1.2 * (Math.abs(curRoll) > .3 ? 1 : 0)) * agil;
      c.yaw = clamp(l.x * 3) * agil;
      const v = a.vel.length(); a.throttle = Math.max(0, Math.min(1, (165 - v) / 40 + .75)); c.throttle = 0; c.afterburner = v < 115;
      const d = enemy ? Vector3.Distance(a.pos, enemy.pos) : 1e9;
      c.fireGun = !!enemy && l.z > .997 - (1 - sk) * .01 && d < 700 + sk * 300 && Math.random() < .4 + sk * .6;
      c.fireMissile = !!enemy && sk > .4 && a.lockTime > 2.5 - sk && d < 2200 && Math.random() < dt * sk * .3;
    }
  }
}
const clamp = (v: number) => Math.max(-1, Math.min(1, v));
