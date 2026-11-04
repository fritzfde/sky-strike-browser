import { Aircraft } from '../entities/Aircraft';
/**
 * Pilot G tolerance (G-suit + AGSM): G-stress accumulates above ~5.5 G (faster the harder the pull), bleeds off below 5 G.
 *  ~7 G: greyout after ≈9 s · 9 G: greyout after ≈2.5 s, blackout (G-LOC-like dark screen, controls still work) after ≈6 s.
 *  Blackout clears a few seconds after the G comes off. Negative G below −2.5 → redout (red tint). Short pulls are harmless.
 */
export class GEffects {
  stress = 0; red = 0; black = false; private el: HTMLDivElement; private canvas: HTMLElement | null;
  constructor() {
    this.el = document.createElement('div'); this.el.id = 'gfx';
    Object.assign(this.el.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '4' });
    document.body.appendChild(this.el); this.canvas = document.getElementById('c') || document.querySelector('canvas');
  }
  reset() { this.stress = 0; this.red = 0; this.black = false; }
  update(p: Aircraft, dt: number) {
    const g = p.alive && !p.onGround ? p.gLoad : 1;
    if (g > 5.5) this.stress += (g - 5.5) ** 1.5 * .025 * dt; else if (g < 5) this.stress -= (this.black ? .12 : .22) * dt;
    this.stress = Math.max(0, Math.min(1.15, this.stress));
    if (this.stress >= 1) this.black = true; else if (this.black && this.stress < .6) this.black = false;
    this.red = Math.max(0, Math.min(1, this.red + (g < -2.5 ? (-g - 2.5) * .5 : -.6) * dt));
    const grey = Math.max(0, Math.min(1, (this.stress - .35) / .6)), tunnel = 70 - grey * 55;
    const dark = this.black ? .97 : grey * .55;
    this.el.style.background = this.red > .02 ? `rgba(200,0,0,${(this.red * .6).toFixed(3)})`
      : `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) ${tunnel}%, rgba(0,0,0,${Math.min(1, dark + grey * .4).toFixed(3)}) ${tunnel + 25}%), rgba(0,0,0,${(this.black ? .97 : grey * .25).toFixed(3)})`;
    if (this.canvas) this.canvas.style.filter = grey > .01 ? `saturate(${(1 - grey).toFixed(2)}) brightness(${(1 - grey * .3).toFixed(2)})` : this.red > .02 ? `sepia(${this.red.toFixed(2)})` : '';
  }
}
