import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
export const WORLD = 12000, WATER = -110;
/** Runways run along +Z. Flattened pad around each one. */
export interface Airfield { name: string; x: number; z: number; elev: number; }
export const RWY_HALF_W = 30, RWY_HALF_L = 1100, PAD_HALF_W = 160, PAD_HALF_L = 1250, BLEND = 350;
function rawHeight(x: number, z: number) {
  return Math.sin(x * .002) * Math.cos(z * .0017) * 180 + Math.sin(x * .007 + 1) * Math.sin(z * .006) * 60 + Math.cos(x * .0005 - z * .0004) * 120;
}
export const AIRFIELDS: Airfield[] = [['ALPHA', 0, -3000], ['BRAVO', 3800, 1800], ['CHARLIE', -3900, 2200]].map(([n, x, z]) =>
  ({ name: n as string, x: x as number, z: z as number, elev: Math.min(140, Math.max(WATER + 25, rawHeight(x as number, z as number))) }));
export function height(x: number, z: number) {
  let h = rawHeight(x, z);
  for (const a of AIRFIELDS) {
    const dx = Math.max(0, Math.abs(x - a.x) - PAD_HALF_W) / BLEND, dz = Math.max(0, Math.abs(z - a.z) - PAD_HALF_L) / BLEND, d = Math.hypot(dx, dz);
    if (d < 1) { const t = 1 - d, w = t * t * (3 - 2 * t); h = h + (a.elev - h) * w; }
  }
  return h;
}
export function groundAt(x: number, z: number) { return Math.max(WATER, height(x, z)); }
export function runwayAt(x: number, z: number): Airfield | null {
  for (const a of AIRFIELDS) if (Math.abs(x - a.x) < RWY_HALF_W && Math.abs(z - a.z) < RWY_HALF_L) return a; return null;
}
export function airfieldAt(x: number, z: number): Airfield | null {
  for (const a of AIRFIELDS) if (Math.abs(x - a.x) < PAD_HALF_W && Math.abs(z - a.z) < PAD_HALF_L) return a; return null;
}
export function buildWorld(scene: Scene) {
  const N = 240, pos: number[] = [], col: number[] = [], idx: number[] = [], nrm: number[] = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = (i / N - .5) * WORLD, z = (j / N - .5) * WORLD, h = height(x, z); pos.push(x, h, z);
    const pad = airfieldAt(x, z);
    const c = pad ? [.32, .45, .25] : h < -100 ? [.8, .75, .5] : h > 200 ? [.92, .92, .97] : h > 80 ? [.45, .4, .35] : [.25 + Math.random() * .04, .5, .2];
    col.push(c[0], c[1], c[2], 1);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  VertexData.ComputeNormals(pos, idx, nrm);
  const ground = new Mesh('terrain', scene); const vd = new VertexData();
  Object.assign(vd, { positions: pos, indices: idx, normals: nrm, colors: col }); vd.applyToMesh(ground);
  const gm = new StandardMaterial('gm', scene); gm.specularColor = Color3.Black(); ground.material = gm; ground.freezeWorldMatrix(); ground.isPickable = false;
  const water = MeshBuilder.CreateGround('water', { width: WORLD, height: WORLD }, scene); water.position.y = WATER;
  const wm = new StandardMaterial('wm', scene); wm.diffuseColor = new Color3(.13, .4, .67); wm.alpha = .85; wm.specularColor = new Color3(.3, .3, .3); water.material = wm;
  buildRunways(scene);
  const cm = new StandardMaterial('cm', scene); cm.diffuseColor = Color3.White(); cm.emissiveColor = new Color3(.75, .75, .8); cm.alpha = .75; cm.specularColor = Color3.Black();
  const base = MeshBuilder.CreateSphere('cloud', { segments: 6, diameter: 1 }, scene); base.material = cm; base.isVisible = false;
  for (let i = 0; i < 50; i++) {
    const cx = (Math.random() - .5) * 9000, cy = 700 + Math.random() * 500, cz = (Math.random() - .5) * 9000;
    for (let k = 0; k < 5; k++) { const p = base.createInstance('c'); const s = 80 + Math.random() * 90;
      p.scaling.set(s * 1.4, s * .55, s); p.position.set(cx + (Math.random() - .5) * 220, cy + Math.random() * 40, cz + (Math.random() - .5) * 220); p.freezeWorldMatrix(); }
  }
}
function buildRunways(scene: Scene) {
  const tex = new DynamicTexture('rwy', { width: 128, height: 2048 }, scene, true); const g = tex.getContext() as CanvasRenderingContext2D;
  g.fillStyle = '#3a3a3e'; g.fillRect(0, 0, 128, 2048); g.fillStyle = '#eee';
  for (let y = 60; y < 1990; y += 60) g.fillRect(62, y, 4, 30);                    // centerline dashes
  for (const y of [8, 2016]) for (let x = 10; x < 118; x += 14) g.fillRect(x, y, 8, 24); // threshold piano keys
  for (const y of [180, 1840]) { g.fillRect(36, y, 14, 60); g.fillRect(78, y, 14, 60); } // touchdown zone
  g.fillRect(3, 0, 3, 2048); g.fillRect(122, 0, 3, 2048); tex.update();
  const rm = new StandardMaterial('rm', scene); rm.diffuseTexture = tex; rm.specularColor = new Color3(.05, .05, .05);
  const lm = new StandardMaterial('lm', scene); lm.emissiveColor = new Color3(1, .9, .5); lm.disableLighting = true;
  const lamp = MeshBuilder.CreateBox('lamp', { size: 1.5 }, scene); lamp.material = lm; lamp.isVisible = false;
  const tm = new StandardMaterial('tm', scene); tm.diffuseColor = new Color3(.6, .6, .55);
  for (const a of AIRFIELDS) {
    const r = MeshBuilder.CreateGround('runway', { width: RWY_HALF_W * 2, height: RWY_HALF_L * 2 }, scene); r.material = rm; r.position.set(a.x, a.elev + .25, a.z); r.freezeWorldMatrix();
    for (let z = -RWY_HALF_L; z <= RWY_HALF_L; z += 100) for (const s of [-1, 1]) { const l = lamp.createInstance('l'); l.position.set(a.x + s * (RWY_HALF_W + 2), a.elev + .8, a.z + z); l.freezeWorldMatrix(); }
    const tw = MeshBuilder.CreateBox('tower', { width: 12, height: 30, depth: 12 }, scene); tw.material = tm; tw.position.set(a.x + 110, a.elev + 15, a.z); tw.freezeWorldMatrix();
    const hg = MeshBuilder.CreateBox('hangar', { width: 40, height: 16, depth: 60 }, scene); hg.material = tm; hg.position.set(a.x + 110, a.elev + 8, a.z + 120); hg.freezeWorldMatrix();
  }
}
