const MAX_CACHE_ENTRIES = 24;
const repoCache = new Map<string, Promise<Record<string, Record<string, number>>>>();

const CANDIDATE_LIMIT = 150; // take_n (100) + 50

let currentByDate = new Map<string, [string, number][]>();
let currentDatesDesc: string[] = [];
let currentFramesUsersDesc: [string, number][][] = [];

async function fetchRepoSummary(
  repo: string,
  type: string,
  grouping: string,
  kind: string
): Promise<Record<string, Record<string, number>>> {
  const key = `${repo}/${type}/${grouping}/${kind}`;
  if (repoCache.has(key)) {
    const promise = repoCache.get(key)!;
    repoCache.delete(key);
    repoCache.set(key, promise);
    return promise;
  }
  if (repoCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = repoCache.keys().next().value;
    if (oldestKey !== undefined) {
      repoCache.delete(oldestKey);
    }
  }
  const promise = (async () => {
    try {
      const response = await fetch(`/data/${repo}/usernames_summary_${type}_${grouping}_${kind}.json`);
      if (response.status !== 200) return {};
      return await response.json();
    } catch {
      return {};
    }
  })();
  repoCache.set(key, promise);
  return promise;
}

function mergeRepositories(
  repositoriesData: Record<string, Record<string, number>>[]
): Record<string, Record<string, number>> {
  if (repositoriesData.length === 0) return {};
  if (repositoriesData.length === 1) return repositoriesData[0];

  const out: Record<string, Record<string, number>> = Object.create(null);
  for (const data of repositoriesData) {
    for (const [developer, timevalue] of Object.entries(data)) {
      let devMap = out[developer];
      if (!devMap) {
        devMap = Object.create(null);
        out[developer] = devMap;
      }
      for (const [time, value] of Object.entries(timevalue)) {
        devMap[time] = (devMap[time] || 0) + value;
      }
    }
  }
  return out;
}

async function handleLoad(msg: {
  repositories: string[];
  type: string;
  grouping: string;
  kind: string;
}) {
  const repoData = await Promise.all(
    msg.repositories.map(repo => fetchRepoSummary(repo, msg.type, msg.grouping, msg.kind))
  );
  const merged = mergeRepositories(repoData);

  const byDate = new Map<string, [string, number][]>();
  for (const [user, timeValues] of Object.entries(merged)) {
    for (const [d, val] of Object.entries(timeValues)) {
      if (!val) continue;
      let list = byDate.get(d);
      if (!list) {
        list = [];
        byDate.set(d, list);
      }
      list.push([user, val]);
    }
  }

  const sortedDates = Array.from(byDate.keys()).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const framesUsers: [string, number][][] = new Array(sortedDates.length);

  for (let i = 0; i < sortedDates.length; i++) {
    const d = sortedDates[i];
    const allUsers = byDate.get(d)!;
    allUsers.sort((a, b) => b[1] - a[1]);
    framesUsers[i] = allUsers.slice(0, CANDIDATE_LIMIT);
  }

  currentByDate = byDate;
  currentDatesDesc = sortedDates;
  currentFramesUsersDesc = framesUsers;

  return {
    dates: sortedDates,
    framesUsers,
  };
}

function handlePreparePlayback(msg: {
  startDescIdx: number;
  shouldAccumulate: boolean;
  existingUsers: string[];
}) {
  const totalDesc = currentDatesDesc.length;
  if (totalDesc < 2) {
    return { dates: [], dateIndices: [], firstFrameUsers: [], tracks: [], transfer: [] };
  }

  const startIdx = Math.min(totalDesc - 1, Math.max(1, msg.startDescIdx || 0));
  const chronoDates: string[] = [];
  const chronoDateIndices: number[] = [];
  const chronoMaps: Map<string, number>[] = [];
  const candidateSet = new Set<string>(msg.existingUsers || []);
  let firstFrameUsers: [string, number][] = [];

  if (msg.shouldAccumulate) {
    const accu = new Map<string, number>();
    for (let dIdx = startIdx; dIdx >= 0; dIdx--) {
      const d = currentDatesDesc[dIdx];
      const contribs = currentByDate.get(d) || currentFramesUsersDesc[dIdx];
      for (let uIdx = 0; uIdx < contribs.length; uIdx++) {
        const [user, val] = contribs[uIdx];
        accu.set(user, (accu.get(user) || 0) + val);
      }
      const users = Array.from(accu.entries());
      users.sort((a, b) => b[1] - a[1]);
      const topUsers = users.slice(0, CANDIDATE_LIMIT);
      if (chronoDates.length === 0) {
        firstFrameUsers = topUsers;
      }
      const valueMap = new Map<string, number>();
      for (let i = 0; i < topUsers.length; i++) {
        const [u, v] = topUsers[i];
        valueMap.set(u, v);
        candidateSet.add(u);
      }
      chronoDates.push(d);
      chronoDateIndices.push(dIdx);
      chronoMaps.push(valueMap);
    }
  } else {
    for (let dIdx = startIdx; dIdx >= 0; dIdx--) {
      const d = currentDatesDesc[dIdx];
      const topUsers = currentFramesUsersDesc[dIdx];
      if (chronoDates.length === 0) {
        firstFrameUsers = topUsers;
      }
      const valueMap = new Map<string, number>();
      for (let i = 0; i < topUsers.length; i++) {
        const [u, v] = topUsers[i];
        valueMap.set(u, v);
        candidateSet.add(u);
      }
      chronoDates.push(d);
      chronoDateIndices.push(dIdx);
      chronoMaps.push(valueMap);
    }
  }

  const numFrames = chronoDates.length;
  const tracks: { user: string; values: Float64Array }[] = [];
  const transfer: ArrayBuffer[] = [];

  for (const user of candidateSet) {
    const values = new Float64Array(numFrames);
    let hasNonZero = false;
    for (let f = 0; f < numFrames; f++) {
      const v = chronoMaps[f].get(user) || 0;
      values[f] = v;
      if (v > 0) hasNonZero = true;
    }
    if (!hasNonZero) continue;
    tracks.push({ user, values });
    transfer.push(values.buffer);
  }

  return {
    dates: chronoDates,
    dateIndices: chronoDateIndices,
    firstFrameUsers,
    tracks,
    transfer,
  };
}

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data;
  try {
    if (msg.action === 'load') {
      const result = await handleLoad(msg);
      (self as unknown as Worker).postMessage({ id: msg.id, result });
    } else if (msg.action === 'preparePlayback') {
      const { transfer, ...result } = handlePreparePlayback(msg);
      (self as unknown as Worker).postMessage({ id: msg.id, result }, transfer);
    }
  } catch (err: any) {
    (self as unknown as Worker).postMessage({ id: msg.id, error: String(err?.message || err) });
  }
};
