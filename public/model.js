import { spending } from './definitions.js';

export const observation = (indicator, series, geo, period) => indicator?.series[series]?.[geo]?.[period] ?? [null, ''];
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

const firstSilcSurvey = 2003;
// The reporting currency can change in a survey year near the euro changeover.
const euroAdoption = { SI:2007, CY:2008, MT:2008, SK:2009, EE:2011, LV:2014, LT:2015, HR:2023, BG:2026 };

function seriesBreak(previous, current) {
  const before = previous[1].toLowerCase();
  const after = current[1].toLowerCase();
  return after.includes('b') || after.trim() === '|' || before.includes('d') || after.includes('d');
}

function sameIncomeCurrency(income, geo, year, previous, current) {
  if (Math.abs(year - (euroAdoption[geo] ?? Infinity)) > 2) return true;
  const previousEuro = observation(income,'EUR',geo,year - 1)[0];
  const currentEuro = observation(income,'EUR',geo,year)[0];
  return previousEuro > 0 && currentEuro > 0 && (previous[0] === previousEuro) === (current[0] === currentEuro);
}

export function incomePriceYears({income,annualPrice}) {
  if (!income?.series.NAC || !annualPrice) return [];
  const surveys = new Set(income.periods);
  const prices = new Set(annualPrice.periods);
  return annualPrice.periods.filter(year => Number(year) >= firstSilcSurvey &&
    prices.has(String(Number(year) - 1)) && surveys.has(year) && surveys.has(String(Number(year) + 1)));
}

export function incomePriceChange({income,annualPrice}, geo, year) {
  const incomeYear = Number(year);
  const surveyYear = incomeYear + 1;
  const priorIncome = observation(income,'NAC',geo,incomeYear);
  const nextIncome = observation(income,'NAC',geo,surveyYear);
  const priorPrice = observation(annualPrice,'TOTAL',geo,incomeYear - 1);
  const nextPrice = observation(annualPrice,'TOTAL',geo,incomeYear);
  const incomeFlags = [priorIncome[1],nextIncome[1]];
  const priceFlags = [priorPrice[1],nextPrice[1]];
  const rate = (previous,current) => 100 * (current / previous - 1);

  let incomeIssue = '';
  if (incomeYear < firstSilcSurvey) {
    incomeIssue = 'The earlier survey predates the EU-SILC periods used here.';
  } else if (geo === 'UK' || (geo === 'IE' && incomeYear < 2020)) {
    incomeIssue = 'The income survey used a rolling period that cannot be matched to a calendar year.';
  } else if (seriesBreak(priorIncome,nextIncome)) {
    incomeIssue = 'A break in the income series prevents comparing these years.';
  } else if (!(priorIncome[0] > 0) || !available(nextIncome)) {
    incomeIssue = 'Income data are missing for one or both years.';
  } else if (!sameIncomeCurrency(income,geo,surveyYear,priorIncome,nextIncome)) {
    incomeIssue = 'These income figures cannot be verified on the same currency basis.';
  }

  let priceIssue = '';
  if (seriesBreak(priorPrice,nextPrice)) {
    priceIssue = 'A break in the price series prevents comparing these years.';
  } else if (!(priorPrice[0] > 0 && nextPrice[0] > 0)) {
    priceIssue = 'Price data are missing for one or both years.';
  }
  const nominal = incomeIssue ? null : rate(priorIncome[0],nextIncome[0]);
  const priceChange = priceIssue ? null : rate(priorPrice[0],nextPrice[0]);
  const value = incomeIssue || priceIssue ? null : rate(nextPrice[0] / priorPrice[0],nextIncome[0] / priorIncome[0]);
  return { nominal, priceChange, value, incomeFlags, priceFlags, incomeIssue, priceIssue };
}

const payMethodChanges = { EE:2005, CY:2005, LV:2005, LT:2005, MT:2005, BG:2008, RO:2008, HR:2013 };

export function salaryYears({pay,annualPrice}) {
  if (!pay?.series.NAC || !annualPrice) return [];
  const priceYears = new Set(annualPrice.periods);
  return pay.periods.filter(year => priceYears.has(year)).sort();
}

function salaryCurrencyChanges(pay, geo, previous, year) {
  const adoption = geo === 'EL' ? 2001 : euroAdoption[geo];
  if (geo === 'TR' && previous < 2004 && year >= 2004) return true;
  if (!(previous < adoption && year >= adoption)) return false;
  // Check that the published NAC values around euro adoption are on the euro-fixed scale.
  return [previous,year].some(period => {
    const nominal = observation(pay,'NAC',geo,period)[0];
    const euros = observation(pay,'EUR',geo,period)[0];
    return !(nominal > 0 && euros > 0 && Math.abs(nominal / euros - 1) <= 0.1);
  });
}

export function salaryTimeline({pay,annualPrice}, geo, start, end) {
  const first = Number(start), last = Number(end);
  if (!(first > 0 && last >= first)) return [];
  const basePay = observation(pay,'NAC',geo,first);
  const basePrice = observation(annualPrice,'TOTAL',geo,first);
  let payIssue = '', priceIssue = '', previousPayYear = first;
  const baseAvailable = basePay[0] > 0 && basePrice[0] > 0;
  return Array.from({length:last-first+1}, (_,offset) => {
    const year = first + offset;
    const payPoint = observation(pay,'NAC',geo,year);
    const pricePoint = observation(annualPrice,'TOTAL',geo,year);
    if (year > first) {
      if (!payIssue && (seriesBreak(observation(pay,'NAC',geo,year-1),payPoint) || year === payMethodChanges[geo])) {
        payIssue = 'Eurostat’s pay series changes in ' + year + '.';
      }
      if (!payIssue && payPoint[0] > 0 && salaryCurrencyChanges(pay,geo,previousPayYear,year)) {
        payIssue = 'The pay figures cross a currency change in ' + year + '.';
      }
      if (!priceIssue && seriesBreak(observation(annualPrice,'TOTAL',geo,year-1),pricePoint)) {
        priceIssue = 'The price series changes in ' + year + '.';
      }
    }
    if (payPoint[0] > 0) previousPayYear = year;
    const payIndex = baseAvailable && !payIssue && payPoint[0] > 0 ? 100 * (payPoint[0] / basePay[0]) : null;
    const priceIndex = baseAvailable && !priceIssue && pricePoint[0] > 0 ? 100 * (pricePoint[0] / basePrice[0]) : null;
    const realPay = payIndex !== null && priceIndex !== null ? 100 * (payIndex / priceIndex - 1) : null;
    const issue = !baseAvailable ? 'Data are missing for the selected start year.' :
      payIssue || priceIssue || (realPay === null ? 'Pay or price data are missing for this year.' : '');
    return {year:String(year),payIndex,priceIndex,realPay,payPoint,pricePoint,issue};
  });
}

export function sharedSalaryWindow(indicators, geos, through) {
  const years = salaryYears(indicators).filter(year => !through || year <= through);
  if (years.length < 2 || !geos.length) return null;
  const comparable = (start,end) => geos.every(geo =>
    salaryTimeline(indicators,geo,start,end).at(-1)?.realPay != null);
  for (let end = years.length - 1; end > 0; end--) {
    if (!comparable(years[end-1],years[end])) continue;
    let start = end - 1;
    while (start > 0 && comparable(years[start-1],years[start])) start--;
    return {start:years[start],end:years[end]};
  }
  return null;
}
