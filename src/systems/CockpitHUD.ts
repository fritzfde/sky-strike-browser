import { Aircraft } from '../entities/Aircraft';
import { groundAt } from '../world/Terrain';
import { KT, FT, FPM, ALPHA_CRIT, pitchDeg, bankDeg } from './FlightSystem';
/**
 * Fighter-style HUD drawn on a 2D canvas over the cockpit view:
 * airspeed tape (kt, left), altitude tape (ft, right), heading tape (top), pitch ladder, flight-path marker,
 * throttle/AB, AoA, G, gear/brake/speed-brake/flaps, weapons, warnings.
 */
export class CockpitHUD {
  readonly cv = document.getElementById('chud') as HTMLCanvasElement; private g = this.cv.getContext('2d')!;
  visible = false;
  show(on: boolean) { this.visible = on; this.cv.style.display = on ? 'block' : 'none'; }
  draw(p: Aircraft, fov: number, lookOff: boolean, incoming: boolean) {
    if (!this.visible) return;
    const cv = this.cv, W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = this.g; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const col = '#3f6', cx = W / 2, cy = H * .45, ppr = (H / 2) / Math.tan(fov / 2), fs = Math.max(12, Math.min(18, H / 40));
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.6; g.font = `${fs}px monospace`; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 3;
    const kt = p.speed * KT, alt = p.pos.y * FT, agl = (p.pos.y - groundAt(p.pos.x, p.pos.z)) * FT, vs = (p.onGround ? 0 : p.vel.y) * FPM;
    const th = pitchDeg(p), bk = bankDeg(p) * Math.PI / 180, hdg = ((Math.atan2(p.fwd.x, p.fwd.z) * 180 / Math.PI) + 360) % 360;
    const line = (x1: number, y1: number, x2: number, y2: number) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    if (!lookOff) {
      // ---- pitch ladder (rotates with bank) ----
      g.save(); g.translate(cx, cy); g.rotate(-bk);
      g.beginPath(); g.rect(-W * .22, -H * .3, W * .44, H * .6); g.clip();
      for (let a = -90; a <= 90; a += 5) {
        const y = (th - a) * Math.PI / 180 * ppr; if (Math.abs(y) > H * .35) continue;
        const w = a === 0 ? W * .2 : W * .07, gap = W * .03;
        g.setLineDash(a < 0 ? [6, 5] : []);
        line(-w - gap, y, -gap, y); line(gap, y, gap + w, y);
        if (a !== 0) { line(-w - gap, y, -w - gap, y + (a > 0 ? 7 : -7)); line(gap + w, y, gap + w, y + (a > 0 ? 7 : -7)); g.textAlign = 'right'; g.fillText(String(Math.abs(a)), -w - gap - 4, y); g.textAlign = 'left'; g.fillText(String(Math.abs(a)), gap + w + 4, y); }
      }
      g.setLineDash([]); g.restore();
      // ---- boresight (gun cross) & flight-path marker ----
      line(cx - 10, cy, cx - 4, cy); line(cx + 4, cy, cx + 10, cy); line(cx, cy - 10, cx, cy - 4);
      const fx = cx + (p.onGround ? 0 : p.beta) * ppr, fy = cy + (p.onGround ? 0 : p.aoa) * ppr;
      g.beginPath(); g.arc(fx, fy, 7, 0, 7); g.stroke(); line(fx - 18, fy, fx - 7, fy); line(fx + 7, fy, fx + 18, fy); line(fx, fy - 7, fx, fy - 14);
    }
    // ---- airspeed tape ----
    const tape = (x: number, val: number, step: number, label: number, pxPer: number, left: boolean, big: string) => {
      const h = H * .42, top = cy - h / 2; g.save(); g.beginPath(); g.rect(x - 60, top, 120, h); g.clip();
      g.textAlign = left ? 'right' : 'left';
      for (let v = Math.floor((val - h / 2 / pxPer) / step) * step; v < val + h / 2 / pxPer; v += step) {
        if (v < 0 && !left) { /* allow negative altitude */ } const y = cy - (v - val) * pxPer;
        const major = Math.round(v) % label === 0; line(x, y, x + (left ? -1 : 1) * (major ? 12 : 6), y);
        if (major && Math.abs(y - cy) > fs) g.fillText(String(Math.round(v)), x + (left ? -16 : 16), y);
      }
      g.restore(); line(x, top, x, top + h);
      const bw = 78, bx = left ? x - bw - 6 : x + 6; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(bx, cy - fs, bw, fs * 2); g.fillStyle = col; g.strokeRect(bx, cy - fs, bw, fs * 2);
      g.font = `bold ${fs * 1.4}px monospace`; g.textAlign = 'center'; g.fillText(big, bx + bw / 2, cy); g.font = `${fs}px monospace`;
    };
    tape(cx - W * .27, kt, 10, 50, 3, true, String(Math.round(kt)));
    tape(cx + W * .27, alt, 100, 500, .3, false, String(Math.round(alt)));
    g.textAlign = 'center';
    g.fillText('KT', cx - W * .27 - 45, cy - H * .23); g.fillText('FT', cx + W * .27 + 45, cy - H * .23);
    g.fillText(`${vs >= 0 ? '+' : ''}${Math.round(vs / 10) * 10} FPM`, cx + W * .27 + 45, cy + H * .24);
    if (agl < 5000) g.fillText(`R ${Math.max(0, Math.round(agl))}`, cx + W * .27 + 45, cy + H * .24 + fs * 1.4);
    // ---- heading tape ----
    const hy = H * .08; g.save(); g.beginPath(); g.rect(cx - W * .2, hy - 30, W * .4, 50); g.clip();
    for (let d = Math.floor(hdg / 5) * 5 - 40; d <= hdg + 40; d += 5) {
      const x = cx + (d - hdg) * W * .005; line(x, hy, x, hy + (d % 10 === 0 ? 10 : 5));
      if (d % 10 === 0) { const n = ((d % 360) + 360) % 360; g.fillText(n === 0 ? 'N' : n === 90 ? 'E' : n === 180 ? 'S' : n === 270 ? 'W' : String(n / 10).padStart(2, '0'), x, hy - 10); }
    }
    g.restore(); line(cx, hy + 12, cx - 5, hy + 20); line(cx, hy + 12, cx + 5, hy + 20);
    g.fillText(String(Math.round(hdg)).padStart(3, '0'), cx, hy + 32);
    // ---- data blocks ----
    const aoaDeg = p.aoa * 180 / Math.PI, bl = (lines: string[], x: number, y: number, align: CanvasTextAlign) => { g.textAlign = align; lines.forEach((s, i) => g.fillText(s, x, y + i * fs * 1.35)); };
    bl([`G ${p.gLoad.toFixed(1)}`, `α ${aoaDeg.toFixed(1)}°`, `M ${(p.speed / 340).toFixed(2)}`, `THR ${Math.round(p.throttle * 100)}%${p.abLevel > .5 ? ' AB' : ''}`], cx - W * .3, cy + H * .3, 'left');
    bl([p.gear ? 'GEAR DN' : 'GEAR UP', p.flaps ? 'FLAPS' : '', p.speedbrake ? 'SPD BRK' : '', p.brakes ? 'BRAKES' : '', `GUN ${p.ammo}  MSL ${p.missiles}`].filter(Boolean), cx + W * .3, cy + H * .3, 'right');
    // ---- warnings ----
    g.textAlign = 'center'; g.font = `bold ${fs * 1.6}px monospace`; g.fillStyle = '#f33';
    const warn = [p.alive && !p.onGround && p.aoa > ALPHA_CRIT * .9 ? 'STALL' : p.stalled && !p.onGround ? 'LOW SPEED' : '', !p.onGround && agl < 500 && vs < -1500 ? 'PULL UP' : '', incoming ? 'MISSILE' : '', p.gLoad > 8.5 ? 'OVER-G' : ''].filter(Boolean);
    warn.forEach((w, i) => g.fillText(w, cx, cy + H * .17 + i * fs * 2));
  }
}
