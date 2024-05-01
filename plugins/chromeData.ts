const cache = new Map();

const fetchData = async (repo, user) => {
  const response = await fetch(`/data/${repo}/usernames/${user}.json`);
  const data = response.status == 200
    ? await response.json()
    : []

  // Remove developers reviewing themselves:
  for(const commit of data) {
    const index = commit.peers.indexOf(user);
    if (index !== -1) {
      commit.peers.splice(index, 1);
    }
  }

  return {
    developer: user,
    data: data,
  }
}

const chromeData = async (repo, user) => {
  const key = repo +  user;
  if (!cache.has(key)) {
    cache.set(key, fetchData(repo, user));
  }
  return await cache.get(key);
}

const chromeDataAll = (repo, users) => Promise.all(users.map(user => {
  return chromeData(repo, user);
}));

export default defineNuxtPlugin(nuxtApp => {
  nuxtApp.provide('chromeData', chromeData)
  nuxtApp.provide('chromeDataAll', chromeDataAll)
})

