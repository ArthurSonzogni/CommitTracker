const cache = new Map();

const fetchData = async user => {
  const response = await fetch(`./data/chrome/users/${user}.json`);
  const data = await response.json();

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

const chromeData = async user => {
  if (!cache.has(user)) {
    cache.set(user, fetchData(user));
  }
  return await cache.get(user);
}

const chromeDataAll = users => Promise.all(users.map(chromeData));

export default (context, inject) => {
  inject('chromeData', chromeData)
  inject('chromeDataAll', chromeDataAll)
}
