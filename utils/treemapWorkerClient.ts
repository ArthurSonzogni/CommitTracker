import { createWorkerClient } from "./workerClient";

export const callTreemapWorker = createWorkerClient(
  () => new Worker(new URL("./treemap.worker.ts", import.meta.url), { type: "module" }),
);
