const cache = new Map();

const fetchData = async (repo, user) => {
  const response = await fetch(`/data/${repo}/usernames/${user}.json`);
  const data = response.status == 200
    ? await response.json()
    : {author: {}, review: {}};

  // Remove developers reviewing themselves:
  for(const date in data.review) {
    if (data.review[date] == user) {
      delete data.review[date];
    }
  }

  // Remove developers reviewing themselves:
  for(const date in data.author) {
    for(const reviewer in data.author[date]) {
      if (data.author[date][reviewer] == user) {
        delete data.author[date][reviewer];
      }
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

export default (context, inject) => {
  inject('chromeData', chromeData)
  inject('chromeDataAll', chromeDataAll)
}
