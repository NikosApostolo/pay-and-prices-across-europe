import assert from 'node:assert/strict';
import test from 'node:test';
import { definitions, eu, spending } from '../public/definitions.js';
import { choosePeriod, csvText, flagsLabel, incomePriceChange, incomePriceYears, observation, periodsFor, spendingRecord } from '../public/model.js';
import { decode, refreshSnapshot } from '../src/eurostat.js';
import { createWorker, publishSnapshot } from '../src/worker.js';

test('EUR and PPS retain the published values and produce different rankings', () => {
  const payload = sourceData(definitions.pay);
  const n = eu.length * 2;
  payload.value[0] = 100;
  payload.value[2] = 80;
  payload.value[n] = 75;
  payload.value[n + 2] = 120;
  const indicator = decode(payload,definitions.pay);
  const observe = (unit,geo) => observation(indicator,unit,geo,'2024')[0];
  assert.equal(observe('EUR','AT'),100);
  assert.equal(observe('PPS','AT'),75);
  assert.ok(observe('EUR','AT') > observe('EUR','BE'));
  assert.ok(observe('PPS','AT') < observe('PPS','BE'));
});

test('latest shared periods and explicitly incomplete periods have different coverage', () => {
  const sample = (geo, period) => [geo === 'EL' && period === '2025' ? null : 100,''];
  assert.deepEqual(choosePeriod(['2025','2024'],sample,['EL','DE']),{period:'2024',complete:true});
  assert.deepEqual(choosePeriod(['2025','2024'],sample,['EL','DE'],'2025'),{period:'2025',complete:false});
  assert.deepEqual(periodsFor({periods:['2026','2025','2024']},
    (geo,period) => period === '2026' ? [null,''] : sample(geo,period),['EL','DE']),['2025','2024']);
});

test('spending uses the published denominator and requires a full reconciliation for stacking', () => {
  const sample = Object.fromEntries(Object.keys(spending).map(code => [code,{ EL:{2025:[10,'']} }]));
  const indicator = { series:{ TOTAL:{ EL:{2025:[130.1,'p']} }, ...sample } };
  const record = spendingRecord(indicator,'EL','2025');
  const housing = record.categories.find(row => row.code === 'CP04');
  assert.equal(housing.share,100 * 10 / 130.1);
  assert.ok(record.reconciled);
  indicator.series.TOTAL.EL[2025][0] = 200;
  const offTotal = spendingRecord(indicator,'EL','2025');
  assert.equal(offTotal.complete,true);
  assert.equal(offTotal.reconciled,false);
  delete indicator.series.CP13;
  const partial = spendingRecord(indicator,'EL','2025');
  assert.equal(partial.categories[0].share,5);
  assert.equal(partial.categories.at(-1).share,null);
  assert.equal(partial.reconciled,false);
});

test('flags survive parsing and confidential values stay blank', () => {
  const payload = sourceData(definitions.pay);
  payload.status = { 0:'|C', 1:'b', 2:'e', 3:'p' };
  const { series } = decode(payload,definitions.pay);
  assert.deepEqual(series.EUR.AT['2024'],[null,'|C']);
  assert.deepEqual(series.EUR.AT['2025'],[10,'b']);
  assert.equal(flagsLabel('ep'),'Estimated, Provisional');
  assert.equal(csvText(['geo','value','flag'],[['AT',null,'|C']]),'"geo","value","flag"\r\n"AT",,"|C"\r\n');
  payload.dimension.currency.category.index = { EUR:0, USD:1 };
  assert.throws(() => decode(payload,definitions.pay),/filter mismatch/);
});

function sourceData(definition, revised = false) {
  const time = definition.filters.freq === 'M' ? ['2025-01','2025-02'] : ['2024','2025'];
  const dimensions = { ...definition.filters, geo:eu, time };
  if (definition.dataset === 'prc_ppp_ind_1') dimensions.geo = [...eu,'EU27_2020'];
  const id = Object.keys(dimensions);
  const size = Object.values(dimensions).map(codes => [codes].flat().length);
  const dimension = Object.fromEntries(Object.entries(dimensions).map(([key,codes]) =>
    [key,{category:{index:[codes].flat()}}]));
  const values = size.reduce((acc,count) => acc * count,1);
  const value = Array.from({length:values},(_,i) => {
    if (definition.dataset === 'prc_ppp_ind_1') return 100;
    if (definition.dataset === 'earn_nt_net' && revised && i === 0) return 11;
    return 10;
  });
  return { id,size,dimension,value,source:'ESTAT',class:'dataset',updated:'2026-11-22T11:00:00+0100' };
}
function fakeFetch({ revised = false, failing } = {}) {
  return async url => {
    const definition = Object.values(definitions).find(row => new URL(url).pathname.endsWith('/' + row.dataset));
    return definition.dataset === failing ? new Response('',{status:503}) : Response.json(sourceData(definition,revised));
  };
}
function memoryStore() {
  let object;
  let revision = 0;
  return {
    get:async () => object,
    put:async (key, payload, { onlyIf }) => {
      if (object && (onlyIf.etagDoesNotMatch === '*' || onlyIf.etagMatches !== object.etag)) return null;
      revision++;
      object = { etag:String(revision), body:payload, json:async () => JSON.parse(payload) };
      return object;
    },
  };
}
test('hosted refresh publishes revisions to earlier observations and serves the published snapshot', async () => {
  const seed = await refreshSnapshot({fetcher:fakeFetch(),clock:() => new Date('2026-11-21T08:00:00Z')});
  const bucket = memoryStore();
  const result = await publishSnapshot(bucket,JSON.stringify(seed),fakeFetch({revised:true}));
  assert.equal(result.published,true);
  const service = createWorker({'/snapshot.json':JSON.stringify(seed)});
  const response = await service.fetch(new Request('https://example.test/snapshot.json'),{BUCKET:bucket});
  const latest = await response.json();
  const from = seed.indicators.pay.series.EUR.AT;
  const to = latest.indicators.pay.series.EUR.AT;
  assert.deepEqual(from['2024'],[10,'']);
  assert.deepEqual(to['2024'],[11,'']);
  assert.deepEqual(to['2025'],[10,'']);
  assert.equal(latest.refreshedAt,result.lastSuccessfulRefresh);
});

test('an upstream failure retains the exact last successfully published snapshot', async () => {
  const seed = await refreshSnapshot({fetcher:fakeFetch()});
  const bucket = memoryStore();
  await publishSnapshot(bucket,JSON.stringify(seed),fakeFetch({revised:true}));
  const before = (await bucket.get()).body;
  await assert.rejects(publishSnapshot(bucket,JSON.stringify(seed),fakeFetch({failing:'ilc_di03'})),/HTTP 503/);
  assert.equal((await bucket.get()).body,before);
});

test('competing refreshes preserve the winning complete snapshot', async () => {
  const seed = await refreshSnapshot({fetcher:fakeFetch()});
  const bucket = memoryStore();
  const responses = await Promise.all([
    publishSnapshot(bucket,JSON.stringify(seed),fakeFetch({revised:true})),
    publishSnapshot(bucket,JSON.stringify(seed),fakeFetch()),
  ]);
  assert.equal(responses.filter(result => result.published).length,1);
  assert.equal(responses[0].lastSuccessfulRefresh,responses[1].lastSuccessfulRefresh);
});

test('income and price changes use matched calendar years and ratios', () => {
  const income = { periods:['2025','2024','2023'], series:{NAC:{EL:{2024:[100,''],2025:[105,'']}}} };
  const annualPrice = { periods:['2025','2024','2023','2022'], series:{TOTAL:{EL:{2023:[100,''],2024:[103,''],2025:[120,'']}}} };
  const indicators = {income,annualPrice};
  const result = incomePriceChange(indicators,'EL','2024');
  assert.ok(Math.abs(result.nominal - 5) < 1e-10);
  assert.ok(Math.abs(result.priceChange - 3) < 1e-10);
  assert.ok(Math.abs(result.value - 100 * (1.05 / 1.03 - 1)) < 1e-10);
  assert.deepEqual(incomePriceYears(indicators),['2024','2023']);
  income.series.NAC.EL['2025'] = [102,'p'];
  assert.ok(incomePriceChange(indicators,'EL','2024').value < 0);
  income.series.NAC.EL['2025'] = [102,'b'];
  assert.equal(incomePriceChange(indicators,'EL','2024').value,null);
  assert.equal(incomePriceChange(indicators,'DE','2024').value,null);
  assert.match(incomePriceChange(indicators,'IE','2019').incomeIssue,/rolling period/);
  assert.match(incomePriceChange(indicators,'UK','2018').incomeIssue,/rolling period/);
});

test('an unflagged switch from national currency units to euros blocks growth', () => {
  const inputs = {
    income:{series:{NAC:{LT:{2014:[16652,''],2015:[5180,'']}},EUR:{LT:{2014:[4823,''],2015:[5180,'']}}}},
    annualPrice:{series:{TOTAL:{LT:{2013:[64.39,''],2014:[64.54,'']}}}},
  };
  assert.equal(incomePriceChange(inputs,'LT','2014').value,null);
  inputs.income.series.NAC.LT['2014'] = [4823,''];
  assert.ok(incomePriceChange(inputs,'LT','2014').value > 0);
});

test('legacy snapshots refresh without an occupation request', async () => {
  const previous = await refreshSnapshot({fetcher:fakeFetch()});
  delete previous.indicators.income.series.NAC;
  delete previous.indicators.income.series.EUR;
  delete previous.indicators.annualPrice;
  previous.indicators.occupation = {};
  assert.deepEqual(incomePriceYears(previous.indicators),[]);
  const endpoints = [];
  const updated = await refreshSnapshot({previous,fetcher:url => {
    endpoints.push(url);
    return fakeFetch()(url);
  }});
  assert.equal(updated.schema,previous.schema);
  assert.ok(updated.indicators.annualPrice && updated.indicators.income.series.NAC);
  assert.ok(!Object.hasOwn(updated.indicators,'occupation'));
  assert.ok(endpoints.every(url => !url.includes('earn_ses_hourly')));
});
