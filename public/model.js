import { spending } from './definitions.js';

export const observation = (indicator, series, geo, period) => indicator.series[series]?.[geo]?.[period] ?? [null, ''];
export const available = ([value]) => Number.isFinite(value);

export function periodsFor(indicator, read, geos) {
  return indicator.periods.filter(period => geos.some(geo => available(read(geo, period))));
}

export function choosePeriod(periods, read, geos, explicit) {
  if (explicit) return { period:explicit, complete:geos.every(geo => available(read(geo, explicit))) };
  const complete = periods.find(period => geos.length && geos.every(geo => available(read(geo, period))));
  const partial = periods.find(period => geos.some(geo => available(read(geo, period))));
  return { period:complete ?? partial ?? periods[0], complete:Boolean(complete) };
}

// 13 divisions and one total can each differ by half the source's 0.1-million rounding increment.
export const tolerance = (Object.keys(spending).length + 1) * 0.05;
export function spendingRecord(indicator, geo, period) {
  const total = observation(indicator, 'TOTAL', geo, period);
  const categories = Object.keys(spending).map(code => {
    const expenditure = observation(indicator, code, geo, period);
    const share = available(expenditure) && total[0] > 0 ? 100 * expenditure[0] / total[0] : null;
    return { code, expenditure, share };
  });
  const known = categories.filter(row => row.share !== null);
  const sum = known.reduce((acc, row) => acc + row.expenditure[0], 0);
  const complete = known.length === categories.length;
  return { total, categories, known, complete, reconciled:complete && Math.abs(sum - total[0]) < tolerance + 1e-7 };
}

export function flagsLabel(flag) {
  const meanings = {
    b:'Break in time series', c:'Confidential', d:'Definition differs', e:'Estimated',
    f:'Forecast', i:'See Eurostat metadata', n:'Not significant', p:'Provisional',
    s:'Eurostat estimate', u:'Low reliability', z:'Not applicable',
  };
  return [...String(flag).toLowerCase().replace(/[|\s]/g, '')].map(code => meanings[code] || ('Eurostat flag ' + code)).join(', ') ||
    (flag.includes('|') ? 'Break in time series' : '');
}

export function csvText(headers, rows) {
  return [headers, ...rows].map(row =>
    row.map(value => value == null ? '' : '"' + String(value).replaceAll('"', '""') + '"').join(',')
  ).join('\r\n') + '\r\n';
}
