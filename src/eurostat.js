import { benchmark, countries, definitions, eu, queryURL } from '../public/definitions.js';

function insist(condition, message) {
  if (!condition) throw new Error(message);
}
function categoryCodes(category) {
  return Array.isArray(category.index)
    ? category.index
    : Object.keys(category.index || {}).sort((a, b) => category.index[a] - category.index[b]);
}
export const confidential = flag => String(flag || '').toLowerCase().replaceAll('|', '').replaceAll(' ', '').includes('c');

export function decode(payload, definition) {
  const { dataset, filters, selector } = definition;
  const { id, size, dimension, value, status, updated } = payload;
  const expected = [...Object.keys(filters), 'geo', 'time'];
  insist(payload.class === 'dataset' && payload.source === 'ESTAT' && Array.isArray(id)
    && id.length === expected.length && new Set(id).size === id.length && expected.every(key => id.includes(key))
    && Array.isArray(size) && size.length === id.length && value
    && typeof value === 'object' && (!status || typeof status === 'object')
    && Number.isFinite(Date.parse(updated)), dataset + ' returned an invalid dataset structure');

  const codes = id.map((key, index) => {
    const category = dimension?.[key]?.category;
    insist(category, dataset + ' has no dimension ' + key);
    const list = categoryCodes(category);
    insist(list.length === size[index] && list.length > 0 && new Set(list).size === list.length
      && (Array.isArray(category.index) || list.every((code, ordinal) => category.index[code] === ordinal)),
      dataset + ' has invalid dimension ' + key);
    if (filters[key]) {
      const requested = [filters[key]].flat();
      insist(list.length === requested.length && requested.every(code => list.includes(code)),
        dataset + ' filter mismatch for ' + key + ': ' + list.join(', '));
    }
    if (key === 'time') {
      const pattern = filters.freq === 'M' ? /^\d{4}-(0[1-9]|1[0-2])$/ : /^\d{4}$/;
      insist(list.every(period => pattern.test(period)), dataset + ' has invalid periods');
    }
    return list;
  });

  const series = Object.fromEntries(codes[id.indexOf(selector)].map(code => [code, {}]));
  const indexLimit = size.reduce((total, length) => total * length, 1);
  for (const key of new Set([...Object.keys(value), ...Object.keys(status || {})])) {
    const raw = value[key];
    const flag = status?.[key] ?? '';
    let position = Number(key);
    insist(Number.isSafeInteger(position) && position >= 0 && position < indexLimit
      && typeof flag === 'string' && (raw == null || raw === ':' || Number.isFinite(raw)),
      dataset + ' has an invalid observation at position ' + key);
    if (raw == null && !flag) continue;
    const coordinate = {};
    for (let i = size.length - 1; i >= 0; i--) {
      coordinate[id[i]] = codes[i][position % size[i]];
      position = Math.floor(position / size[i]);
    }
    const { geo, time } = coordinate;
    if (!Object.hasOwn(countries, geo)) continue;
    const number = Number.isFinite(raw) && !confidential(flag) ? raw : null;
    if (number !== null) {
      insist(dataset === 'prc_hicp_minr' ? number >= -100 : number >= 0,
        dataset + ' has an out-of-range value');
    }
    const observations = series[coordinate[selector]];
    (observations[geo] ??= {})[time] = [number, flag];
  }

  const periods = codes[id.indexOf('time')].sort().reverse();
  const labels = Object.fromEntries(id.map((key, i) => [key, Object.fromEntries(codes[i].map(code => [
    code, dimension[key].category.label?.[code] ?? code,
  ]))]));
  return { updated, periods, labels, series };
}

function publishedCount(series) {
  return Object.values(series ?? {}).flatMap(periods => Object.values(periods ?? {})).filter(([value]) => value !== null).length;
}

export function validate(snapshot, previous) {
  for (const [key, definition] of Object.entries(definitions)) {
    const result = snapshot.indicators[key];
    for (const [seriesKey, countries] of Object.entries(result.series)) {
      const oldCount = publishedCount(previous?.indicators[key]?.series[seriesKey]);
      const count = publishedCount(countries);
      if (key !== 'occupation' || oldCount) {
        insist(count > 0 && count >= 0.8 * oldCount, definition.dataset + ' unexpectedly lost coverage for ' + seriesKey);
      }
    }

    const requiredSeries = Object.values(result.series)[0];
    const covered = eu.filter(geo => publishedCount({ [geo]: requiredSeries[geo] })).length;
    insist(covered >= (key === 'occupation' ? 15 : 24), definition.dataset + ' has insufficient EU coverage');
  }

  const price = snapshot.indicators.price.series;
  for (const series of Object.values(price)) {
    for (const [period, [value]] of Object.entries(series[benchmark] ?? {})) {
      insist(value === null || value === 100, 'Unexpected EU price index benchmark for ' + period);
    }
  }
  const totals = snapshot.indicators.spend.series.TOTAL;
  for (const [geo, periods] of Object.entries(totals)) {
    for (const [period, [total]] of Object.entries(periods)) {
      if (total === null) continue;
      insist(total > 0, 'Invalid spending total for ' + geo + ' ' + period);
    }
  }
  return snapshot;
}

async function getIndicator(definition, fetcher) {
  const url = queryURL(definition);
  const response = await fetcher(url, { signal: AbortSignal.timeout(35000) });
  if (!response.ok) throw new Error(definition.dataset + ' returned HTTP ' + response.status);
  const result = decode(await response.json(), definition);
  return { ...result, query:url };
}

export async function refreshSnapshot({ previous, fetcher = fetch, clock = () => new Date() } = {}) {
  const startedAt = clock().toISOString();
  // Cloudflare permits six simultaneous connections. Fetch the six filtered series together.
  const data = await Promise.all(Object.entries(definitions).map(async ([key, definition]) =>
    [key, await getIndicator(definition, fetcher)]));
  return validate({ schema:1, startedAt, refreshedAt:clock().toISOString(), indicators:Object.fromEntries(data) }, previous);
}
