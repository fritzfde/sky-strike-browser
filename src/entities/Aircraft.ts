import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
/** Shared aircraft state. Player & AI are the same entity; a controller (input/AI) writes `ctrl`. Ready for networking (serializable state). */
export type Team = 'blue' | 'red';
export class Aircraft {
  /** world velocity (m/s); `speed` mirrors |vel| for systems that only need magnitude */
  vel = new Vector3(); onGround = false; gear = true; brakes = true; afterburner = false; stalled = false;
  groundPitch = 0; heading = 0; everAirborne = false; skill = .5; crashReason = '';
  /** engine spool (0..1), afterburner light (0..1), flaps/speed brake commanded & actual position, smoothed stick */
  n = .6; abLevel = 0; flaps = true; flapPos = 1; speedbrake = false; sbPos = 0; sm = { p: 0, r: 0, y: 0 };
  aoaLimiter = true; aoa = 0; beta = 0; stallWarn = false; spinRate = 0; wingDrop = 0; buffet = 0; gLoad = 1; touchdownAt: Vector3 | null = null;
  speed = 120; throttle = .6; hp = 100; maxHp = 100; alive = true;
  ammo = 510; irMsl = 4; rdrMsl = 2; lastHit = -1e9;
  /** total missiles (4 × IR short-range + 2 × radar medium-range); assigning refills IR first */
  get missiles() { return this.irMsl + this.rdrMsl; } set missiles(v: number) { this.irMsl = Math.min(4, v); this.rdrMsl = Math.max(0, Math.min(2, v - 4)); }
  flares = 30; flareCd = 0; threat = 0; threatDir = 0; gunCd = 0; missileCd = 0; respawnT = 0;
  lockTarget: Aircraft | null = null; lockTime = 0;
  ctrl = { pitch: 0, roll: 0, yaw: 0, throttle: 0, afterburner: false, brake: false, fireGun: false, fireMissile: false };
  readonly fwd = new Vector3(); readonly up = new Vector3(); readonly right = new Vector3();
  constructor(public node: TransformNode, public team: Team, public isPlayer = false) { node.rotationQuaternion = Quaternion.Identity(); }
  get pos() { return this.node.position; }
  get rot() { return this.node.rotationQuaternion!; }
  updateAxes() {
    new Vector3(0, 0, 1).rotateByQuaternionToRef(this.rot, this.fwd);
    new Vector3(0, 1, 0).rotateByQuaternionToRef(this.rot, this.up);
    new Vector3(1, 0, 0).rotateByQuaternionToRef(this.rot, this.right);
  }
  setVisible(v: boolean) { this.node.setEnabled(v); }
  get flame(): Mesh { return this.node.metadata.flame; }
  setGear(v: boolean) { this.gear = v; (this.node.metadata.gear as TransformNode).setEnabled(v); }
}
