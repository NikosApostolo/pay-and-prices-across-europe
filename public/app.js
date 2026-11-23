import { benchmark, browserLink, countries, definitions, eu, prices, spending } from './definitions.js';
import { available, choosePeriod, csvText, flagsLabel, incomePriceChange, incomePriceYears, observation, periodsFor, salaryTimeline, salaryYears, sharedSalaryWindow, spendingRecord } from './model.js';

const dashboard = document.querySelector('#dashboard');
const methodologyLink = document.querySelector('.method-link').href;
const plain = {
  pay:'Annual pay after taxes and employee contributions for a single worker without children earning the average wage in their country.',
  price:'The EU average is 100. A score of 120 means prices are 20% higher, and 80 means they are 20% lower.',
  income:'This is the middle income after taxes and benefits, allowing for how many adults and children live together. About half of people have more and half have less.',
  spend:'See where the money goes. The figures include spending by visitors. Housing includes utility bills and an estimate of what homeowners would pay to rent their homes.',
  inflation:'Compare prices with the same month last year. A rate of 3% means prices were 3% higher.',
};
const buyingPower = 'The figures account for local prices, so higher numbers mean you can buy more.';
const priceOptions = { ...prices, E011:'All household purchases', A0104:'Housing and utilities', A010405:'Electricity, gas and other fuels' };
const decimal = new Intl.NumberFormat('en', { maximumFractionDigits:2 });
const oneDecimal = new Intl.NumberFormat('en', { minimumFractionDigits:1, maximumFractionDigits:1 });
const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle:'medium', timeStyle:'short', timeZone:'Europe/Athens' });
const colors = ['#6242a9','#198273','#cb711e','#a34276','#377dc0','#ad583e','#7e8e35','#8868c1','#ca5070','#8c6a3a','#4e6c9f','#558b9d','#9e5ab4'];
const allCountries = Object.keys(countries).filter(geo => geo !== benchmark);
const state = {
  view:'salary-trends', salaryCountries:['EL'], salarySearch:'', salaryScope:'eu', salaryBenchmark:true, price:'E011', scope:'eu', growthScope:'eu',
  picks:['EL','DE'], periods:{}, sort:{}, search:'', inspected:{}, spendCategory:'CP04',
};
let snapshot;
let currentExport;

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
}[char]));
const month = value => new Intl.DateTimeFormat('en', { month:'short', year:'numeric', timeZone:'UTC' })
  .format(new Date(value + '-01T00:00:00Z'));
const periodText = value => value ? (value.includes('-') ? month(value) : value) : 'Unavailable';
const unitNames = { EUR:'EUR per year', PPS:'PPS per year', price:'Index (EU-27 = 100)', spend:'% of total spending', inflation:'% year over year' };
const data = key => snapshot.indicators[key];
const read = (key, code) => (geo, period) => observation(data(key), code, geo, period);
const nameSort = (a, b) => countries[a].localeCompare(countries[b]);
const format = (kind, value) => kind === 'EUR' ? '€' + decimal.format(value) : kind === 'PPS' ? decimal.format(value) : (kind === 'spend' || kind === 'inflation')
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
function scopeControl(id = 'scope') {
  return select('Country scope', id, [['eu','EU-27'],['all','All available European countries'],['picked','Selected countries']], state[id]);
}
function periodOptions(periods) {
  return [['','Latest available for all'], ...periods.map(value => [value, periodText(value)])];
}
function coverageNote(result, geos, latest, missing = 'Some countries have no value for this period. Their rows stay visible and their values are left out of the ranking.') {
  if (!geos.length) return '<p class="notice">Add a country to use this selection.</p>';
  if (!result.period) return '<p class="notice">Data unavailable for the selected countries and indicator.</p>';
  if (!result.complete) return '<p class="notice">' + missing + '</p>';
  if (!state.periods[state.view] && latest && latest > result.period) return '<p class="scope-note">Some countries have newer data. ' + periodText(result.period) + ' is the latest period with figures for every country in this comparison.</p>';
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
    case 'price': return { code:state.price, kind:key, title:'How prices compare', sub:plain.price,
      extra:select('What to compare','price',Object.entries(priceOptions),state.price) };
    case 'income': return { code:'PPS', kind:'PPS', title:'What can a typical household income buy?', sub:plain.income + ' ' + buyingPower, extra:'' };

  }
}

function benchmarkReading(kind, value) {
  return `<p class="bench"><i class="benchmark-key" aria-hidden="true"></i>EU-27 benchmark · <span>${cell(kind,value)}</span></p>`;
}

function rankingChart(rows, kind, reference) {
  const values = rows.filter(([, result]) => available(result));
  if (!values.length) return '<p class="missing">Data unavailable</p>';
  const max = Math.max(1, reference ?? 0, ...values.map(row => row[1][0])) * 1.06;
  const active = values.find(([geo]) => geo === state.inspected[state.view]) ?? values[0];
  const label = (geo, [value, flag]) => [countries[geo], format(kind, value), kind === 'PPS' ? 'buying power per year' : unitNames[kind], flagsLabel(flag)].filter(Boolean).join(' · ');
  return `<p id="bar-value" class="chart-reading" aria-live="polite">${escape(label(...active))}</p>
    <div class="chart-scroll" data-scroll="bars" role="group" aria-label="Country bars. Use the up and down arrow keys to inspect values.">
    ${values.map(([geo, result]) => {
      const [value, flag] = result;
      return `<button type="button" class="bar-row" data-bar="${geo}" data-reading="${escape(label(geo, result))}" aria-label="${escape(label(geo, result))}"
        aria-pressed="${geo === active[0]}" tabindex="${geo === active[0] ? 0 : -1}">
        <span class="country">${countries[geo]}</span><span class="bar-track" aria-hidden="true"><span class="bar" style="width:${100 * value / max}%"></span>${reference != null ? `<i class="benchmark-line" style="left:${100 * reference / max}%"></i>` : ''}</span>
        <span class="value">${format(kind, value)}${flags(flag)}</span></button>`;
    }).join('')}</div>`;
}
function sortHeader(key, name, label, active) {
  const order = active.direction === 1 ? 'ascending' : 'descending';
  const sorted = active.name === name;
  return `<th scope="col"${sorted ? ` aria-sort="${order}"` : ''} class="${name === 'value' ? 'right' : ''}">
    <button type="button" data-sort="${name}" data-key="${key}">${label}</button></th>`;
}
function addFromRow(geo) {
  const selected = state.picks.includes(geo);
  const full = state.picks.length >= 4;
  const label = selected ? 'Remove ' + countries[geo] : 'Add ' + countries[geo] + ' to comparison';
  return `<button class="row-pick" type="button" data-pick="${geo}" aria-label="${label}"
    ${!selected && full ? 'disabled' : ''}>${selected ? 'Remove' : 'Add'}</button>`;
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
    [...rows,[benchmark,ref]].map(([geo,[value, flag]]) => [countries[geo],geo,period,code,unit,value,flag,definitions[key].dataset]));
  const covered = rows.filter(([, result]) => available(result)).length;
  const ranksTitle = key === 'price' ? priceOptions[code] : 'What a typical income can buy';
  return `<section class="panel">${heading(title, sub)}
    <div class="controls">${scopeControl()}${select(key === 'income' ? 'Survey year' : 'Year','period',periodOptions(periods),state.periods[key] ?? '')}${extra}</div>
    ${coverageNote(result, geos, periods[0])}
    ${meta(key, periodText(period), key === 'income' ? 'Buying power per year' : unit, covered, rows.length, key === 'income' ? 'Survey year ' : '')}
    ${key === 'income' ? '<p class="survey-note">The survey usually reports what people earned or received the year before.</p>' : ''}
    ${selectionBar()}
    <div class="grid"><div class="subpanel"><h3>Country table</h3><div class="table-tools">
    <input class="search" id="search" type="search" placeholder="Find a country" aria-label="Find a country" value="${escape(state.search)}">${exportButton()}</div>
    <div class="table-scroll ranking" data-scroll="countries" tabindex="0" role="region" aria-label="Sortable country comparison">
    <table aria-label="${escape(ranksTitle)}"><thead><tr><th scope="col">Rank</th>${sortHeader(key,'country','Country',sort)}${sortHeader(key,'value',kind === 'price' ? 'Prices (EU = 100)' : 'Buying power',sort)}<th scope="col">Compare</th></tr></thead>
    <tbody>${rows.map(([geo, value]) => `<tr><td>${ranks.get(geo) ?? '—'}</td><th scope="row">${countries[geo]}</th><td class="right">${cell(kind,value)}</td><td>${addFromRow(geo)}</td></tr>`).join('') || '<tr><td colspan="4">No countries match this search.</td></tr>'}</tbody></table></div></div>
    <figure class="subpanel"><figcaption><h3>${ranksTitle}</h3></figcaption>
    ${benchmarkReading(kind,ref)}
    ${rankingChart(rows,kind,ref[0])}
    </figure></div>${details(key)}</section>`;
}

function details(key) {
  return `<details><summary>About these figures</summary>
    ${key === 'pay' || key === 'income' ? '<p class="definition">Buying power is measured in purchasing power standards (PPS). Equal values mean roughly equal buying power across countries. For example, 30,000 means about 50% more buying power than 20,000. Only figures marked € are in euros.</p>' : ''}
    <p class="definition">Eurostat flags include <b>b</b> (the series changed), <b>e</b> (estimated), <b>p</b> (may be revised), and <b>c</b> (confidential). Missing values are blank in downloads.</p>
    <p class="definition">Eurostat last updated this dataset on ${dateTime.format(new Date(data(key).updated))} Athens time.
    <a href="${methodologyLink}">Full methodology on GitHub</a></p></details>`;
}

function selectionBar(action = state.view === 'compare' ? '' : '<a class="compare-link" href="#compare">Compare side by side</a>') {
  return `<div class="selection-bar">
      <span class="selection-label">Selected countries <strong>${state.picks.length} / 4</strong></span>
      <div class="picks">${state.picks.map(geo =>
        `<button type="button" class="chip" data-remove="${geo}" aria-label="Remove ${countries[geo]} from comparison">${countries[geo]} <span aria-hidden="true">×</span></button>`).join('')}</div>
      ${action}
    </div>`;
}

function picker() {
  const options = allCountries.filter(geo => !state.picks.includes(geo) &&
    Object.values(snapshot.indicators).some(result => Object.values(result.series).some(series => series[geo] && Object.values(series[geo]).some(available)))).sort(nameSort);
  return `${selectionBar()}<div class="filter-row">${state.picks.length < 4 ?
    select('Add a country','add-country',[['','Select a country'],...options.map(geo => [geo,countries[geo]])],'') :
    '<span class="scope-note">Remove a country to add another.</span>'}</div>`;
}

function comparison() {
  const items = [
    ['pay','EUR','Take-home pay (€)','EUR'], ['pay','PPS','What take-home pay can buy','PPS'],
    ['income','PPS','What a typical household income can buy','PPS'], ['price','E011','Overall prices (EU = 100)','price'],
    ['spend','CP04','Spending on housing and utilities (%)','spend'],
    ['inflation','TOTAL','Price change since the same month last year','inflation'],
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
  const hasGaps = items.some(({period,observe}) => state.picks.some(geo => !available(observe(geo,period))));
  const comparisonRows = items.map(({title,kind,period,observe}) => [
    title + ' · ' + periodText(period), ...state.picks.map(geo => cell(kind,observe(geo,period))),
  ]);
  return `<section class="panel">${heading('Compare countries side by side','Compare up to four countries. Each row gives the latest figures available for all those countries when possible.')}
    ${picker()}
    ${state.picks.length ? `
      ${hasGaps ? '<p class="notice">Some indicators lack a shared period for all selected countries. Their rows use the latest period with any data and show where values are missing.</p>' : ''}
      <div class="table-tools">${exportButton()}</div>
      ${table(['Indicator and period',...state.picks.map(geo => countries[geo])],comparisonRows,'Side-by-side country comparison')}
    ` : '<p class="notice">Add a country to start comparing.</p>'}
    <details><summary>What these figures mean</summary>${items.map(({key,title,kind,period,observe}) =>
      `<p class="definition"><strong>${title}</strong> · ${plain[key]}${kind === 'PPS' ? ' ' + buyingPower : ''}</p>` +
      meta(key,periodText(period),kind === 'PPS' ? 'Buying power per year' : unitNames[kind],state.picks.filter(geo => available(observe(geo,period))).length,state.picks.length,key === 'income' ? 'Survey year ' : '')).join('')}
      <a href="${methodologyLink}">Full methodology on GitHub</a></details></section>`;
}

const signedRate = new Intl.NumberFormat('en', { minimumFractionDigits:1, maximumFractionDigits:1, signDisplay:'exceptZero' });
const changeLabel = value => signedRate.format(value) + '%';

function rateCell(value, observations) {
  const badges = [...new Set(observations.filter(Boolean))].map(flags).join('');
  return (value === null ? '<span class="missing">Data unavailable</span>' : changeLabel(value)) + badges;
}

function describeChange(value) {
  if (Math.abs(value) < 0.05) return 'was broadly unchanged';
  return (value > 0 ? 'rose ' : 'fell ') + oneDecimal.format(Math.abs(value)) + '%';
}

function buyingPowerChange(value) {
  if (Math.abs(value) < 0.05) return 'could buy about the same amount';
  return 'could buy ' + oneDecimal.format(Math.abs(value)) + '% ' + (value > 0 ? 'more' : 'less');
}

function explainIncomeChange(geo, row) {
  if (!row) return 'Choose a country to see what changed.';
  if (row.value === null) return countries[geo] + ' · Data unavailable. ' + [row.incomeIssue,row.priceIssue].filter(Boolean).join(' ');
  const prices = Math.abs(row.priceChange) < 0.05 ? 'were broadly unchanged' : describeChange(row.priceChange);
  return `In ${countries[geo]}, income ${describeChange(row.nominal)} and prices ${prices}. That income ${buyingPowerChange(row.value)}.`;
}

function growthChart(rows, inspected) {
  const comparable = rows.filter(([,row]) => row.value !== null)
    .sort((a,b) => b[1].value - a[1].value || nameSort(a[0],b[0]));
  const firstBar = comparable.find(([geo]) => geo === inspected)?.[0] ?? comparable[0]?.[0];
  const max = Math.max(0.1, ...comparable.map(([,row]) => Math.abs(row.value))) * 1.08;
  const bars = comparable.map(([geo,row]) => {
    const width = 50 * Math.abs(row.value) / max;
    const left = row.value < 0 ? 50 - width : 50;
    return `<button class="bar-row growth-row" type="button" data-bar="${geo}" data-reading="${escape(explainIncomeChange(geo,row))}"
      aria-label="${countries[geo]} · ${changeLabel(row.value)} after inflation" tabindex="${geo === firstBar ? 0 : -1}" aria-pressed="${geo === inspected}">
      <span class="country">${countries[geo]}</span><span class="bar-track growth-track" aria-hidden="true">
        <span class="growth-fill${row.value < 0 ? ' loss' : ''}" style="width:${width}%;left:${left}%"></span></span>
      <span class="value">${changeLabel(row.value)}</span></button>`;
  }).join('');
  return `<figure class="subpanel"><figcaption><h3>Income change after inflation</h3></figcaption>
    <p id="bar-value" class="chart-reading" aria-live="polite">${escape(explainIncomeChange(inspected,rows.find(([geo]) => geo === inspected)?.[1]))}</p>
    ${bars ? `<div class="growth-row growth-axis" aria-hidden="true"><span></span><span><span>Fell</span><strong>0%</strong><span>Rose</span></span><span></span></div>
    <div class="chart-scroll" data-scroll="bars" role="group" aria-label="Income change after inflation. Use the up and down arrow keys to inspect countries.">${bars}</div>` :
    '<p class="missing">Data unavailable</p>'}
    </figure>`;
}

function incomeVsPrices() {
  const years = incomePriceYears(snapshot.indicators);
  const title = heading('Are household incomes keeping up with prices?',
    'Did a typical household income buy more or less than the year before?');
  if (!years.length) return `<section class="panel">${title}<p class="notice">Data unavailable. The income and price history will appear after the next successful refresh.</p></section>`;

  const growth = (geo,year) => incomePriceChange(snapshot.indicators,geo,year);
  const all = allCountries.filter(geo => Object.hasOwn(data('income').series.NAC,geo) ||
    Object.hasOwn(data('annualPrice').series.TOTAL,geo)).sort(nameSort);
  const geos = state.growthScope === 'picked' ? state.picks : state.growthScope === 'all' ? all : eu;
  const visibleYears = years.filter(year => all.some(geo => growth(geo,year).value !== null));
  const result = choosePeriod(visibleYears, (geo,year) => [growth(geo,year).value,''], geos, state.periods['income-prices']);
  const { period } = result;
  const query = state.search.trim().toLowerCase();
  const rows = geos.filter(geo => countries[geo].toLowerCase().includes(query) || geo.toLowerCase() === query)
    .map(geo => [geo,growth(geo,period)]);
  const sort = state.sort['income-prices'] ?? { name:'value', direction:-1 };
  rows.sort(([left,a],[right,b]) => {
    if (sort.name === 'country') return sort.direction * nameSort(left,right);
    const x = a[sort.name], y = b[sort.name];
    if (x === null || y === null) return Number(y !== null) - Number(x !== null) || nameSort(left,right);
    return sort.direction * (x - y) || nameSort(left,right);
  });
  const coverage = rows.filter(([,row]) => row.value !== null).length;
  const inspected = [state.inspected['income-prices'],'EL'].find(geo => rows.some(([code]) => code === geo)) ?? rows[0]?.[0];

  exportTable('income-vs-prices-' + (period ?? 'unavailable'),
    ['Country','Eurostat geo code','Income reference year','Income change (%)','Price change (%)','Income change after inflation (%)',
      'Income flags (prior survey)','Income flags (current survey)','Price flags (prior calendar year)','Price flags (current calendar year)','Income comparability note','Price comparability note'],
    rows.map(([geo,row]) => [countries[geo],geo,period,row.nominal,row.priceChange,row.value,...row.incomeFlags,...row.priceFlags,row.incomeIssue,row.priceIssue]));
  const headers = [['country','Country'],['nominal','Income change'],['priceChange','Price change'],['value','After inflation']];
  const compare = state.growthScope !== 'picked' && state.picks.length
    ? '<button class="compare-link" type="button" data-growth-scope="picked">Compare selected</button>' : '';
  return `<section class="panel">${title}
    <p class="definition growth-definition">Typical means the middle income after taxes and benefits, allowing for how many adults and children live together.</p>
    <div class="controls">${scopeControl('growthScope')}${select('Income year','period',periodOptions(years),state.periods['income-prices'] ?? '')}</div>
    ${coverageNote(result,geos,visibleYears[0],'Some countries have missing data or a break in the series for this year. Select a country for the reason.')}
    <div class="chart-meta"><span>Income received in ${periodText(period)}</span><span>${period ? 'Compared with ' + (Number(period) - 1) : 'Year over year'}</span>
      <span>% change</span><span>${coverage} of ${rows.length} countries</span>
      <a href="${browserLink(definitions.income.dataset)}" target="_blank" rel="noopener">Eurostat income</a>
      <a href="${browserLink(definitions.annualPrice.dataset)}" target="_blank" rel="noopener">Eurostat prices</a></div>
    ${selectionBar(compare)}
    <div class="grid growth-grid">${growthChart(rows,inspected)}<div class="subpanel"><h3>Country table</h3><div class="table-tools">
      <input class="search" id="search" type="search" placeholder="Find a country" aria-label="Find a country" value="${escape(state.search)}">${exportButton()}</div>
      <div class="table-scroll ranking growth-table" data-scroll="countries" tabindex="0" role="region" aria-label="Income and prices by country">
      <table aria-label="Income and price changes"><thead><tr>${headers.map(([id,label]) => sortHeader('income-prices',id,label,sort)).join('')}<th scope="col">Compare</th></tr></thead>
      <tbody>${rows.map(([geo,row]) => `<tr>
        <th scope="row"><button class="country-inspect" type="button" data-growth-country="${geo}" aria-label="Inspect ${countries[geo]}">${countries[geo]}</button></th>
        <td class="right">${rateCell(row.nominal,row.incomeFlags)}</td><td class="right">${rateCell(row.priceChange,row.priceFlags)}</td>
        <td class="right real-change">${rateCell(row.value,[...row.incomeFlags,...row.priceFlags])}</td>
        <td>${addFromRow(geo)}</td></tr>`).join('') || '<tr><td colspan="5">No countries match this selection.</td></tr>'}</tbody></table>
      </div></div></div>
    <details><summary>About these figures</summary>
    <p class="definition">Each comparison uses income and average prices for the same two years. Some figures may change when Eurostat updates them (p). A change in how figures were measured (b) can leave a gap.</p>
    <p class="definition"><a href="${methodologyLink}">Full methodology on GitHub</a></p></details></section>`;
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
  const euSpending = spendingRecord(indicator,benchmark,period);
  const withBenchmark = period ? [...records,[benchmark,euSpending]] : records;
  const plotted = euSpending.reconciled ? withBenchmark : records;
  const headers = ['Category','Country','Eurostat geo code','Year','Expenditure (million EUR)','Published total (million EUR)','Share (%)','Expenditure flags','Total flags','Dataset'];
  exportTable('spending-' + (period ?? 'unavailable'), headers, withBenchmark.flatMap(([geo, record]) =>
    record.categories.map(({code,expenditure,share}) => [
      spending[code],countries[geo],geo,period,expenditure[0],record.total[0],share,expenditure[1],record.total[1],definitions.spend.dataset,
    ])));
  const chosen = state.spendCategory;
  const chart = stacked ? plotted.map(([geo, record]) =>
    `<div class="spending-row${geo === benchmark ? ' benchmark-spending' : ''}"><strong>${countries[geo]}${flags(record.total[1])}</strong><div class="spending-stack">${record.categories.map(({code,share,expenditure},i) =>
      `<button type="button" tabindex="-1" class="spending-part" data-category="${code}" aria-pressed="${chosen === code}" style="width:${share}%;background:${colors[i]}" aria-label="${countries[geo]} · ${spending[code]} · ${format('spend',share)} ${escape(flagsLabel(expenditure[1]))}"></button>`).join('')}</div></div>`).join('') : '';
  const rows = Object.entries(spending).map(([,label],index) => [label,...withBenchmark.map(([, record]) => {
    const entry = record.categories[index];
    return cell('spend',[entry.share, entry.expenditure[1]]) + (record.total[1] && record.total[1] !== entry.expenditure[1] ? flags(record.total[1]) : '');
  })]);
  const selectedRow = rows[Object.keys(spending).indexOf(chosen)];
  return `<section class="panel">${heading(definitions.spend.title,plain.spend)}
    ${picker()}<div class="controls">${select('Year','period',periodOptions(periods),state.periods.spend ?? '')}</div>
    ${meta('spend',periodText(period),unitNames.spend,coverage,geos.length)}
    ${!geos.length ? '<p class="notice">Add a country to view its spending breakdown.</p>' : ''}
    ${stacked && !state.periods.spend && periods[0] > period ? '<p class="scope-note">The latest year with a full breakdown for these countries is ' + period + '.</p>' : ''}
    ${!stacked && geos.length ? `<p class="notice">${complete ? 'Some categories and totals do not add up as published.' : 'Some countries have gaps in their spending breakdown for this year.'} The table shows all available shares.</p>` : ''}
    ${stacked ? `<figure class="subpanel"><figcaption><h3>Share of total spending</h3></figcaption>${chart}</figure>` : ''}
    ${period ? '<p class="definition">The EU-27 benchmark uses Eurostat’s EU-wide spending totals.</p>' : ''}
    ${geos.length ? `<div class="chart-inspector">
      ${select('Explore a spending category','spendCategory',Object.entries(spending),chosen)}
      ${chartReadings(withBenchmark.map(([geo]) => geo),selectedRow.slice(1))}</div>` : ''}
    <div class="table-tools"><h3>Spending data table</h3>${exportButton()}</div>
    ${table(['Spending category',...withBenchmark.map(([geo]) => countries[geo])],rows,'Spending shares by category')}
    ${details('spend')}</section>`;
}

function chartReadings(geos, readings) {
  return `<dl class="chart-readings" aria-live="polite">${geos.map((geo,i) =>
    `<div><dt>${countries[geo]}</dt><dd>${readings[i]}</dd></div>`).join('')}</dl>`;
}

function monthWindow(end, length) {
  if (!end) return [];
  const [year, number] = end.split('-').map(Number);
  return Array.from({length}, (_,i) => {
    const date = new Date(Date.UTC(year, number - length + i, 1));
    return date.toISOString().slice(0,7);
  });
}
function trendPlot(geos, periods, observe, selectedMonth) {
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
    `<text class="trend-tick" x="${x(i)}" y="${height-10}" text-anchor="${i === 0 ? 'start' : i === periods.length-1 ? 'end' : 'middle'}">${month(periods[i])}</text>`).join('');
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
    const color = geo === benchmark ? '#261b44' : colors[index];
    return `<g fill="${color}"><path d="${segments.join(' ')}" fill="none" stroke="${color}" stroke-width="2.1"${geo === benchmark ? ' stroke-dasharray="7 5"' : ''}/>${points.join('')}</g>`;
  }).join('');
  const mark = x(periods.indexOf(selectedMonth));
  const monthBands = periods.map((period,i) => {
    const start = i ? (x(i - 1) + x(i)) / 2 : left;
    const end = i < periods.length - 1 ? (x(i + 1) + x(i)) / 2 : width - right;
    return `<rect data-month="${period}" x="${start}" y="${top}" width="${end - start}" height="${bottom - top}" fill="transparent"/>`;
  }).join('');
  return `<svg class="trend" viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly inflation. Choose a month for exact values.">
    ${guides.join('')}${labels}<line class="trend-marker" x1="${mark}" x2="${mark}" y1="${top}" y2="${bottom}"/>${lines}${monthBands}</svg>`;
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
  const selectedMonth = window.includes(state.inflationMonth) ? state.inflationMonth : end;
  const range = window.length ? month(window[0]) + ' to ' + month(end) : 'Unavailable';
  exportTable('inflation-' + (end ?? 'unavailable'), ['Country or aggregate','Eurostat geo code','Month','Unit','Value','Eurostat flags','Dataset'],
    window.flatMap(period => geos.map(geo => [countries[geo],geo,period,unitNames.inflation,...observe(geo,period),definitions.inflation.dataset])));
  return `<section class="panel">${heading('How prices change over time',plain.inflation)}
    ${picker()}<div class="controls">${select('End month','period',periodOptions(periods),state.periods.inflation ?? '')}${select('Trend length','trendLength',[['12','12 months'],['24','24 months'],['60','60 months']],state.trendLength ?? '24')}</div>
    ${coverageNote(result,state.picks,periods[0],'Some selected countries have no value for the end month. Missing months leave gaps in the chart.')}
    ${meta('inflation',range,unitNames.inflation,state.picks.filter(geo => available(observe(geo,end))).length,state.picks.length)}
    <p class="definition">The dashed line shows EU-27 inflation. Gaps mark months without data.</p>
    <div class="legend">${active.map((geo,index) => `<span>${geo === benchmark ? '<i class="benchmark-key" aria-hidden="true"></i>' : `<i class="swatch" style="background:${colors[index]}"></i>`}${countries[geo]}</span>`).join('')}</div>
    ${trendPlot(active,window,observe,selectedMonth)}
    ${window.length ? `<div class="chart-inspector">
      ${select('Explore a month','inflationMonth',[...window].reverse().map(period => [period,month(period)]),selectedMonth)}
      ${chartReadings(geos,geos.map(geo => cell('inflation',observe(geo,selectedMonth))))}
    </div>` : ''}
    <div class="table-tools">${exportButton()}</div>
    <details><summary>Monthly data table</summary>${table(['Month',...geos.map(geo => countries[geo])],[...window].reverse().map(period => [month(period),...geos.map(geo => cell('inflation',observe(geo,period)))]),'Monthly year-over-year inflation')}</details>
    ${details('inflation')}</section>`;
}

function salaryWindow() {
  const years = salaryYears(snapshot.indicators);
  const geos = state.salaryCountries;
  const latest = sharedSalaryWindow(snapshot.indicators,geos);
  const fallback = latest ?? sharedSalaryWindow(snapshot.indicators,[geos[0] ?? 'EL']);
  return { years, latest, range:state.salaryRange ?? fallback ?? {start:years[0],end:years.at(-1)} };
}

function salarySummary(series, start, end) {
  const last = series.at(-1);
  if (!last || last.realPay === null) return (last?.issue ?? 'Data unavailable.') + ' Choose another date range to measure the change.';
  const prices = Math.abs(last.priceIndex - 100) < 0.05 ? 'were broadly unchanged' : describeChange(last.priceIndex - 100);
  return `From ${start} to ${end}, take-home pay ${describeChange(last.payIndex - 100)} and prices ${prices}. That pay ${buyingPowerChange(last.realPay)}.`;
}

function salaryPlot(series, domain, inspectYear) {
  const left = 51, right = 392, top = 20, bottom = 183;
  const x = i => left + i * (right-left) / Math.max(1,series.length-1);
  const y = value => bottom - (value-domain.min)*(bottom-top)/(domain.max-domain.min);
  const selected = series.findIndex(point => point.year === inspectYear);
  const guides = domain.ticks.map(value => `<line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}" class="salary-gridline"/>
    <text x="${left-6}" y="${y(value)+5}" text-anchor="end">${decimal.format(value)}</text>`).join('');
  const timeLabels = [...new Set([0,Math.round((series.length-1)/2),series.length-1])].map(i =>
    `<text x="${x(i)}" y="208" text-anchor="middle">${series[i].year}</text>`).join('');
  const lines = [['payIndex','Take-home pay','pay-line'],['priceIndex','Consumer prices','price-line']].map(([key,label,style]) => {
    let path = '', connected = false, last = -1;
    const dots = [];
    series.forEach((point,i) => {
      if (point[key] === null) { connected = false; return; }
      const px = x(i), py = y(point[key]);
      path += (connected ? 'L' : 'M') + px + ' ' + py;
      dots.push(`<circle cx="${px}" cy="${py}" r="${i === selected ? 4 : 2}" />`);
      connected = true;
      last = i;
    });
    return {label,style,last, endY:last < 0 ? 0 : y(series[last][key]), path,dots};
  }).filter(line => line.last >= 0).sort((a,b) => a.endY-b.endY);
  const shapes = lines.map((line,i) => {
    const near = lines.length === 2 && Math.abs(lines[0].endY-lines[1].endY) < 22;
    const labelY = near ? Math.min(bottom-11,Math.max(top+11,(lines[0].endY+lines[1].endY)/2)) + (i ? 11 : -11) : line.endY;
    return `<g class="${line.style}"><path class="salary-path" d="${line.path}"/>${line.dots.join('')}
      <path class="salary-leader" d="M${x(line.last)} ${line.endY}L${right+12} ${labelY}"/>
      <text x="${right+16}" y="${labelY+5}">${line.label}</text></g>`;
  }).join('');
  const hits = series.map((point,i) => {
    const start = i ? (x(i-1)+x(i))/2 : left;
    const end = i === series.length-1 ? right : (x(i)+x(i+1))/2;
    return `<rect data-salary-year="${point.year}" x="${start}" y="${top}" width="${end-start}" height="${bottom-top}" fill="transparent"/>`;
  }).join('');
  return `<svg class="salary-plot" viewBox="0 0 550 220" role="img" aria-label="Take-home pay and consumer prices indexed to 100 in the start year">
    ${guides}${timeLabels}
    ${selected < 0 ? '' : `<line x1="${x(selected)}" x2="${x(selected)}" y1="${top}" y2="${bottom}" class="trend-marker"/>`}
    ${shapes}${hits}</svg>`;
}

function salaryTrends() {
  const { years, latest, range } = salaryWindow();
  const {start,end} = range;
  const title = heading('Are salaries keeping up with prices?',
    'Take-home pay is what a single worker with no children on their country’s average wage has left after tax and contributions.');
  if (!years.length) return `<section class="panel">${title}<p class="notice">Data unavailable. Salary history will appear after the next successful refresh.</p></section>`;

  const geos = state.salaryCountries;
  const previous = latest ? sharedSalaryWindow(snapshot.indicators,geos,String(Number(latest.start)-1)) : null;
  const yearOptions = list => list.map(year => [year,year]);
  const displayedYears = years.filter(year => year >= start && year <= end);
  const inspect = displayedYears.includes(state.salaryInspect) ? state.salaryInspect : end;
  const chartGeos = state.salaryBenchmark && geos.length ? [...geos,benchmark] : geos;
  const series = chartGeos.map(geo => [geo,salaryTimeline(snapshot.indicators,geo,start,end)]);
  const points = series.flatMap(([,rows]) => rows.flatMap(row => [row.payIndex,row.priceIndex])).filter(Number.isFinite);
  const low = Math.min(100,...points), high = Math.max(100,...points);
  const step = Math.max(5,Math.ceil((high-low)/25)*5);
  const min = Math.floor(low/step)*step, max = Math.max(min+step,Math.ceil(high/step)*step);
  const ticks = Array.from({length:Math.round((max-min)/step)+1},(_,i) => min+step*i);
  const query = state.salarySearch.trim().toLowerCase();
  const options = query ? allCountries.filter(geo => !geos.includes(geo) && hasAny('pay','NAC',geo) &&
    (countries[geo].toLowerCase().includes(query) || geo.toLowerCase() === query)).sort(nameSort) : [];
  const add = geos.length < 4 ? `<label class="control">Add a country
    <input type="search" id="salarySearch" class="search" placeholder="Search countries" value="${escape(state.salarySearch)}" autocomplete="off"></label>` :
    '<p class="scope-note">Four countries selected. Remove one to add another.</p>';

  exportTable('salary-vs-prices-' + start + '-' + end,
    ['Country','Eurostat geo code','Base year','Year','Pay series currency code','Take-home pay','Annual-average HICP','Take-home pay index','Consumer price index','Pay after inflation change (%)','Pay flag','Price flag','Comparability note'],
    series.flatMap(([geo,rows]) => rows.map(row => [countries[geo],geo,start,row.year,geo === benchmark ? 'EUR' : 'NAC',row.payPoint[0],row.pricePoint[0],row.payIndex,row.priceIndex,row.realPay,row.payPoint[1],row.pricePoint[1],row.issue])));

  return `<section class="panel">${title}
    <div class="controls salary-controls">${add}
    ${select('Start year','salaryStart',yearOptions(years.filter(year => year < end)),start)}
    ${select('End year','salaryEnd',yearOptions(years.filter(year => year > start)),end)}
    <label class="benchmark-toggle"><input id="salaryBenchmark" type="checkbox"${state.salaryBenchmark ? ' checked' : ''}> Show EU-27 benchmark</label>
    ${state.salaryRange ? '<button type="button" data-salary-preset="latest">Latest comparable years</button>' : ''}
    ${previous && !state.salaryRange ? `<button type="button" data-salary-preset="${previous.start},${previous.end}">Earlier history (${previous.start}–${previous.end})</button>` : ''}
    </div>
    ${query && geos.length < 4 ? `<div class="salary-results">${options.length ?
      options.map(geo => `<button type="button" data-salary-add="${geo}">Add ${countries[geo]}</button>`).join('') : '<p class="missing">No matching countries with salary data.</p>'}</div>` : ''}
    <div class="picks salary-picks" aria-label="Countries in the charts">${geos.map(geo =>
      `<button type="button" class="chip" data-salary-remove="${geo}" aria-label="Remove ${countries[geo]} from chart">${countries[geo]} <span aria-hidden="true">×</span></button>`).join('')}</div>
    <p class="definition">Both lines start at 100 in ${start}. A value of 120 means a 20% rise since that year. The charts use the same scale.</p>
    ${geos.length && !latest && !state.salaryRange ? '<p class="notice">These countries have no shared stretch of comparable data. Choose dates to see which figures are available.</p>' : ''}
    ${geos.length ? `<div class="table-tools salary-inspect">${select('Inspect year','salaryInspect',yearOptions(displayedYears),inspect)}${exportButton()}</div>` :
      '<p class="notice">Add a country to see its salary and price history.</p>'}
    <div class="salary-cards">${series.map(([geo,rows]) => {
      const point = rows.find(row => row.year === inspect);
      const covered = rows.filter(row => row.realPay !== null);
      const coverage = covered.length ? `${covered[0].year}–${covered.at(-1).year} · ${covered.length} of ${rows.length} years with pay and price data` : 'No years with comparable pay and price figures';
      return `<figure class="salary-card${geo === benchmark ? ' salary-benchmark' : ''}"><figcaption><h3>${geo === benchmark ? 'EU-27 benchmark' : countries[geo]}</h3><p class="salary-summary">${escape(salarySummary(rows,start,end))}</p></figcaption>
        <p class="salary-coverage">${coverage}</p>
        ${rows.some(row => row.payIndex !== null || row.priceIndex !== null) ? salaryPlot(rows,{min,max,ticks},inspect) : ''}
        ${point ? `<div class="salary-reading" aria-live="polite"><strong>${point.year}</strong>
          <span class="pay-reading">Take-home pay ${cell('price',[point.payIndex,point.payPoint[1]])}</span>
          <span class="price-reading">Consumer prices ${cell('price',[point.priceIndex,point.pricePoint[1]])}</span>
          ${point.issue ? `<p class="missing">${escape(point.issue)}</p>` : ''}</div>` : ''}
        ${geo === benchmark ? '<p class="salary-coverage salary-benchmark-note">EU-27 pay is measured in euros. Countries with more workers count more in the EU average.</p>' : ''}
        </figure>`;
    }).join('')}</div>
    <p class="definition"><a href="${browserLink(definitions.pay.dataset)}">Eurostat take-home pay</a> · <a href="${browserLink(definitions.annualPrice.dataset)}">Eurostat annual prices</a> · <a href="${methodologyLink}#salaries-vs-prices">Methodology</a></p>
    </section>`;
}

function salaryRanking() {
  const {range:{start,end}} = salaryWindow();
  const euros = read('pay','EUR'), pps = read('pay','PPS'), pricesAt = read('price','E011');
  const options = allCountries.filter(geo => hasAny('pay','PPS',geo)).sort(nameSort);
  const geos = state.salaryScope === 'picked' ? state.salaryCountries : state.salaryScope === 'all' ? options : eu;
  const periods = periodsFor(data('pay'),pps,options);
  const allMeasures = (geo,year) => [euros(geo,year),pps(geo,year),pricesAt(geo,year)].every(available);
  const result = choosePeriod(periods,(geo,year) => [allMeasures(geo,year) ? 1 : null,''],geos,state.periods.pay);
  const {period} = result;
  const title = heading('Where does a salary go furthest?',
    'A higher salary can buy less where prices are higher. Buying power accounts for local prices so you can compare what salaries buy across countries.');
  const query = state.search.trim().toLowerCase();
  const rows = geos.filter(geo => !query || countries[geo].toLowerCase().includes(query) || geo.toLowerCase() === query).map(geo => ({
    geo, eur:euros(geo,period), value:pps(geo,period), prices:pricesAt(geo,period),
    trend:salaryTimeline(snapshot.indicators,geo,start,end).at(-1),
  }));
  const sort = state.sort.pay ?? {name:'value',direction:-1};
  const sorted = [...rows].sort((a,b) => {
    if (sort.name === 'country') return sort.direction * nameSort(a.geo,b.geo);
    const readSort = row => sort.name === 'real' ? row.trend?.realPay : row[sort.name][0];
    const x = readSort(a), y = readSort(b);
    if (x == null || y == null) return Number(y != null)-Number(x != null) || nameSort(a.geo,b.geo);
    return sort.direction*(x-y) || nameSort(a.geo,b.geo);
  });
  const ranked = [...rows].sort((a,b) => (b.value[0] ?? -Infinity)-(a.value[0] ?? -Infinity) || nameSort(a.geo,b.geo));
  const labelRange = start && end ? start + '–' + end : 'unavailable';
  const euRow = { geo:benchmark, eur:euros(benchmark,period), value:pps(benchmark,period), prices:pricesAt(benchmark,period),
    trend:salaryTimeline(snapshot.indicators,benchmark,start,end).at(-1) };
  const salaryCells = row => `<td>${cell('EUR',row.eur)}</td><td class="real-change">${cell('PPS',row.value)}</td><td>${cell('price',row.prices)}</td>
    <td>${row.trend?.realPay == null ? `<span class="missing" title="${escape(row.trend?.issue)}">Data unavailable</span>` : changeLabel(row.trend.realPay)}</td>`;
  exportTable('salary-purchasing-power-' + (period ?? 'unavailable'),
    ['Country','Eurostat geo code','Salary and price level year','Take-home pay (€)','Take-home pay (PPS)','Price level (EU-27=100)','Trend start year','Trend end year','Pay after inflation change (%)','EUR flag','PPS flag','Price level flag','Trend comparability note'],
    [...sorted,euRow].map(row => [countries[row.geo],row.geo,period,row.eur[0],row.value[0],row.prices[0],start,end,row.trend?.realPay,row.eur[1],row.value[1],row.prices[1],row.trend?.issue]));
  const headers = [['country','Country'],['eur','Pay (€)'],['value','Buying power'],['prices','Prices (EU = 100)'],['real','Change after inflation']];
  return `<section class="panel">${title}
    <div class="controls">
    ${select('Countries','salaryScope',[['eu','EU-27'],['all','All covered European countries'],['picked','Countries in my charts']],state.salaryScope)}
    ${select('Pay and price level year','period',periodOptions(periods),state.periods.pay ?? '')}</div>
    ${coverageNote(result,geos,periods[0],'Some countries are missing pay or price figures for this year. Countries with buying power figures still appear in the chart.')}
    <p class="definition">Pay and prices are for <strong>${periodText(period)}</strong>. The last column shows whether pay bought more or less over <strong>${labelRange}</strong>. <a href="#salary-trends">Change the trend years</a>.</p>
    <div class="grid salary-ranking"><figure class="subpanel"><figcaption><h3>What take-home pay can buy · ${periodText(period)}</h3></figcaption>
    ${benchmarkReading('PPS',euRow.value)}
    ${rankingChart(ranked.map(row => [row.geo,row.value]),'PPS',euRow.value[0])}</figure>
    <div class="subpanel"><h3>Country table</h3><div class="table-tools"><input class="search" type="search" id="search" aria-label="Find a country" placeholder="Find a country" value="${escape(state.search)}">${exportButton()}</div>
    <div class="table-scroll ranking growth-table" data-scroll="countries" tabindex="0" role="region" aria-label="Salary purchasing power comparison">
    <table><thead><tr>${headers.map(([key,label]) => sortHeader('pay',key,label,sort)).join('')}</tr></thead>
    <tbody>${sorted.map(row => `<tr><th scope="row">${countries[row.geo]}</th>${salaryCells(row)}</tr>`).join('') || '<tr><td colspan="5">No countries match this selection.</td></tr>'}</tbody>
    <tfoot><tr><th scope="row">EU-27 benchmark</th>${salaryCells(euRow)}</tr></tfoot></table></div>
    </div></div><p class="definition"><a href="#income">Typical household income</a> · <a href="#spend">Household spending</a></p>${details('pay')}</section>`;
}

function methodology() {
  return `<section class="panel">${heading('Methodology','See the definitions, Eurostat queries, and comparison rules.')}
    <a href="${methodologyLink}">Full methodology on GitHub</a></section>`;
}

function render() {
  const view = location.hash.slice(1);
  state.view = ['salary-trends','pay','price','income','income-prices','spend','inflation','compare','method'].includes(view) ? view : 'salary-trends';
  document.querySelectorAll('[data-view]').forEach(tab => {
    if (tab.dataset.view === state.view) tab.setAttribute('aria-current','page');
    else tab.removeAttribute('aria-current');
  });
  currentExport = null;
  const renderers = { 'salary-trends':salaryTrends, pay:salaryRanking, compare:comparison, spend:spendingView, inflation:inflationView, method:methodology, 'income-prices':incomeVsPrices };
  dashboard.innerHTML = renderers[state.view]?.() ?? ranking(state.view);
}
function rerender(focus) {
  const scroll = new Map([...dashboard.querySelectorAll('[data-scroll]')].map(element =>
    [element.dataset.scroll, element.scrollTop]));
  render();
  dashboard.querySelectorAll('[data-scroll]').forEach(element => {
    element.scrollTop = scroll.get(element.dataset.scroll) ?? 0;
  });
  focus?.()?.focus({ preventScroll:true });
}
function inspectBar(button, moveFocus = false) {
  state.inspected[state.view] = button.dataset.bar;
  const last = dashboard.querySelector('[data-bar][tabindex="0"]');
  if (last && last !== button) {
    last.setAttribute('aria-pressed','false');
    last.tabIndex = -1;
  }
  button.setAttribute('aria-pressed','true');
  button.tabIndex = 0;
  document.querySelector('#bar-value').textContent = button.dataset.reading;
  if (moveFocus) button.focus();
}
dashboard.addEventListener('keydown', event => {
  if (!event.target.matches('[data-bar]')) return;
  const bars = [...dashboard.querySelectorAll('[data-bar]')];
  const i = bars.indexOf(event.target);
  const next = { ArrowUp:Math.max(0,i - 1), ArrowDown:Math.min(bars.length - 1,i + 1), Home:0, End:bars.length - 1 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  inspectBar(bars[next],true);
});
window.addEventListener('hashchange', () => {
  if (!snapshot || location.hash === '#main') return;
  state.search = '';
  render();
  dashboard.querySelector('h2')?.focus({ preventScroll:true });
});
dashboard.addEventListener('change', event => {
  const { value, id } = event.target;
  if (id === 'salaryBenchmark') {
    state.salaryBenchmark = event.target.checked;
    rerender(() => document.getElementById(id));
  } else if (id === 'salaryStart' || id === 'salaryEnd') {
    const {range} = salaryWindow();
    state.salaryRange = {...range,[id === 'salaryStart' ? 'start' : 'end']:value};
    rerender(() => document.getElementById(id));
  } else if (id === 'add-country') {
    if (value && state.picks.length < 4 && !state.picks.includes(value)) state.picks.push(value);
    rerender(() => document.querySelector('#add-country') ?? dashboard.querySelector('.chip:last-child'));
  } else if (id === 'period') {
    state.periods[state.view] = value;
    if (state.view === 'inflation') state.inflationMonth = '';
    rerender(() => document.querySelector('#period'));
  } else if (['scope','growthScope','salaryScope','salaryInspect','price','trendLength','spendCategory','inflationMonth'].includes(id)) {
    state[id] = value;
    if (['scope','price'].includes(id)) state.periods[state.view] = '';
    rerender(() => document.getElementById(id));
  }
});
dashboard.addEventListener('input', event => {
  const {id, value, selectionStart, selectionEnd} = event.target;
  if (id !== 'search' && id !== 'salarySearch') return;
  state[id] = value;
  render();
  const input = document.getElementById(id);
  input.focus({ preventScroll:true });
  input.setSelectionRange(selectionStart, selectionEnd);
});
dashboard.addEventListener('click', event => {
  const salaryPoint = event.target.closest('[data-salary-year]');
  if (salaryPoint) {
    state.salaryInspect = salaryPoint.dataset.salaryYear;
    rerender(() => document.getElementById('salaryInspect'));
    return;
  }
  const band = event.target.closest('[data-month]');
  if (band) {
    state.inflationMonth = band.dataset.month;
    rerender(() => document.querySelector('#inflationMonth'));
    return;
  }
  const button = event.target.closest('button');
  if (!button) return;
  const { sort, key, remove, pick, bar, category, growthCountry, growthScope, salaryAdd, salaryRemove, salaryPreset } = button.dataset;
  if (salaryAdd || salaryRemove) {
    if (salaryAdd && state.salaryCountries.length < 4 && !state.salaryCountries.includes(salaryAdd)) {
      state.salaryCountries.push(salaryAdd);
      state.salarySearch = '';
    } else if (salaryRemove) {
      state.salaryCountries = state.salaryCountries.filter(geo => geo !== salaryRemove);
    }
    rerender(() => document.getElementById('salarySearch') ?? dashboard.querySelector('[data-salary-remove]'));
  } else if (salaryPreset) {
    const [start,end] = salaryPreset.split(',');
    state.salaryRange = end ? {start,end} : null;
    state.salaryInspect = null;
    rerender(() => document.getElementById('salaryStart'));
  } else if (sort) {
    const old = state.sort[key] ?? { name:'value', direction:-1 };
    state.sort[key] = { name:sort, direction:old.name === sort ? -old.direction : sort === 'country' ? 1 : -1 };
    rerender(() => dashboard.querySelector('[data-sort="' + sort + '"]'));
  } else if (remove || pick) {
    const geo = remove || pick;
    if (state.picks.includes(geo)) state.picks = state.picks.filter(selected => selected !== geo);
    else if (state.picks.length < 4) state.picks.push(geo);
    rerender(() => (pick ? dashboard.querySelector('[data-pick="' + geo + '"]') : dashboard.querySelector('[data-remove]'))
      ?? dashboard.querySelector('#add-country, #search'));
  } else if (growthScope) {
    state.growthScope = growthScope;
    state.search = '';
    rerender(() => document.querySelector('#growthScope'));
  } else if (growthCountry) {
    state.inspected[state.view] = growthCountry;
    rerender(() => dashboard.querySelector('[data-growth-country="' + growthCountry + '"]'));
  } else if (bar) {
    inspectBar(button,true);
  } else if (category) {
    state.spendCategory = category;
    rerender(() => document.querySelector('#spendCategory'));
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
