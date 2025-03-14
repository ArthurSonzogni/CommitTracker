const cache = new Map();

const fetchData = async (repo, type, grouping, kind) => {
  const response = await fetch(`/data/${repo}/usernames_summary_${type}_${grouping}_${kind}.json`);
  if (response.status != 200) {
    return {}
  }
  return await response.json();
}

const usersInfo = async (repo, type, grouping, kind) => {
  if (!cache.has(repo+grouping+kind)) {
    cache.set(repo, await fetchData(repo, type, grouping, kind));
  }
  return await cache.get(repo);
}

export default defineNuxtPlugin(nuxtApp => {
  nuxtApp.provide('usersInfo', usersInfo)
})

