import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
/** Shared aircraft state. Player & AI are the same entity; a controller (input/AI) writes `ctrl`. Ready for networking (serializable state). */
export type Team = 'blue' | 'red';
export class Aircraft {
  speed = 120; throttle = .6; hp = 100; maxHp = 100; alive = true;
  ammo = 500; missiles = 6; gunCd = 0; missileCd = 0; respawnT = 0;
  lockTarget: Aircraft | null = null; lockTime = 0;
  ctrl = { pitch: 0, roll: 0, yaw: 0, throttle: 0, fireGun: false, fireMissile: false };
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
}
