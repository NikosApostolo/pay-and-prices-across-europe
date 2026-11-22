import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { definitions } from '../public/definitions.js';
import { observation, spendingRecord } from '../public/model.js';

const snapshot = JSON.parse(await readFile(new URL('../public/snapshot.json',import.meta.url),'utf8'));
const pairs = [
  ['pay','A.EUR+PPS.NET.P1_NCH_AW100.EL+DE+NL','currency',['2024','2025']],
  ['spend','A.CP_MEUR.TOTAL+CP01+CP04.EL+DE+FR','coicop18',['2023','2024']],
  ['price','A.PLI_EU27_2020.E011+A010101+A0104+A010405+A0107.EL+DE+EU27_2020','ppp_cat18',['2024','2025']],
  ['income','A.TOTAL.T.MED_EI.PPS.EL+DE+EU27_2020','unit',['2023','2024']],
  ['inflation','M.RCH_A.TOTAL.EL+DE+EU27_2020','coicop18',['2025-10','2026-10']],
  ['occupation','A.B-S_X_O.OC1+OC2+OC6.TOTAL.TOTAL.T.MED_E_EUR.EL+DE+NL','isco08',['2018','2022']],
];
const endpoints = 'https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/';
async function check([key, filters, selector, periods]) {
  const dataset = definitions[key].dataset;
  const url = new URL(dataset + '/' + filters, endpoints);
  url.searchParams.set('format','TSV');
  url.searchParams.set('startPeriod',periods[0]);
  url.searchParams.set('endPeriod',periods.at(-1));
  const response = await fetch(url, { signal:AbortSignal.timeout(40000) });
  assert.ok(response.ok, dataset + ' response: ' + response.status);
  const [head, ...rows] = (await response.text()).trimEnd().split(/\r?\n/);
  const [header, ...times] = head.split('\t');
  const dimensions = header.split('\\')[0].split(',');
  assert.ok(times.length && times.map(x => x.trim()).includes(periods[0]), 'TSV did not return requested periods');
  const results = [];
  for (const row of rows) {
    const [seriesKey, ...values] = row.split('\t');
    const series = Object.fromEntries(seriesKey.split(',').map((code, i) => [dimensions[i],code]));
    for (const period of periods) {
      const index = times.findIndex(time => time.trim() === period);
      const [raw, ...status] = (values[index] ?? ':').trim().split(/\s+/);
      const actual = observation(snapshot.indicators[key],series[selector],series.geo,period);
      const expected = raw === ':' ? null : Number(raw);
      assert.equal(actual[0],expected,`${key} ${series[selector]} ${series.geo} ${period}`);
      // TSV and JSON-stat preserve the same flag, with differences in separators and case.
      assert.equal(actual[1].toLowerCase().replace(/[|\s]/g,''),status.join('').toLowerCase().replace(/[|\s]/g,''),`Flag ${key} ${series.geo} ${period}`);
      results.push([key,series[selector],series.geo,period,expected,actual[1]]);
    }
  }
  assert.ok(results.length,'No comparisons made for ' + dataset);
  return {dataset,url:url.href,results};
}
const results = await Promise.all(pairs.map(check));
for (const { dataset, url, results:rows } of results) {
  console.log(dataset, rows.length + ' cells verified', url);
  for (const row of rows) console.log(row.join('\t'));
}
const { categories, total } = spendingRecord(snapshot.indicators.spend,'EL','2024');
const housing = categories.find(category => category.code === 'CP04');
assert.equal(housing.share,100 * housing.expenditure[0] / total[0]);
console.log('Greece 2024 housing share:',housing.expenditure[0],'/ ',total[0],'× 100 =',housing.share);
