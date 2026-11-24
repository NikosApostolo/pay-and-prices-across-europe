import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { benchmark, countries, definitions, queryURL, spending } from '../public/definitions.js';
import { incomePriceChange, incomePriceYears, observation, salaryTimeline, salaryYears, spendingRecord } from '../public/model.js';

const input = process.argv[2] ?? new URL('../public/snapshot.json', import.meta.url);
async function readSnapshot(input) {
  if (typeof input !== 'string' || !input.startsWith('https://')) return JSON.parse(await readFile(input, 'utf8'));
  const response = await fetch(input, { signal:AbortSignal.timeout(20000) });
  assert.ok(response.ok, 'Could not read snapshot: HTTP ' + response.status);
  return response.json();
}

const snapshot = await readSnapshot(input);
const endpoints = 'https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/';
function normalizeFlags(flag) {
  const cleaned = flag.toLowerCase().replace(/\s/g, '');
  return cleaned === '|' ? 'b' : cleaned.replaceAll('|', '');
}
const cellKey = (series, geo, period) => [series, geo, period].join('/');

async function auditDataset([key, definition]) {
  const indicator = snapshot.indicators[key];
  assert.equal(indicator.query, queryURL(definition));
  const filter = Object.values(definition.filters).map(values => [values].flat().join('+')).join('.');
  const url = new URL(definition.dataset + '/' + filter + '.', endpoints);
  url.searchParams.set('format', 'TSV');
  const response = await fetch(url, { signal:AbortSignal.timeout(40000) });
  assert.ok(response.ok, definition.dataset + ' TSV returned HTTP ' + response.status);
  const [head, ...rows] = (await response.text()).trimEnd().split(/\r?\n/);
  const [header, ...years] = head.split('\t');
  const periods = years.map(year => year.trim());
  const fields = header.split('\\')[0].split(',');
  assert.deepEqual([...periods].sort().reverse(), indicator.periods, key + ' periods');
  const matched = new Set();
  let count = 0;
  for (const row of rows) {
    const [seriesKey, ...values] = row.split('\t');
    const coordinates = Object.fromEntries(seriesKey.split(',').map((code, i) => [fields[i], code]));
    const { geo } = coordinates;
    if (!Object.hasOwn(countries, geo)) continue;
    const series = coordinates[definition.selector];
    assert.ok(Object.hasOwn(indicator.series, series), key + ' unexpected series ' + series);
    for (const [dimension, expected] of Object.entries(definition.filters)) {
      assert.ok([expected].flat().includes(coordinates[dimension]), key + ' unexpected ' + dimension);
    }
    for (const [i, period] of periods.entries()) {
      const [value, ...rawFlags] = (values[i] ?? ':').trim().split(/\s+/);
      const flag = normalizeFlags(rawFlags.join(''));
      const expected = value === ':' || flag.includes('c') ? null : Number(value);
      const actual = observation(indicator, series, geo, period);
      const cell = cellKey(series, geo, period);
      assert.deepEqual([actual[0], normalizeFlags(actual[1])], [expected, flag], key + '/' + cell);
      matched.add(cell);
      if (expected !== null) count++;
    }
  }
  for (const [series, geos] of Object.entries(indicator.series)) {
    for (const [geo, values] of Object.entries(geos)) {
      for (const [period, [value, flag]] of Object.entries(values)) {
        if (value !== null || flag) assert.ok(matched.has(cellKey(series, geo, period)), key + ': observation absent from TSV');
      }
    }
  }
  assert.ok(count > 0);
  return { key, count };
}

const sources = await Promise.all(Object.entries(definitions).map(auditDataset));
const { indicators } = snapshot;
const near = (actual, expected, label) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), label);

let shares = 0, salaryChanges = 0, incomeChanges = 0;
for (const [geo, periods] of Object.entries(indicators.spend.series.TOTAL)) {
  for (const [period, [total]] of Object.entries(periods)) {
    const record = spendingRecord(indicators.spend,geo,period);
    for (const {code,share} of record.categories) {
      const raw = observation(indicators.spend,code,geo,period)[0];
      if (total > 0 && raw !== null && raw >= 0 && raw <= total) {
        near(share,raw / total * 100,geo + '/' + period + '/' + code);
        shares++;
      } else assert.equal(share,null);
    }
    if (record.reconciled) {
      assert.equal(record.known.length,Object.keys(spending).length);
      const sum = record.known.reduce((total, row) => total + row.expenditure[0],0);
      assert.ok(Math.abs(sum - total) <= 0.7000001);
    }
  }
}
const years = salaryYears(indicators);
for (const geo of [...Object.keys(indicators.pay.series.NAC),benchmark]) {
  for (const start of years) {
    const [base,...timeline] = salaryTimeline(indicators,geo,start,years.at(-1));
    for (const point of timeline) {
      if (point.payIndex !== null) near(point.payIndex,point.payPoint[0] / base.payPoint[0] * 100,geo + ' pay index');
      if (point.priceIndex !== null) near(point.priceIndex,point.pricePoint[0] / base.pricePoint[0] * 100,geo + ' price index');
      if (point.realPay === null) continue;
      near(point.realPay,100 * (point.payPoint[0] * base.pricePoint[0] / (base.payPoint[0] * point.pricePoint[0]) - 1),geo + ' real pay');
      salaryChanges++;
    }
  }
}
for (const geo of Object.keys(indicators.income.series.NAC)) {
  for (const year of incomePriceYears(indicators)) {
    const result = incomePriceChange(indicators,geo,year);
    if (result.value === null) continue;
    const last = Number(year);
    const [prior, current] = [last,last + 1].map(period => observation(indicators.income,'NAC',geo,period)[0]);
    const [priorPrice, currentPrice] = [last - 1,last].map(period => observation(indicators.annualPrice,'TOTAL',geo,period)[0]);
    near(result.nominal,100 * (current - prior) / prior,geo + ' income change');
    near(result.priceChange,100 * (currentPrice - priorPrice) / priorPrice,geo + ' price change');
    near(result.value,100 * (current * priorPrice / (prior * currentPrice) - 1),geo + ' real income');
    incomeChanges++;
  }
}
console.log('Snapshot refreshed at ' + snapshot.refreshedAt);
for (const {key,count} of sources) console.log(key + ': ' + count + ' published values match Eurostat TSV');
console.log(JSON.stringify({ publishedValues:sources.reduce((sum,row) => sum + row.count,0), shares, salaryChanges, incomeChanges }));
