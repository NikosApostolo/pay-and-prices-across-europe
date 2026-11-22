import { benchmark, browserLink, countries, definitions, eu, occupations, prices, queryURL, scenario, spending } from './definitions.js';
import { available, choosePeriod, csvText, flagsLabel, observation, periodsFor, spendingRecord } from './model.js';

const dashboard = document.querySelector('#dashboard');
const decimal = new Intl.NumberFormat('en', { maximumFractionDigits:2 });
const oneDecimal = new Intl.NumberFormat('en', { minimumFractionDigits:1, maximumFractionDigits:1 });
const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle:'medium', timeStyle:'short', timeZone:'Europe/Athens' });
const colors = ['#6242a9','#198273','#cb711e','#a34276','#377dc0','#ad583e','#7e8e35','#8868c1','#ca5070','#8c6a3a','#4e6c9f','#558b9d','#9e5ab4'];
const allCountries = Object.keys(countries).filter(geo => geo !== benchmark);
const state = {
  view:'pay', currency:'EUR', price:'E011', occupation:'OC2', scope:'eu',
  picks:['EL','DE','NL','FR'], periods:{}, sort:{}, search:'',
};
let snapshot;
let currentExport;

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
}[char]));
const month = value => new Intl.DateTimeFormat('en', { month:'short', year:'numeric', timeZone:'UTC' })
  .format(new Date(value + '-01T00:00:00Z'));
const periodText = value => value ? (value.includes('-') ? month(value) : value) : 'Unavailable';
const unitNames = { EUR:'EUR per year', PPS:'PPS per year', price:'Index (EU-27 = 100)', occupation:'EUR per hour', spend:'% of total spending', inflation:'% year over year' };
const data = key => snapshot.indicators[key];
const read = (key, code) => (geo, period) => observation(data(key), code, geo, period);
const nameSort = (a, b) => countries[a].localeCompare(countries[b]);
const format = (kind, value) => kind === 'EUR' ? '€' + decimal.format(value) : kind === 'occupation'
  ? '€' + value.toFixed(2) : kind === 'PPS' ? decimal.format(value) : (kind === 'spend' || kind === 'inflation')
    ? oneDecimal.format(value) + '%' : decimal.format(value);

function flags(flag) {
  return flag ? ' <abbr class="flag" title="' + escape(flagsLabel(flag)) + '" aria-label="' + escape(flagsLabel(flag)) + '">' + escape(flag) + '</abbr>' : '';
}
function cell(kind, [value, flag]) {
  return (value === null ? '<span class="missing">Data unavailable</span>' : format(kind, value)) + flags(flag);
}
function select(label, id, options, selected) {
  return `<label class="control">${label}<select id="${id}">${options.map(([value, text]) =>
    `<option value="${escape(value)}"${value === selected ? ' selected' : ''}>${escape(text)}</option>`).join('')}</select></label>`;
}
function hasAny(key, code, geo) {
  return Object.values(data(key).series[code]?.[geo] ?? {}).some(available);
}
function scoped(key, code) {
  if (state.scope === 'picked') return [...state.picks];
  if (state.scope === 'eu') return [...eu];
  return allCountries.filter(geo => hasAny(key, code, geo)).sort(nameSort);
}
function meta(key, period, unit, covered, total, label = '') {
  return `<div class="chart-meta"><span>${label}${escape(period)}</span><span>${escape(unit)}</span><span>${covered} of ${total} countries</span><a href="${browserLink(definitions[key].dataset)}" target="_blank" rel="noopener">Eurostat ${definitions[key].dataset}</a></div>`;
}
function heading(title, detail) {
  return `<div class="section-heading"><div><h2 tabindex="-1">${title}</h2><p>${detail}</p></div></div>`;
}
function scopeControl() {
  return select('Country scope', 'scope', [['eu','EU-27'],['all','All available European countries'],['picked','Selected countries']], state.scope);
}
function periodOptions(periods) {
  return [['','Latest shared period'], ...periods.map(value => [value, periodText(value)])];
}
function coverageNote(result, geos, latest) {
  if (!geos.length) return '<p class="notice">Pin countries in Compare countries to use this selection.</p>';
  if (!result.period) return '<p class="notice">Data unavailable for the selected countries and indicator.</p>';
  if (!result.complete) return '<p class="notice">Some selected countries have no value for this period. They are excluded from the ranking.</p>';
  if (!state.periods[state.view] && latest && latest > result.period) return '<p class="scope-note">Latest release includes ' + periodText(latest) + '. ' + periodText(result.period) + ' is the latest period with full coverage for this selection.</p>';
  return '';
}
function exportButton() {
  return '<button id="export" type="button">Download CSV</button>';
}
function exportTable(name, headers, rows) {
  currentExport = { name, text:csvText(headers, rows) };
}
function table(headers, rows, caption) {
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="${escape(caption)}"><table aria-label="${escape(caption)}"><thead><tr>${headers.map(text => '<th scope="col">' + escape(text) + '</th>').join('')}</tr></thead><tbody>${rows.map(([name, ...cells]) =>
    `<tr><th scope="row">${escape(name)}</th>${cells.map(content => '<td>' + content + '</td>').join('')}</tr>`).join('')}</tbody></table></div>`;
}
function viewParameters(key) {
  switch (key) {
    case 'pay': return { code:state.currency, kind:state.currency, title:definitions.pay.title, sub:scenario,
      extra:`<div class="segment" role="group" aria-label="Earnings unit">${['EUR','PPS'].map(unit =>
        `<button type="button" data-unit="${unit}" aria-pressed="${unit === state.currency}">${unit}</button>`).join('')}</div>` };
    case 'price': return { code:state.price, kind:key, title:definitions.price.title, sub:'Compare the price of the same category across countries.',
      extra:select('Price category','price',Object.entries(prices),state.price) };
    case 'income': return { code:'PPS', kind:'PPS', title:definitions.income.title, sub:'Median household living standards after taxes and transfers.', extra:'' };
    case 'occupation': return { code:state.occupation, kind:key, title:definitions.occupation.title, sub:'Structure of Earnings Survey · Median gross hourly earnings',
      extra:select('Occupation group','occupation',Object.entries(occupations),state.occupation) };
  }
}

function rankingChart(rows, kind, reference) {
  const max = Math.max(1, reference ?? 0, ...rows.map(row => row[1][0] ?? 0)) * 1.06;
  return `<div class="chart-scroll" role="img" aria-label="Horizontal bar chart. The data table gives exact values.">${rows.filter(([, observation]) => available(observation)).map(([geo, result]) => {
    const [value, flag] = result;
    return `<div class="bar-row${state.picks.includes(geo) ? ' selected' : ''}"><span class="country" title="${countries[geo]}">${countries[geo]}</span><span class="bar-track" aria-hidden="true"><span class="bar" style="width:${100 * value / max}%"></span>${reference != null ? `<i class="line100" style="left:${100 * reference / max}%"></i>` : ''}</span><span class="value">${format(kind, value)}${flags(flag)}</span></div>`;
  }).join('') || '<p class="missing">Data unavailable</p>'}</div>`;
}
function sortHeader(key, name, label, active) {
  const order = active.name === name ? (active.direction === 1 ? 'ascending' : 'descending') : 'none';
  const indicator = order === 'ascending' ? ' ↑' : order === 'descending' ? ' ↓' : '';
  return `<th scope="col" aria-sort="${order}" class="${name === 'value' ? 'right' : ''}"><button type="button" data-sort="${name}" data-key="${key}">${label}${indicator}</button></th>`;
}
function payStats(rows, kind, ref) {
  return `<dl class="stat-row"><div class="stat"><dt>Countries with data</dt><dd>${rows.filter(([, result]) => available(result)).length}<small> / ${rows.length}</small></dd></div><div class="stat"><dt>Published EU-27 earnings</dt><dd>${ref[0] === null ? '—' : format(kind, ref[0]) + flags(ref[1])}</dd></div><div class="stat"><dt>Countries pinned to compare</dt><dd>${state.picks.length} / 4</dd></div></dl>`;
}

function ranking(key) {
  const { code, kind, title, sub, extra } = viewParameters(key);
  const unit = unitNames[kind];
  const geos = scoped(key, code);
  const observe = read(key, code);
  const periods = periodsFor(data(key), observe, allCountries);
  const result = choosePeriod(periods, observe, geos, state.periods[key]);
  const { period } = result;
  const allRows = geos.map(geo => [geo, observe(geo, period)]);
  const query = state.search.trim().toLowerCase();
  const rows = allRows.filter(([geo]) => countries[geo].toLowerCase().includes(query) || geo.toLowerCase() === query);
  const sort = state.sort[key] ?? { name:'value', direction:-1 };
  const byValue = (a, b) => (b[1][0] ?? -Infinity) - (a[1][0] ?? -Infinity) || nameSort(a[0], b[0]);
  const ranks = new Map(rows.filter(([, value]) => available(value)).sort(byValue).map(([geo], index) => [geo, index + 1]));
  rows.sort((a, b) => {
    if (sort.name === 'country') return sort.direction * nameSort(a[0], b[0]);
    if (!available(a[1]) || !available(b[1])) return Number(available(b[1])) - Number(available(a[1])) || nameSort(a[0], b[0]);
    return sort.direction * (a[1][0] - b[1][0]) || nameSort(a[0], b[0]);
  });
  const ref = observe(benchmark, period);
  exportTable(key + '-' + code + '-' + (period ?? 'unavailable'),
    ['Country','Eurostat geo code','Observation period','Series','Unit','Value','Eurostat flags','Dataset'],
    rows.map(([geo,[value, flag]]) => [countries[geo],geo,period,code,unit,value,flag,definitions[key].dataset]));
  const covered = rows.filter(([, result]) => available(result)).length;
  const ranksTitle = key === 'price' ? prices[code] : key === 'occupation' ? occupations[code] : title;
  return `<section class="panel">${heading(title, sub)}
    <div class="controls">${scopeControl()}${select(key === 'income' || key === 'occupation' ? 'Survey year' : 'Year','period',periodOptions(periods),state.periods[key] ?? '')}${extra}</div>
    ${coverageNote(result, geos, periods[0])}
    ${meta(key, periodText(period), unit, covered, rows.length, key === 'income' || key === 'occupation' ? 'Survey year ' : '')}
    ${key === 'pay' ? payStats(allRows, kind, ref) : ''}
    <div class="grid"><div class="subpanel"><h3>Country comparison</h3><div class="table-tools">
    <input class="search" id="search" type="search" placeholder="Find a country" aria-label="Find a country" value="${escape(state.search)}">${exportButton()}</div>
    <div class="table-scroll ranking" tabindex="0" role="region" aria-label="Sortable country comparison">
    <table aria-label="${ranksTitle}"><thead><tr><th scope="col">Rank</th>${sortHeader(key,'country','Country',sort)}${sortHeader(key,'value',kind === 'price' ? 'Index' : kind === 'occupation' ? 'EUR/hour' : kind,sort)}</tr></thead>
    <tbody>${rows.map(([geo, value]) => `<tr><td>${ranks.get(geo) ?? '—'}</td><th scope="row">${countries[geo]}</th><td class="right">${cell(kind,value)}</td></tr>`).join('') || '<tr><td colspan="3">No countries match this filter.</td></tr>'}</tbody></table></div></div>
    <figure class="subpanel"><figcaption><h3>${ranksTitle}${key === 'pay' ? ' in ' + kind : ''}</h3></figcaption>
    ${key === 'price' ? (ref[0] === null ? '<p class="definition">Eurostat EU benchmark unavailable for this period.</p>' : '<p class="bench">EU-27 = ' + ref[0] + flags(ref[1]) + '</p>') : ''}
    ${rankingChart(rows,kind,key === 'price' ? ref[0] : null)}</figure></div>
    <p class="definition">${definitions[key].description}</p>
    ${key === 'occupation' ? '<p class="definition">For many groups, the 2022 wave in this particular slice has only partial coverage. The default uses the latest shared wave. Select 2022 to inspect the reported coverage.</p>' : ''}
    ${details(key)}</section>`;
}

function details(key) {
  return `<details><summary>Data sources and methodology</summary><p class="definition">Eurostat flags appear as published. Common flags include <b>b</b> (break in series), <b>e</b> (estimated), <b>p</b> (provisional), and <b>c</b> (confidential). Values with no published observation stay blank in downloads.</p>
    <p class="definition">Latest source period with European data: <strong>${periodText(periodsFor(data(key), (geo, period) =>
      Object.keys(data(key).series).map(code => observation(data(key), code, geo, period)).find(available) ?? [null,''], allCountries)[0])}</strong>.
    Eurostat release timestamp: ${dateTime.format(new Date(data(key).updated))} Athens time.
    <a href="${escape(data(key).query)}" target="_blank" rel="noopener">Statistics API query</a> · <a href="#method">Full methodology</a></p></details>`;
}

function picker() {
  const options = allCountries.filter(geo => !state.picks.includes(geo) &&
    Object.values(snapshot.indicators).some(result => Object.values(result.series).some(series => series[geo] && Object.values(series[geo]).some(available)))).sort(nameSort);
  return `<div class="picks" aria-label="Pinned countries">${state.picks.map(geo =>
    `<button type="button" class="chip" data-remove="${geo}" aria-label="Remove ${countries[geo]}">${countries[geo]} ×</button>`).join('')}</div>
    <div class="filter-row">${state.picks.length < 4 ? select('Add a country','add-country',[['','Select a country'],...options.map(geo => [geo,countries[geo]])],'') : '<span class="scope-note">Remove a country to add another.</span>'}</div>`;
}

function comparison() {
  const items = [
    ['pay','EUR','Take-home pay','EUR'], ['pay','PPS','Take-home pay in PPS','PPS'],
    ['income','PPS','Median disposable income','PPS'], ['price','E011','Overall consumer prices','price'],
    ['spend','CP04','Housing, water, electricity, gas and other fuels','spend'],
    ['inflation','TOTAL','All-items inflation','inflation'],
  ].map(([key, code, title, kind]) => {
    const observe = key === 'spend' ? (geo, period) => {
      const record = spendingRecord(data('spend'), geo, period);
      const row = record.categories.find(category => category.code === code);
      const flag = [...new Set([row.expenditure[1], record.total[1]].filter(Boolean))].join(' ');
      return [row.share, flag];
    } : read(key, code);
    const { period } = choosePeriod(periodsFor(data(key),observe,allCountries),observe,state.picks);
    return { key, code, title, kind, period, observe };
  });
  exportTable('pinned-countries', ['Country','Eurostat geo code','Indicator','Series','Period','Unit','Value','Eurostat flags','Dataset'],
    state.picks.flatMap(geo => items.map(({key,code,title,kind,period,observe}) =>
      [countries[geo],geo,title,code,period,unitNames[kind],...observe(geo,period),definitions[key].dataset])));
  return `<section class="panel">${heading('Compare countries side by side','Pin up to four countries. Each indicator uses a shared period across the pinned countries.')}
    ${picker()}
    ${state.picks.length ? `<div class="compare-grid">${state.picks.map(geo => `<article class="compare-card"><h3>${countries[geo]}</h3><dl>${items.map(({title,kind,period,observe}) =>
      `<div><dt>${title} · ${periodText(period)}</dt><dd>${cell(kind,observe(geo,period))}</dd></div>`).join('')}</dl></article>`).join('')}</div>` : '<p class="notice">Add a country to start comparing.</p>'}
    <div class="table-tools">${exportButton()}</div>
    <p class="definition">${scenario}. Pay and income figures are annual. Price levels use EU-27 = 100. Inflation gives the percentage change versus the same month last year.</p>
    <details><summary>Periods, coverage and sources</summary>${items.map(({key,title,kind,period,observe}) => `<p class="definition"><strong>${title}</strong> · ${definitions[key].description}</p>` +
      meta(key,periodText(period),unitNames[kind],state.picks.filter(geo => available(observe(geo,period))).length,state.picks.length,key === 'income' ? 'Survey year ' : '')).join('')}</details></section>`;
}

function spendingView() {
  const indicator = data('spend');
  const observed = read('spend','TOTAL');
  // Require all 13 shares when picking a shared period for the full breakdown.
  const full = (geo, period) => [spendingRecord(indicator, geo, period).complete ? 1 : null,''];
  const geos = [...state.picks];
  const periods = periodsFor(indicator,observed,allCountries);
  const { period, complete } = choosePeriod(periods, full, geos, state.periods.spend);
  const records = geos.map(geo => [geo, spendingRecord(indicator,geo,period)]);
  const stacked = records.length > 0 && records.every(([, record]) => record.reconciled);
  const coverage = records.filter(([, record]) => record.known.length > 0).length;
  const headers = ['Category','Country','Eurostat geo code','Year','Expenditure (million EUR)','Published total (million EUR)','Share (%)','Expenditure flags','Total flags','Dataset'];
  exportTable('spending-' + (period ?? 'unavailable'), headers, records.flatMap(([geo, record]) =>
    record.categories.map(({code,expenditure,share}) => [
      spending[code],countries[geo],geo,period,expenditure[0],record.total[0],share,expenditure[1],record.total[1],definitions.spend.dataset,
    ])));
  const chart = stacked ? records.map(([geo, record]) =>
    `<div class="spending-row"><strong>${countries[geo]}${flags(record.total[1])}</strong><div class="spending-stack">${record.categories.map(({code,share,expenditure},i) =>
      `<span style="width:${share}%;background:${colors[i % colors.length]}" title="${spending[code]} · ${format('spend',share)} ${escape(expenditure[1])}"></span>`).join('')}</div></div>`).join('') :
    records.map(([geo, record]) => `<div class="spending-row"><strong>${countries[geo]}${flags(record.total[1])}</strong><span class="missing">${record.known.length ? record.known.length + ' of 13 shares available; use the data table below.' : 'Data unavailable'}</span></div>`).join('');
  const rows = Object.entries(spending).map(([code,label],index) => [label,...records.map(([, record]) => {
    const entry = record.categories[index];
    return cell('spend',[entry.share, entry.expenditure[1]]) + (record.total[1] && record.total[1] !== entry.expenditure[1] ? flags(record.total[1]) : '');
  })]);
  return `<section class="panel">${heading(definitions.spend.title,'Household final consumption expenditure by purpose, COICOP 2018.')}
    ${picker()}<div class="controls">${select('Year','period',periodOptions(periods),state.periods.spend ?? '')}</div>
    ${meta('spend',periodText(period),unitNames.spend,coverage,geos.length)}
    ${!geos.length ? '<p class="notice">Add a country to view its spending breakdown.</p>' : ''}
    ${stacked && periods[0] > period ? '<p class="scope-note">Latest release includes ' + periods[0] + '. The latest full breakdown for these countries is ' + period + '.</p>' : ''}
    ${!stacked && geos.length ? `<p class="notice">${complete ? 'The published divisions do not reconcile to the total within rounding tolerance.' : 'At least one country has an incomplete breakdown for this year.'} Available shares use the published total and appear in the table.</p>` : ''}
    <figure class="subpanel" aria-label="Spending breakdown by country. Exact shares are listed in the data table.">${chart}</figure>
    ${stacked ? '<div class="legend">' + Object.values(spending).map((label,i) => `<span><i class="swatch" style="background:${colors[i % colors.length]}"></i>${label}</span>`).join('') + '</div>' : ''}
    <p class="definition">${definitions.spend.description}</p>
    <div class="table-tools"><h3>Spending shares</h3>${exportButton()}</div>
    ${table(['Spending category',...geos.map(geo => countries[geo])],rows,'Spending shares by category')}
    ${details('spend')}</section>`;
}

function monthWindow(end, length) {
  if (!end) return [];
  const [year, number] = end.split('-').map(Number);
  return Array.from({length}, (_,i) => {
    const date = new Date(Date.UTC(year, number - length + i, 1));
    return date.toISOString().slice(0,7);
  });
}
function trendPlot(geos, periods, observe) {
  const width = 800, height = 280, left = 43, bottom = 242, top = 13, right = 27;
  const values = geos.flatMap(geo => periods.map(period => observe(geo, period)[0])).filter(Number.isFinite);
  if (!values.length) return '<p class="notice">Data unavailable for the selected window.</p>';
  const min = Math.min(0, ...values), max = Math.max(1, ...values);
  const step = Math.max(1, Math.ceil((max - min) / 5));
  const lower = Math.floor(min / step) * step, upper = Math.ceil(max / step) * step;
  const x = i => left + i / Math.max(1, periods.length - 1) * (width - left - right);
  const y = value => bottom - (value - lower) / (upper - lower) * (bottom - top);
  const guides = [];
  for (let tick = lower; tick <= upper; tick += step) {
    const pos = y(tick);
    guides.push(`<line x1="${left}" x2="${width-right}" y1="${pos}" y2="${pos}" class="trend-grid"/><text x="${left-6}" y="${pos+4}" text-anchor="end">${tick}%</text>`);
  }
  const labels = [...new Set([0,...[1,2,3,4,5].map(i => Math.round(i * (periods.length - 1) / 5))])].map(i =>
    `<text x="${x(i)}" y="${height-10}" text-anchor="${i === 0 ? 'start' : i === periods.length-1 ? 'end' : 'middle'}">${month(periods[i])}</text>`).join('');
  const lines = geos.map((geo, index) => {
    let prior = false;
    const points = [], segments = [];
    periods.forEach((period,i) => {
      const [value, flag] = observe(geo,period);
      if (value === null) { prior = false; return; }
      const px = x(i), py = y(value);
      segments.push((prior ? 'L' : 'M') + px + ' ' + py);
      points.push(`<circle cx="${px}" cy="${py}" r="${flag ? 4 : 2.5}"><title>${countries[geo]} · ${month(period)} · ${format('inflation', value)}${flag ? ' · ' + escape(flagsLabel(flag)) : ''}</title></circle>`);
      prior = true;
    });
    return `<g fill="${colors[index]}"><path d="${segments.join(' ')}" fill="none" stroke="${colors[index]}" stroke-width="2.1"/>${points.join('')}</g>`;
  }).join('');
  return `<svg class="trend" viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly year-over-year inflation. The data table gives exact values.">${guides.join('')}${labels}${lines}</svg>`;
}
function inflationView() {
  const indicator = data('inflation');
  const observe = read('inflation','TOTAL');
  const geos = [...state.picks, benchmark];
  const periods = periodsFor(indicator,observe,allCountries);
  const result = choosePeriod(periods,observe,state.picks.length ? state.picks : [benchmark],state.periods.inflation);
  const end = result.period;
  const window = monthWindow(end, Number(state.trendLength ?? 24));
  const active = geos.filter(geo => window.some(period => available(observe(geo,period))));
  const range = window.length ? month(window[0]) + ' to ' + month(end) : 'Unavailable';
  exportTable('inflation-' + (end ?? 'unavailable'), ['Country or aggregate','Eurostat geo code','Month','Unit','Value','Eurostat flags','Dataset'],
    window.flatMap(period => geos.map(geo => [countries[geo],geo,period,unitNames.inflation,...observe(geo,period),definitions.inflation.dataset])));
  return `<section class="panel">${heading(definitions.inflation.title,'Change versus the same month last year')}
    ${picker()}<div class="controls">${select('End month','period',periodOptions(periods),state.periods.inflation ?? '')}${select('Trend length','trendLength',[['12','12 months'],['24','24 months'],['60','60 months']],state.trendLength ?? '24')}</div>
    ${coverageNote(result,state.picks,periods[0])}
    ${meta('inflation',range,unitNames.inflation,state.picks.filter(geo => available(observe(geo,end))).length,state.picks.length)}
    <p class="definition">Coverage above refers to the end month. The EU-27 line uses the published aggregate. Gaps mark months without data.</p>
    <div class="legend">${active.map((geo,index) => `<span><i class="swatch" style="background:${colors[index]}"></i>${countries[geo]}</span>`).join('')}</div>
    <div class="trend-scroll">${trendPlot(active,window,observe)}</div>
    <div class="table-tools">${exportButton()}</div>
    <details><summary>Monthly data table</summary>${table(['Month',...geos.map(geo => countries[geo])],[...window].reverse().map(period => [month(period),...geos.map(geo => cell('inflation',observe(geo,period)))]),'Monthly year-over-year inflation')}</details>
    ${details('inflation')}</section>`;
}

function methodology() {
  return `<section class="panel method">${heading('Methodology','Eurostat series, data coverage and the rules behind each comparison.')}
    <h3>Countries and periods</h3><p>The EU-27 is the default ranking scope. All available European countries includes places with published data in the chosen series. The latest shared option finds the most recent period where every selected country has data. If there is no shared period, the newest available period is shown with gaps. Missing and confidential observations are blank in CSV exports. EU-27 benchmarks use the published EU-27 aggregate.</p>
    <h3>Spending shares</h3><p>Each share is 100 × division expenditure ÷ Eurostat’s published total for that country and year. We check all 13 top-level divisions against the total before showing stacked bars. The reconciliation tolerance is €0.7 million, allowing for rounding to €0.1 million for each division and the total.</p>
    <h3>Updates and revisions</h3><p>The server re-fetches the full filtered history to pick up revisions. It publishes one snapshot after checking the series, units, valid observations and coverage. If an update fails, the dashboard keeps the previous snapshot. The last successful refresh is shown separately from the observation period and Eurostat release date.</p>
    <h3>Flags and downloads</h3><p>Look for the Eurostat flags next to values. A break in series signals a comparability change, a provisional figure may be revised, and an estimate is identified by the source. Data tables and CSV exports preserve the published flags.</p>
    ${Object.entries(definitions).map(([key, definition]) => `<details><summary>${definition.title} · ${definition.dataset}</summary><p>${key === 'pay' ? scenario + '. ' : ''}${definition.description}</p>
    <p><a href="${browserLink(definition.dataset)}" target="_blank" rel="noopener">Eurostat Data Browser</a> · <a href="${escape(queryURL(definition))}" target="_blank" rel="noopener">Verified Statistics API query</a></p></details>`).join('')}
    </section>`;
}

function render() {
  const view = location.hash.slice(1);
  state.view = Object.hasOwn(definitions,view) || view === 'compare' || view === 'method' ? view : 'pay';
  document.querySelectorAll('[data-view]').forEach(tab => {
    if (tab.dataset.view === state.view) tab.setAttribute('aria-current','page');
    else tab.removeAttribute('aria-current');
  });
  currentExport = null;
  const renderers = { compare:comparison, spend:spendingView, inflation:inflationView, method:methodology };
  dashboard.innerHTML = renderers[state.view]?.() ?? ranking(state.view);
}
function rerender(focus) {
  render();
  focus?.()?.focus({ preventScroll:true });
}
window.addEventListener('hashchange', () => {
  if (!snapshot || location.hash === '#main') return;
  state.search = '';
  render();
  dashboard.querySelector('h2')?.focus({ preventScroll:true });
});
dashboard.addEventListener('change', event => {
  const { value, id } = event.target;
  if (id === 'add-country') {
    if (value && state.picks.length < 4 && !state.picks.includes(value)) state.picks.push(value);
    rerender(() => document.querySelector('#add-country') ?? dashboard.querySelector('.chip:last-child'));
  } else if (id === 'period') {
    state.periods[state.view] = value;
    rerender(() => document.querySelector('#period'));
  } else if (['scope','price','occupation','trendLength'].includes(id)) {
    state[id] = value;
    if (id !== 'trendLength') state.periods[state.view] = '';
    rerender(() => document.getElementById(id));
  }
});
dashboard.addEventListener('input', event => {
  if (event.target.id !== 'search') return;
  const position = event.target.value.length;
  state.search = event.target.value;
  render();
  const input = document.querySelector('#search');
  input.focus({ preventScroll:true });
  input.setSelectionRange(position, position);
});
dashboard.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const { unit, sort, key, remove } = button.dataset;
  if (unit) {
    state.currency = unit;
    rerender(() => dashboard.querySelector('[data-unit="' + unit + '"]'));
  } else if (sort) {
    const old = state.sort[key] ?? { name:'value', direction:-1 };
    state.sort[key] = { name:sort, direction:old.name === sort ? -old.direction : sort === 'value' ? -1 : 1 };
    rerender(() => dashboard.querySelector('[data-sort="' + sort + '"]'));
  } else if (remove) {
    state.picks = state.picks.filter(geo => geo !== remove);
    rerender(() => document.querySelector('#add-country'));
  } else if (button.id === 'export' && currentExport) {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + currentExport.text],{type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = currentExport.name + '.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
});
try {
  const response = await fetch('./snapshot.json', { cache:'no-cache' });
  if (!response.ok) throw new Error('Snapshot response ' + response.status);
  snapshot = await response.json();
  if (snapshot.schema !== 1) throw new Error('Unsupported snapshot schema');
  document.querySelector('#last-refresh').textContent = 'Last successful refresh · ' + dateTime.format(new Date(snapshot.refreshedAt)) + ' Athens time';
  render();
} catch (error) {
  console.error(error);
  dashboard.innerHTML = '<p class="waiting panel" role="alert">The Eurostat snapshot could not be loaded. Reload this page to try again.</p>';
} finally {
  dashboard.setAttribute('aria-busy','false');
}
