/** All sounds synthesized with WebAudio (no assets, no licensing). */
export class AudioSystem {
  ctx: AudioContext | null = null; private master!: GainNode;
  private eng?: { osc: OscillatorNode; osc2: OscillatorNode; noiseF: BiquadFilterNode; g: GainNode };
  private lockOsc?: { o: OscillatorNode; g: GainNode }; private warnT = 0; private noise!: AudioBuffer; muted = false;
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = (window.AudioContext || (window as any).webkitAudioContext); if (!C) return;
    const ctx = this.ctx = new C(); this.master = ctx.createGain(); this.master.gain.value = .5; this.master.connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // engine: two detuned saws + filtered noise roar
    const g = ctx.createGain(); g.gain.value = .12; g.connect(this.master);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.connect(g);
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; const osc2 = ctx.createOscillator(); osc2.type = 'sawtooth'; osc2.detune.value = 12;
    osc.connect(lp); osc2.connect(lp); osc.start(); osc2.start();
    const ns = ctx.createBufferSource(); ns.buffer = this.noise; ns.loop = true; const noiseF = ctx.createBiquadFilter(); noiseF.type = 'bandpass'; noiseF.Q.value = .7;
    const ng = ctx.createGain(); ng.gain.value = .6; ns.connect(noiseF).connect(ng).connect(g); ns.start();
    this.eng = { osc, osc2, noiseF, g };
    const lo = ctx.createOscillator(); lo.type = 'square'; lo.frequency.value = 1000; const lg = ctx.createGain(); lg.gain.value = 0; lo.connect(lg).connect(this.master); lo.start(); this.lockOsc = { o: lo, g: lg };
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : .5; }
  engine(throttle: number, alive: boolean) {
    if (!this.eng || !this.ctx) return; const t = this.ctx.currentTime;
    this.eng.osc.frequency.setTargetAtTime(45 + throttle * 90, t, .1); this.eng.osc2.frequency.setTargetAtTime(46 + throttle * 92, t, .1);
    this.eng.noiseF.frequency.setTargetAtTime(400 + throttle * 1600, t, .1); this.eng.g.gain.setTargetAtTime(alive ? .06 + throttle * .12 : 0, t, .2);
  }
  private shot(dur: number, f0: number, f1: number, vol: number, type: 'noise' | OscillatorType, filt = 2000) {
    const ctx = this.ctx; if (!ctx) return; const t = ctx.currentTime;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); g.connect(this.master);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(filt, t); f.frequency.exponentialRampToValueAtTime(Math.max(60, filt / 8), t + dur); f.connect(g);
    let src: AudioScheduledSourceNode;
    if (type === 'noise') { const b = ctx.createBufferSource(); b.buffer = this.noise; b.playbackRate.value = f0; src = b; }
    else { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); src = o; }
    src.connect(f); src.start(t); src.stop(t + dur + .05);
  }
  gun() { this.shot(.07, 1, 1, .25, 'noise', 3500); this.shot(.06, 160, 60, .2, 'square', 900); }
  missile() { this.shot(1.2, .6, 1, .35, 'noise', 5000); this.shot(.8, 300, 900, .08, 'sawtooth', 3000); }
  explosion(vol = 1) { this.shot(1.8, .35, 1, .8 * vol, 'noise', 1800); this.shot(1, 90, 30, .5 * vol, 'sine', 400); }
  hit() { this.shot(.08, 1.5, 1, .2, 'noise', 6000); }
  /** state: 0 none, 1 seeking (slow beeps), 2 locked (solid tone) */
  lock(state: 0 | 1 | 2, time: number) {
    if (!this.lockOsc || !this.ctx) return; const g = state === 2 ? .05 : state === 1 && (time * 4 % 1) < .5 ? .04 : 0;
    this.lockOsc.o.frequency.value = state === 2 ? 1400 : 900; this.lockOsc.g.gain.setTargetAtTime(g, this.ctx.currentTime, .01);
  }
  warning(dt: number, active: boolean) {
    if (!active) { this.warnT = 0; return; } this.warnT -= dt;
    if (this.warnT <= 0) { this.warnT = .35; this.shot(.15, 700, 500, .15, 'triangle', 4000); }
  }
}
