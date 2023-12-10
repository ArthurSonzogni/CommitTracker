const cache = new Map();

const fetchData = async (repo) => {
  const response = await fetch(`/data/${repo}/users_info.json`);
  if (response.status != 200) {
    return {}
  }
  return await response.json();
}

const usersInfo = async repo => {
  if (!cache.has(repo)) {
    cache.set(repo, await fetchData(repo));
  }
  return await cache.get(repo);
}

export default (context, inject) => {
  inject('usersInfo', usersInfo)
}
