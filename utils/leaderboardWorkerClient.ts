import { createWorkerClient } from "./workerClient";

export const callLeaderboardWorker = createWorkerClient(
  () => new Worker(new URL("./leaderboard.worker.ts", import.meta.url), { type: "module" }),
);
