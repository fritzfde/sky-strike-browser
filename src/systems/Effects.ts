import { Scene } from '@babylonjs/core/scene';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Pool } from '../core/Pool';
/** Pooled particle systems for explosions, sparks and missile trails. */
export class Effects {
  private tex: Texture;
  private booms: Pool<ParticleSystem>; private sparks: Pool<ParticleSystem>; private trails: Pool<ParticleSystem>;
  constructor(private scene: Scene) {
    const t = new DynamicTexture('ptex', 64, scene, false); const ctx = t.getContext() as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); t.hasAlpha = true; t.update(); this.tex = t;
    const mk = (cap: number, cfg: (p: ParticleSystem) => void) => () => { const p = new ParticleSystem('ps', cap, scene); p.particleTexture = this.tex; p.emitter = new Vector3(); cfg(p); return p; };
    const done = (p: ParticleSystem) => { p.stop(); };
    this.booms = new Pool(mk(300, p => {
      p.color1 = new Color4(1, .7, .2, 1); p.color2 = new Color4(1, .3, .05, 1); p.colorDead = new Color4(.15, .15, .15, 0);
      p.minSize = 6; p.maxSize = 22; p.minLifeTime = .5; p.maxLifeTime = 1.6; p.minEmitPower = 10; p.maxEmitPower = 60;
      p.createSphereEmitter(3); p.blendMode = ParticleSystem.BLENDMODE_STANDARD; p.gravity = new Vector3(0, -5, 0); p.targetStopDuration = 2;
    }), p => {}, done, 6);
    this.sparks = new Pool(mk(30, p => {
      p.color1 = new Color4(1, 1, .4, 1); p.color2 = new Color4(1, .6, .1, 1); p.colorDead = new Color4(0, 0, 0, 0);
      p.minSize = 1; p.maxSize = 3; p.minLifeTime = .1; p.maxLifeTime = .35; p.minEmitPower = 10; p.maxEmitPower = 30; p.createSphereEmitter(1);
      p.blendMode = ParticleSystem.BLENDMODE_ADD; p.targetStopDuration = .4;
    }), p => {}, done, 10);
    this.trails = new Pool(mk(400, p => {
      p.color1 = new Color4(.9, .9, .9, .7); p.color2 = new Color4(.8, .8, .8, .5); p.colorDead = new Color4(.6, .6, .6, 0);
      p.minSize = 1.5; p.maxSize = 4; p.minLifeTime = .8; p.maxLifeTime = 1.6; p.emitRate = 160; p.minEmitPower = 0; p.maxEmitPower = 1; p.createPointEmitter(Vector3.Zero(), Vector3.Zero());
      p.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    }), p => {}, done, 12);
  }
  private burst(pool: Pool<ParticleSystem>, pos: Vector3, life: number, count: number) {
    const p = pool.acquire(); (p.emitter as Vector3).copyFrom(pos); p.manualEmitCount = count; p.reset(); p.start();
    setTimeout(() => pool.release(p), life * 1000);
  }
  explosion(pos: Vector3, big = 1) { this.burst(this.booms, pos, 3.5, Math.round(140 * big)); }
  spark(pos: Vector3) { this.burst(this.sparks, pos, .8, 8); }
  /** Returns a trail whose emitter follows the given vector; call stopTrail when done. */
  startTrail(follow: Vector3) { const p = this.trails.acquire(); p.emitter = follow; p.reset(); p.start(); return p; }
  stopTrail(p: ParticleSystem) { p.stop(); setTimeout(() => { p.emitter = new Vector3(); this.trails.release(p); }, 1700); }
}
