/** Generic object pool: avoids GC churn for bullets, missiles, particles. */
export class Pool<T> {
  private free: T[] = [];
  readonly active: T[] = [];
  constructor(private create: () => T, private onAcquire: (o: T) => void, private onRelease: (o: T) => void, prewarm = 0) {
    for (let i = 0; i < prewarm; i++) this.free.push(create());
  }
  acquire(): T { const o = this.free.pop() ?? this.create(); this.onAcquire(o); this.active.push(o); return o; }
  release(o: T) { const i = this.active.indexOf(o); if (i < 0) return; this.active[i] = this.active[this.active.length - 1]; this.active.pop(); this.onRelease(o); this.free.push(o); }
}
