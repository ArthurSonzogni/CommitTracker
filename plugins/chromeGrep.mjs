const cache = new Map();

const fetchData = async grep_file => {
  const response = await fetch(`./data/grep/${grep_file}.json`);
  const data = await response.json();
  return data;
}

const chromeGrep = async grep_file => {
  if (!cache.has(grep_file)) {
    cache.set(grep_file, fetchData(grep_file));
  }
  return await cache.get(grep_file);
}

const chromeGrepAll = users => Promise.all(users.map(chromeGrep));

export default (context, inject) => {
  inject('chromeGrep', chromeGrep)
  inject('chromeGrepAll', chromeGrepAll)
}
