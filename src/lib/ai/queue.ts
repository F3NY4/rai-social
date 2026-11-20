type Job = {priority:number; run:(signal:AbortSignal)=>Promise<void>; reject:(reason:unknown)=>void};
const cancelled = () => new DOMException('Генерация отменена', 'AbortError');
export class GenerationQueue {
  private jobs:Job[] = [];
  private active?:AbortController;
  private idle: (()=>void)[] = [];
  enqueue<T>(priority:number, task:(signal:AbortSignal)=>Promise<T>) {
    return new Promise<T>((resolve,reject) => {
      this.jobs.push({priority,reject,run:async signal => {
        const result = await task(signal);
        signal.throwIfAborted();
        resolve(result);
      }});
      this.jobs.sort((a,b)=>b.priority-a.priority);
      void this.next();
    });
  }
  private async next() {
    if (this.active) return;
    const job = this.jobs.shift();
    if (!job) {
      for(const resolve of this.idle.splice(0)) resolve();
      return;
    }
    this.active = new AbortController();
    try { await job.run(this.active.signal); } catch (error) { job.reject(error); }
    finally { this.active = undefined; void this.next(); }
  }
  cancel() {
    this.active?.abort(cancelled());
    for (const job of this.jobs.splice(0)) job.reject(cancelled());
  }
  drain() {
    return this.active ? new Promise<void>(resolve => this.idle.push(resolve)) : Promise.resolve();
  }
}
