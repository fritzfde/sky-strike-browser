import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Input } from './Input';
import { buildWorld } from '../world/Terrain';
import { buildJet } from '../entities/JetMesh';
import { Aircraft } from '../entities/Aircraft';
import { FlightSystem } from '../systems/FlightSystem';
import { WeaponSystem } from '../systems/WeaponSystem';
import { AISystem } from '../systems/AISystem';
import { AudioSystem } from '../systems/AudioSystem';
import { Effects } from '../systems/Effects';
import { HUD } from '../systems/HUD';
/**
 * Composition root. Entities = Aircraft (state) + node (render). Systems run in fixed order each frame:
 * input/AI -> flight -> weapons -> effects -> camera -> HUD/audio.
 * Extension points: add GroundVehicle/Infantry entities + their systems; swap AISystem/Input for NetworkController.
 */
export class Game {
  engine: Engine; scene: Scene; cam: UniversalCamera;
  input: Input; audio = new AudioSystem(); flight = new FlightSystem(); ai = new AISystem();
  fx: Effects; weapons: WeaponSystem; hud = new HUD();
  player: Aircraft; enemies: Aircraft[] = []; all: Aircraft[] = [];
  score = 0; wave = 0; started = false; time = 0; paused = false;
  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { stencil: false, preserveDrawingBuffer: false }, true);
    this.engine.setHardwareScalingLevel(Math.max(1, (window.devicePixelRatio || 1) / 1.5));
    const s = this.scene = new Scene(this.engine);
    s.clearColor = new Color4(.53, .73, .93, 1); s.fogMode = Scene.FOGMODE_LINEAR; s.fogStart = 900; s.fogEnd = 5500; s.fogColor = new Color3(.53, .73, .93);
    s.skipPointerMovePicking = true; s.autoClear = true;
    const h = new HemisphericLight('h', new Vector3(0, 1, 0), s); h.intensity = .8; h.groundColor = new Color3(.3, .35, .2);
    const d = new DirectionalLight('sun', new Vector3(-.5, -1, -.4), s); d.intensity = 1.1;
    this.cam = new UniversalCamera('cam', new Vector3(0, 520, -40), s); this.cam.minZ = 1; this.cam.maxZ = 9000; this.cam.fov = 1.15; this.cam.inputs.clear();
    this.cam.rotationQuaternion = Quaternion.Identity();
    buildWorld(s);
    this.fx = new Effects(s);
    this.input = new Input(canvas); this.input.onToggleMute = () => this.toggleMute();
    this.input.onPauseKey = () => { if (this.started) this.setPaused(!this.paused); };
    this.input.onLockLost = () => { if (this.started) this.setPaused(true); };
    const $ = (id: string) => document.getElementById(id)!;
    $('btnResume').addEventListener('click', () => { this.setPaused(false); if (!('ontouchstart' in window)) this.input.requestLock(); });
    $('btnRestart').addEventListener('click', () => { this.restart(); this.setPaused(false); if (!('ontouchstart' in window)) this.input.requestLock(); });
    $('btnMute').addEventListener('click', () => this.toggleMute());
    this.player = new Aircraft(buildJet(s, new Color3(.38, .45, .55), 'player'), 'blue', true); this.all.push(this.player);
    this.weapons = new WeaponSystem(s, this.fx, this.audio, () => this.all);
    this.weapons.onKill = (v, k) => this.onKill(v, k);
    this.weapons.onDamage = v => { if (v.isPlayer) this.audio.hit(); };
    this.flight.onCrash = a => { a.hp = 0; a.alive = false; this.onKill(a, a); };
    this.resetPlayer();
    const start = document.getElementById('start')!;
    const go = (e: Event) => { e.preventDefault(); start.style.display = 'none'; this.started = true; this.audio.init(); this.input.requestLock(); };
    start.addEventListener('click', go); start.addEventListener('touchend', go);
    canvas.addEventListener('click', () => { if (this.started && !this.input.locked && !('ontouchstart' in window)) this.input.requestLock(); });
    window.addEventListener('resize', () => this.engine.resize());
    this.engine.runRenderLoop(() => this.frame());
  }
  toggleMute() { this.audio.toggleMute(); document.getElementById('btnMute')!.textContent = this.audio.muted ? 'Sound: OFF' : 'Sound: ON'; }
  setPaused(on: boolean) {
    if (on === this.paused) return; this.paused = on; this.input.clear();
    document.getElementById('pause')!.style.display = on ? 'flex' : 'none';
    this.audio.suspend(on); if (on) this.input.exitLock();
  }
  restart() {
    for (const e of this.enemies) e.node.dispose(); this.enemies = []; this.all = [this.player]; this.wave = 0; this.score = 0;
    for (const pool of [this.weapons.bullets, this.weapons.bulletsRed]) while (pool.active.length) pool.release(pool.active[0]);
    while (this.weapons.missiles.active.length) { const m = this.weapons.missiles.active[0]; if (m.trail) this.fx.stopTrail(m.trail); m.trail = undefined; this.weapons.missiles.release(m); }
    this.resetPlayer();
  }
  resetPlayer() {
    const p = this.player; p.pos.set(0, 600, -1500); p.rot.copyFrom(Quaternion.Identity()); Object.assign(p, { hp: 100, ammo: 500, missiles: 6, speed: 140, throttle: .6, alive: true, lockTarget: null, lockTime: 0 }); p.setVisible(true);
  }
  spawnWave() {
    this.wave++; for (const e of this.enemies) e.node.dispose(); this.all = [this.player]; this.enemies = [];
    for (let i = 0; i < 2 + this.wave; i++) {
      const e = new Aircraft(buildJet(this.scene, new Color3(.6, .2, .18), 'enemy'), 'red'); const a = Math.random() * 6.28;
      e.pos.set(this.player.pos.x + Math.cos(a) * 1600, 500 + Math.random() * 400, this.player.pos.z + Math.sin(a) * 1600);
      e.rot.copyFrom(Quaternion.FromEulerAngles(0, a + Math.PI / 2, 0)); e.speed = 110 + Math.random() * 40; e.ammo = 1e9; e.missiles = 2 + Math.floor(this.wave / 2); e.hp = e.maxHp = 40;
      this.enemies.push(e); this.all.push(e);
    }
    this.hud.flash('WAVE ' + this.wave);
  }
  onKill(v: Aircraft, k: Aircraft) {
    this.fx.explosion(v.pos, 1.2); this.audio.explosion(v.isPlayer ? 1 : .7); v.setVisible(false);
    if (v.isPlayer) { v.respawnT = 3; } else if (k.isPlayer) { this.score += 100; this.hud.flash('+100', 1); }
  }
  frame() {
    if (this.paused) return; // freeze everything: sim, particles (updated in render), timers
    const dt = Math.min(this.engine.getDeltaTime() / 1000, .05); this.time += dt; const p = this.player;
    this.fx.update(dt);
    if (this.started) {
      this.input.update(dt);
      if (p.alive) Object.assign(p.ctrl, this.input.c); else { p.respawnT -= dt; if (p.respawnT <= 0) this.resetPlayer(); }
      if (!this.enemies.some(e => e.alive)) this.spawnWave();
      this.ai.update(this.enemies, this.all, dt);
      this.flight.update(this.all, dt);
      for (const a of this.all) if (a.alive) { this.weapons.updateLock(a, dt); this.weapons.fire(a, dt); }
      this.weapons.update(dt);
      if (p.alive && p.hp < 100) p.hp = Math.min(100, p.hp + dt * 1.5);
    }
    this.updateCamera(dt);
    const lockState = !p.alive || !p.lockTarget ? 0 : p.lockTime >= 1 ? 2 : 1;
    this.audio.engine(p.throttle, p.alive && this.started); this.audio.lock(lockState as 0 | 1 | 2, this.time);
    const agl = p.pos.y; this.audio.warning(dt, p.alive && this.started && (this.weapons.incomingFor(p) || p.hp < 25));
    this.hud.update(p, this.enemies, this.weapons.missiles.active, this.score, this.wave, this.scene, this.cam, dt, p.alive ? '' : `SHOT DOWN — respawn in ${Math.ceil(p.respawnT)}`);
    this.scene.render();
  }
  private camPos = new Vector3();
  updateCamera(dt: number) {
    const p = this.player; p.updateAxes();
    if (!this.started) { this.cam.position.set(p.pos.x + 25, p.pos.y + 6, p.pos.z + 30); this.cam.setTarget(p.pos); return; }
    this.camPos.copyFrom(p.pos).addInPlace(p.fwd.scale(-26)).addInPlace(p.up.scale(6));
    Vector3.LerpToRef(this.cam.position, this.camPos, Math.min(1, dt * 7), this.cam.position);
    Quaternion.SlerpToRef(this.cam.rotationQuaternion!, p.rot, Math.min(1, dt * 5), this.cam.rotationQuaternion!);
    this.cam.fov = 1.1 + (p.speed - 60) / 220 * .2;
  }
}
