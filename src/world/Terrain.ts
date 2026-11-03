import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
export const WORLD = 12000, WATER = -110;
export function height(x: number, z: number) {
  return Math.sin(x * .002) * Math.cos(z * .0017) * 180 + Math.sin(x * .007 + 1) * Math.sin(z * .006) * 60 + Math.cos(x * .0005 - z * .0004) * 120;
}
export function groundAt(x: number, z: number) { return Math.max(WATER, height(x, z)); }
export function buildWorld(scene: Scene) {
  const N = 220, pos: number[] = [], col: number[] = [], idx: number[] = [], nrm: number[] = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = (i / N - .5) * WORLD, z = (j / N - .5) * WORLD, h = height(x, z); pos.push(x, h, z);
    const c = h < -100 ? [.8, .75, .5] : h > 200 ? [.92, .92, .97] : h > 80 ? [.45, .4, .35] : [.25 + Math.random() * .04, .5, .2];
    col.push(c[0], c[1], c[2], 1);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  VertexData.ComputeNormals(pos, idx, nrm);
  const ground = new Mesh('terrain', scene); const vd = new VertexData();
  Object.assign(vd, { positions: pos, indices: idx, normals: nrm, colors: col }); vd.applyToMesh(ground);
  const gm = new StandardMaterial('gm', scene); gm.specularColor = Color3.Black(); ground.material = gm; ground.freezeWorldMatrix(); ground.isPickable = false;
  const water = MeshBuilder.CreateGround('water', { width: WORLD, height: WORLD }, scene); water.position.y = WATER;
  const wm = new StandardMaterial('wm', scene); wm.diffuseColor = new Color3(.13, .4, .67); wm.alpha = .85; wm.specularColor = new Color3(.3, .3, .3); water.material = wm;
  const cm = new StandardMaterial('cm', scene); cm.diffuseColor = Color3.White(); cm.emissiveColor = new Color3(.75, .75, .8); cm.alpha = .75; cm.specularColor = Color3.Black();
  const base = MeshBuilder.CreateSphere('cloud', { segments: 6, diameter: 1 }, scene); base.material = cm; base.isVisible = false;
  for (let i = 0; i < 50; i++) { // clustered puffs = fluffy clouds, via cheap instances
    const cx = (Math.random() - .5) * 9000, cy = 700 + Math.random() * 500, cz = (Math.random() - .5) * 9000;
    for (let k = 0; k < 5; k++) { const p = base.createInstance('c'); const s = 80 + Math.random() * 90;
      p.scaling.set(s * 1.4, s * .55, s); p.position.set(cx + (Math.random() - .5) * 220, cy + Math.random() * 40, cz + (Math.random() - .5) * 220); p.freezeWorldMatrix(); }
  }
}
