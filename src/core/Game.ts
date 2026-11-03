import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Input } from './Input';
import { buildWorld, AIRFIELDS, RWY_HALF_L, airfieldAt, Airfield, groundAt } from '../world/Terrain';
import { buildJet, buildCockpit } from '../entities/JetMesh';
import { Aircraft } from '../entities/Aircraft';
import { CockpitHUD } from '../systems/CockpitHUD';
import { FlightSystem, GEAR_H, NM } from '../systems/FlightSystem';
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
  /** enemy pacing: countdown to next wave, armed once the player is airborne */
  waveT = 40; serviceT = 0; spawnField: Airfield = AIRFIELDS[0];
  lookYaw = 0; lookPitch = 0; cockpitView = false; chud = new CockpitHUD(); cockpit!: import('@babylonjs/core/Meshes/transformNode').TransformNode;
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
    this.input.onGear = () => { const p = this.player; if (!p.alive) return; if (p.onGround) { this.hud.flash('GEAR LOCKED ON GROUND', 1); return; } p.setGear(!p.gear); p.flaps = p.gear; this.hud.flash(p.gear ? 'GEAR + FLAPS DOWN' : 'GEAR + FLAPS UP', 1); };
    this.input.onBrake = () => { const p = this.player; p.brakes = !p.brakes; this.hud.flash(p.brakes ? 'BRAKES ON' : 'BRAKES OFF', 1); };
    this.input.onRecenter = () => { this.lookYaw = this.lookPitch = 0; };
    this.input.onView = () => this.setView(!this.cockpitView);
    this.input.onSpeedBrake = () => { const p = this.player; p.speedbrake = !p.speedbrake; this.hud.flash(p.speedbrake ? 'SPEED BRAKE OUT' : 'SPEED BRAKE IN', 1); };
    this.input.onFlaps = () => { const p = this.player; p.flaps = !p.flaps; this.hud.flash(p.flaps ? 'FLAPS DOWN' : 'FLAPS UP', 1); };
    const $ = (id: string) => document.getElementById(id)!;
    $('btnResume').addEventListener('click', () => { this.setPaused(false); if (!('ontouchstart' in window)) this.input.requestLock(); });
    $('btnRestart').addEventListener('click', () => { this.restart(); this.setPaused(false); if (!('ontouchstart' in window)) this.input.requestLock(); });
    $('btnMute').addEventListener('click', () => this.toggleMute());
    this.player = new Aircraft(buildJet(s, new Color3(.38, .45, .55), 'player'), 'blue', true); this.all.push(this.player); this.cockpit = buildCockpit(s, this.player.node);
    this.weapons = new WeaponSystem(s, this.fx, this.audio, () => this.all);
    this.weapons.onKill = (v, k) => this.onKill(v, k);
    this.weapons.onDamage = v => { if (v.isPlayer) this.audio.hit(); };
    this.flight.onCrash = (a, why) => { a.hp = 0; a.alive = false; a.crashReason = why; this.onKill(a, a); };
    this.flight.onLand = a => { if (a.isPlayer) this.hud.flash('TOUCHDOWN — brake (B) and stop on the airfield to repair/rearm', 3); };
    this.resetPlayer();
    const start = document.getElementById('start')!;
    const go = (e: Event) => { e.preventDefault(); start.style.display = 'none'; this.started = true; this.setView(this.cockpitView); this.audio.init(); this.input.requestLock(); };
    start.addEventListener('click', go); start.addEventListener('touchend', go);
    canvas.addEventListener('click', () => { if (this.started && !this.input.locked && !('ontouchstart' in window)) this.input.requestLock(); });
    window.addEventListener('resize', () => this.engine.resize());
    this.engine.runRenderLoop(() => this.frame());
  }
  setView(cockpit: boolean) {
    this.cockpitView = cockpit; this.cockpit.setEnabled(cockpit); this.chud.show(cockpit && this.started);
    for (const id of ['info', 'cross']) document.getElementById(id)!.style.display = cockpit ? 'none' : '';
    this.cam.minZ = cockpit ? .05 : 1; this.lookYaw = this.lookPitch = 0;
  }
  toggleMute() { this.audio.toggleMute(); document.getElementById('btnMute')!.textContent = this.audio.muted ? 'Sound: OFF' : 'Sound: ON'; }
  setPaused(on: boolean) {
    if (on === this.paused) return; this.paused = on; this.input.clear();
    document.getElementById('pause')!.style.display = on ? 'flex' : 'none';
    this.audio.suspend(on); if (on) this.input.exitLock();
  }
  restart() {
    for (const e of this.enemies) e.node.dispose(); this.enemies = []; this.all = [this.player]; this.wave = 0; this.score = 0; this.waveT = 40; this.spawnField = AIRFIELDS[0];
    for (const pool of [this.weapons.bullets, this.weapons.bulletsRed]) while (pool.active.length) pool.release(pool.active[0]);
    while (this.weapons.missiles.active.length) { const m = this.weapons.missiles.active[0]; if (m.trail) this.fx.stopTrail(m.trail); m.trail = undefined; this.weapons.missiles.release(m); }
    this.resetPlayer();
  }
  resetPlayer() {
    // spawn at the runway threshold, engine idle, gear down, brakes set
    const f = this.spawnField, p = this.player;
    p.pos.set(f.x, f.elev + GEAR_H, f.z - RWY_HALF_L + 60); p.heading = 0; p.groundPitch = 0; p.rot.copyFrom(Quaternion.Identity()); p.vel.set(0, 0, 0);
    Object.assign(p, { hp: 100, ammo: 500, missiles: 6, speed: 0, throttle: 0, alive: true, lockTarget: null, lockTime: 0, onGround: true, brakes: true, stalled: false, crashReason: '', n: 0, abLevel: 0, flaps: true, flapPos: 1, speedbrake: false, sbPos: 0, aoa: 0, gLoad: 1, touchdownAt: null }); p.sm.p = p.sm.r = p.sm.y = 0;
    p.setGear(true); p.setVisible(true); this.lookYaw = this.lookPitch = 0; this.camPos.set(p.pos.x, p.pos.y + 6, p.pos.z - 26); this.cam.position.copyFrom(this.camPos);
  }
  spawnWave() {
    this.wave++; for (const e of this.enemies) e.node.dispose(); this.all = [this.player]; this.enemies = [];
    // battle-royale pacing: 1,1,2,2,3,3... (max 6); skill ramps 0.25 -> 1 over ~8 waves; spawn ahead of the player, never behind
    const n = Math.min(6, Math.ceil(this.wave / 2)), skill = Math.min(1, .15 + .1 * this.wave), p = this.player; p.updateAxes();
    const hdg = Math.atan2(p.fwd.x, p.fwd.z);
    for (let i = 0; i < n; i++) {
      const e = new Aircraft(buildJet(this.scene, new Color3(.6, .2, .18), 'enemy'), 'red'); const a = hdg + (Math.random() - .5) * 2.1, r = 2600 + Math.random() * 600;
      e.pos.set(p.pos.x + Math.sin(a) * r, Math.max(p.pos.y, 400) + 100 + Math.random() * 300, p.pos.z + Math.cos(a) * r);
      const back = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z) + (Math.random() - .5) * .8; // roughly head-on
      e.rot.copyFrom(Quaternion.RotationYawPitchRoll(back, 0, 0)); e.updateAxes(); e.vel.copyFrom(e.fwd).scaleInPlace(150); e.speed = 150; e.throttle = .8; e.n = .8; e.flaps = false; e.flapPos = 0;
      e.onGround = false; e.setGear(false); e.brakes = false; e.skill = skill; e.ammo = 1e9; e.missiles = Math.floor(this.wave / 3); e.hp = e.maxHp = 30 + this.wave * 4;
      this.enemies.push(e); this.all.push(e);
    }
    this.hud.flash(`WAVE ${this.wave} — ${n} bandit${n > 1 ? 's' : ''} inbound, ${(2900 * NM).toFixed(1)} NM ahead`, 2.5);
  }
  onKill(v: Aircraft, k: Aircraft) {
    this.fx.explosion(v.pos, 1.2); this.audio.explosion(v.isPlayer ? 1 : .7); v.setVisible(false);
    if (v.isPlayer) { v.respawnT = 4; this.spawnField = this.nearestField(v.pos); } else if (k.isPlayer) { this.score += 100; this.hud.flash('+100', 1); }
  }
  frame() {
    if (this.paused) return; // freeze everything: sim, particles (updated in render), timers
    const dt = Math.min(this.engine.getDeltaTime() / 1000, .05); this.time += dt; const p = this.player;
    this.fx.update(dt);
    if (this.started) {
      this.input.update(dt);
      if (p.alive) Object.assign(p.ctrl, this.input.c); else { p.respawnT -= dt; if (p.respawnT <= 0) this.resetPlayer(); }
      if (p.alive && !p.onGround) p.everAirborne = true;
      if (p.everAirborne && !this.enemies.some(e => e.alive)) { this.waveT -= dt; if (this.waveT <= 0) { this.spawnWave(); this.waveT = 18; } }
      this.service(p, dt);
      this.ai.update(this.enemies, this.all, dt);
      this.flight.update(this.all, dt);
      for (const a of this.all) if (a.alive) { this.weapons.updateLock(a, dt); this.weapons.fire(a, dt); }
      this.weapons.update(dt);
      if (p.alive && p.hp < 100) p.hp = Math.min(100, p.hp + dt * 1.5);
    }
    this.updateCamera(dt);
    const lockState = !p.alive || !p.lockTarget ? 0 : p.lockTime >= 1 ? 2 : 1;
    this.audio.engine(p.n, p.alive && this.started, p.abLevel > .5); this.audio.lock(lockState as 0 | 1 | 2, this.time);
    const agl = p.pos.y; this.audio.warning(dt, p.alive && this.started && (this.weapons.incomingFor(p) || p.hp < 25 || p.stalled));
    this.hud.update(p, this.enemies, this.weapons.missiles.active, this.score, this.wave, this.scene, this.cam, dt, p.alive ? '' : `${p.crashReason || 'SHOT DOWN'} — respawn in ${Math.ceil(p.respawnT)}`);
    this.chud.draw(p, this.cam.fov, Math.abs(this.lookYaw) + Math.abs(this.lookPitch) > .05, this.weapons.incomingFor(p));
    this.scene.render();
  }
  nearestField(pos: Vector3) { let best = AIRFIELDS[0], bd = 1e18; for (const f of AIRFIELDS) { const d = (f.x - pos.x) ** 2 + (f.z - pos.z) ** 2; if (d < bd) { bd = d; best = f; } } return best; }
  /** stopped on any airfield -> repair + rearm over a few seconds */
  service(p: Aircraft, dt: number) {
    if (!p.alive || !p.onGround || p.speed > 2 || !airfieldAt(p.pos.x, p.pos.z)) { this.serviceT = 0; return; }
    const need = p.hp < 100 || p.ammo < 500 || p.missiles < 6; if (!need) return;
    this.serviceT += dt; if (this.serviceT > 3) { p.hp = 100; p.ammo = 500; p.missiles = 6; this.serviceT = 0; this.hud.flash('REPAIRED & REARMED', 2); }
  }
  private camPos = new Vector3();
  private camQ = Quaternion.Identity(); private lq = new Quaternion();
  /** chase cam + free look (mouse/touchpad/right-drag). Recenters when released/idle or on C. */
  updateCamera(dt: number) {
    const p = this.player; p.updateAxes(); const L = this.input.look;
    if (!this.started) { this.cam.position.set(p.pos.x + 25, p.pos.y + 6, p.pos.z + 30); this.cam.setTarget(p.pos); return; }
    this.lookYaw += L.dx; this.lookPitch = Math.max(-1.3, Math.min(1.3, this.lookPitch + L.dy)); L.dx = L.dy = 0;
    if (!L.active) { const k = Math.min(1, dt * 3); this.lookYaw -= this.lookYaw * k; this.lookPitch -= this.lookPitch * k; }
    if (this.cockpitView) { // eye at the canopy, rigidly attached; free look rotates the head
      Quaternion.RotationYawPitchRollToRef(this.lookYaw, this.lookPitch, 0, this.lq); this.camQ.copyFrom(p.rot);
      const eye = new Vector3(0, 1.45, 4.3).rotateByQuaternionToRef(p.rot, new Vector3()); this.cam.position.copyFrom(p.pos).addInPlace(eye);
      this.cam.rotationQuaternion!.copyFrom(p.rot.multiply(this.lq)); this.cam.fov = 1.05; return;
    }
    Quaternion.SlerpToRef(this.camQ, p.rot, Math.min(1, dt * 5), this.camQ);
    Quaternion.RotationYawPitchRollToRef(this.lookYaw, this.lookPitch, 0, this.lq);
    const q = this.camQ.multiply(this.lq);
    const back = new Vector3(0, 0, -26).rotateByQuaternionToRef(q, new Vector3()), up = new Vector3(0, 6, 0).rotateByQuaternionToRef(this.camQ, new Vector3());
    this.camPos.copyFrom(p.pos).addInPlace(back).addInPlace(up);
    const gy = groundAt(this.camPos.x, this.camPos.z) + 2; if (this.camPos.y < gy) this.camPos.y = gy;
    Vector3.LerpToRef(this.cam.position, this.camPos, Math.min(1, dt * 10), this.cam.position);
    this.cam.rotationQuaternion!.copyFrom(q);
    this.cam.fov = 1.1 + Math.max(0, p.speed - 60) / 220 * .2;
  }
}
