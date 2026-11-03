import earcut from 'earcut';
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
/** Procedural fighter (F-16/F-35-ish) built from extruded shapes, merged into one mesh per material. Nose points +Z. */
const mats = new Map<string, StandardMaterial>();
function mat(scene: Scene, name: string, c: Color3, emissive = false) {
  const k = name; if (mats.has(k)) return mats.get(k)!;
  const m = new StandardMaterial(k, scene); m.diffuseColor = c; m.specularColor = new Color3(.4, .4, .4); if (emissive) m.emissiveColor = c; mats.set(k, m); return m;
}
function slab(name: string, shape: [number, number][], thick: number, scene: Scene) {
  // shape in XZ plane, extruded in Y
  return MeshBuilder.ExtrudePolygon(name, { shape: shape.map(([x, z]) => new Vector3(x, 0, z)), depth: thick }, scene, earcut);
}
export function buildJet(scene: Scene, hull: Color3, name: string): TransformNode {
  const root = new TransformNode(name, scene);
  const hm = mat(scene, 'hull' + hull.toHexString(), hull), dark = mat(scene, 'dark', new Color3(.12, .12, .14));
  const glass = mat(scene, 'glass', new Color3(.2, .35, .5)); glass.alpha = .85; glass.specularPower = 128; glass.specularColor = new Color3(1, 1, 1);
  const parts: Mesh[] = [];
  // fuselage: lathe profile along Z
  const prof = [[0, 9], [.5, 8], [1.0, 6], [1.35, 3], [1.5, 0], [1.5, -4], [1.3, -6.5], [1.1, -7]].map(([r, z]) => new Vector3(r, z, 0));
  const fus = MeshBuilder.CreateLathe('fus', { shape: prof, tessellation: 14 }, scene); fus.rotation.x = Math.PI / 2; fus.scaling.y = 1; fus.scaling.x = 1.1; parts.push(fus);
  // main wings (swept delta)
  const wing = slab('wing', [[1, 2.5], [7.5, -3], [7.5, -4.3], [1, -4.5], [-1, -4.5], [-7.5, -4.3], [-7.5, -3], [-1, 2.5]], .25, scene); wing.position.y = -.1; parts.push(wing);
  // LERX strakes
  const lerx = slab('lerx', [[1, 5.5], [1.9, 2], [-1.9, 2], [-1, 5.5]], .15, scene); parts.push(lerx);
  // horizontal stabilizers
  const hs = slab('hs', [[1, -4.8], [4.2, -6.6], [4.2, -7.5], [1, -7.3], [-1, -7.3], [-4.2, -7.5], [-4.2, -6.6], [-1, -4.8]], .18, scene); parts.push(hs);
  // twin canted vertical tails
  for (const s of [-1, 1]) {
    const vt = slab('vt', [[0, -3.5], [0, -7], [3.6, -7.6], [3.6, -6.4]], .16, scene);
    vt.rotation.z = Math.PI / 2 - s * .35; vt.position.set(s * .8, .6, 0); parts.push(vt);
  }
  // intakes
  for (const s of [-1, 1]) { const it = MeshBuilder.CreateBox('in', { width: .8, height: 1.1, depth: 4 }, scene); it.position.set(s * 1.4, -.4, 1.2); parts.push(it); }
  const body = Mesh.MergeMeshes(parts, true, true)!; body.material = hm; body.parent = root;
  const can = MeshBuilder.CreateSphere('canopy', { diameterX: 1.2, diameterY: 1.1, diameterZ: 4.2, segments: 10 }, scene); can.position.set(0, 1.05, 4); can.material = glass; can.parent = root;
  const noz = MeshBuilder.CreateCylinder('noz', { diameterTop: 1.9, diameterBottom: 1.6, height: 1.4, tessellation: 12 }, scene);
  noz.rotation.x = Math.PI / 2; noz.position.z = -7.5; noz.material = dark; noz.parent = root;
  const flame = MeshBuilder.CreateCylinder('flame', { diameterTop: 1.3, diameterBottom: 0, height: 4, tessellation: 10 }, scene);
  flame.rotation.x = Math.PI / 2; flame.position.z = -10; flame.material = mat(scene, 'flame', new Color3(1, .55, .15), true); flame.parent = root;
  // landing gear (nose + 2 mains); wheel bottoms at y = -GEAR_H
  const gear = new TransformNode('gear', scene); gear.parent = root;
  for (const [x, z] of [[0, 5.5], [-1.6, -1.5], [1.6, -1.5]]) {
    const st = MeshBuilder.CreateCylinder('strut', { diameter: .18, height: 1.6, tessellation: 6 }, scene); st.position.set(x, -1.5, z); st.material = dark; st.parent = gear;
    const wh = MeshBuilder.CreateCylinder('wheel', { diameter: .9, height: .35, tessellation: 12 }, scene); wh.rotation.z = Math.PI / 2; wh.position.set(x, -2.15, z); wh.material = dark; wh.parent = gear;
  }
  root.metadata = { flame, gear };
  for (const m of root.getChildMeshes()) m.isPickable = false;
  return root;
}
