export function createWorkerClient<
  Req extends Record<string, any> = Record<string, any>,
  Res = any,
>(createWorker: () => Worker) {
  let workerInstance: Worker | null = null;
  let nextMsgId = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (err: Error) => void }>();

  const resetWorker = (message: string) => {
    const error = new Error(message);
    for (const entry of pending.values()) {
      entry.reject(error);
    }
    pending.clear();
    if (workerInstance) {
      try {
        workerInstance.terminate();
      } catch {}
      workerInstance = null;
    }
  };

  const getWorker = (): Worker => {
    if (!workerInstance) {
      const worker = createWorker();
      worker.onmessage = (event: MessageEvent) => {
        const { id, result, error } = event.data ?? {};
        const entry = pending.get(id);
        if (!entry) return;
        pending.delete(id);
        if (error) entry.reject(new Error(String(error)));
        else entry.resolve(result);
      };
      worker.onerror = (event: ErrorEvent) => {
        resetWorker(event.message || "Worker execution failed");
      };
      worker.onmessageerror = () => {
        resetWorker("Worker message deserialization failed");
      };
      workerInstance = worker;
    }
    return workerInstance;
  };

  return function callWorker<T = Res>(payload: Req): Promise<T> {
    const id = ++nextMsgId;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        getWorker().postMessage({ ...payload, id });
      } catch (err: any) {
        pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  };
}
