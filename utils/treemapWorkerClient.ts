let workerInstance: Worker | null = null;
let nextMsgId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(new URL('./treemap.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerInstance.onmessage = (event: MessageEvent) => {
      const { id, result, error } = event.data;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (error) entry.reject(new Error(error));
      else entry.resolve(result);
    };
  }
  return workerInstance;
}

export function callTreemapWorker<T = any>(payload: Record<string, any>): Promise<T> {
  const id = ++nextMsgId;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...payload, id });
  });
}
