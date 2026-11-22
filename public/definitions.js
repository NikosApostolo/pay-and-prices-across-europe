export const benchmark = 'EU27_2020';
export const countries = {
  AT:'Austria', BE:'Belgium', BG:'Bulgaria', HR:'Croatia', CY:'Cyprus',
  CZ:'Czechia', DK:'Denmark', EE:'Estonia', FI:'Finland', FR:'France',
  DE:'Germany', EL:'Greece', HU:'Hungary', IE:'Ireland', IT:'Italy',
  LV:'Latvia', LT:'Lithuania', LU:'Luxembourg', MT:'Malta', NL:'Netherlands',
  PL:'Poland', PT:'Portugal', RO:'Romania', SK:'Slovakia', SI:'Slovenia',
  ES:'Spain', SE:'Sweden',
  AL:'Albania', AD:'Andorra', AM:'Armenia', AZ:'Azerbaijan', BY:'Belarus',
  BA:'Bosnia and Herzegovina', GE:'Georgia', IS:'Iceland', XK:'Kosovo',
  LI:'Liechtenstein', MD:'Moldova', MC:'Monaco', ME:'Montenegro', MK:'North Macedonia',
  NO:'Norway', RU:'Russia', SM:'San Marino', RS:'Serbia', CH:'Switzerland',
  TR:'Türkiye', UA:'Ukraine', UK:'United Kingdom', VA:'Vatican City',
  [benchmark]:'EU-27',
};
export const eu = Object.keys(countries).slice(0, 27);
export const spending = {
  CP01:'Food and non-alcoholic beverages',
  CP02:'Alcoholic beverages, tobacco and narcotics',
  CP03:'Clothing and footwear',
  CP04:'Housing, water, electricity, gas and other fuels',
  CP05:'Furnishings, household equipment and routine household maintenance',
  CP06:'Health',
  CP07:'Transport',
  CP08:'Information and communication',
  CP09:'Recreation, sport and culture',
  CP10:'Education services',
  CP11:'Restaurants and accommodation services',
  CP12:'Insurance and financial services',
  CP13:'Personal care, social protection and miscellaneous goods and services',
};
export const prices = {
  E011:'Household final consumption expenditure',
  A010101:'Food',
  A0104:'Housing, water, electricity, gas and other fuels',
  A010405:'Electricity, gas and other fuels',
  A0107:'Transport',
};
export const occupations = {
  OC1:'Managers', OC2:'Professionals', OC3:'Technicians and associate professionals',
  OC4:'Clerical support workers', OC5:'Service and sales workers',
  OC6:'Skilled agricultural, forestry and fishery workers', OC7:'Craft and related trades workers',
  OC8:'Plant and machine operators and assemblers', OC9:'Elementary occupations',
  OC0:'Armed forces occupations',
};

export const scenario = 'Single worker without children earning 100% of the national average wage';
export const definitions = {
  pay: {
    dataset:'earn_nt_net', title:'Annual take-home pay', selector:'currency',
    filters:{freq:'A', currency:['EUR','PPS'], estruct:'NET', ecase:'P1_NCH_AW100'},
    description:'Modelled net earnings after income tax and employee social contributions. The scenario uses each country’s own average wage. Eurostat’s published PPS figures adjust for differences in local price levels.',
  },
  spend: {
    dataset:'nama_10_cp18', title:'How households spend', selector:'coicop18',
    filters:{freq:'A', unit:'CP_MEUR', coicop18:['TOTAL', ...Object.keys(spending)]},
    description:'Shares of aggregate household spending within each country, including spending by visitors and excluding spending by residents abroad. Housing, water, electricity, gas and other fuels includes the estimated rental value of owner-occupied homes (imputed rent).',
  },
  price: {
    dataset:'prc_ppp_ind_1', title:'Consumer price levels', selector:'ppp_cat18',
    filters:{freq:'A', indic_ppp:'PLI_EU27_2020', ppp_cat18:Object.keys(prices)},
    description:'A value of 120 means prices for that category are 20% above the EU-27 benchmark in the selected year.',
  },
  income: {
    dataset:'ilc_di03', title:'Median disposable income', selector:'unit',
    filters:{freq:'A', age:'TOTAL', sex:'T', statinfo:'MED_EI', unit:'PPS'},
    description:'Household income after taxes and transfers, adjusted for household size and composition. The median is the middle of the resulting distribution across people. The survey year generally refers to income received in the preceding calendar year.',
  },
  inflation: {
    dataset:'prc_hicp_minr', title:'Inflation over time', selector:'coicop18',
    filters:{freq:'M', unit:'RCH_A', coicop18:'TOTAL'},
    description:'Change versus the same month last year. The published all-items harmonised consumer price rate uses ECOICOP version 2.',
  },
  occupation: {
    dataset:'earn_ses_hourly', title:'Hourly earnings by occupation', selector:'isco08',
    filters:{freq:'A', nace_r2:'B-S_X_O', isco08:Object.keys(occupations), worktime:'TOTAL', age:'TOTAL', sex:'T', indic_se:'MED_E_EUR'},
    description:'Median gross hourly earnings, in euros, for broad ISCO-08 groups. Both sexes, all ages and full- and part-time workers in industry, construction and services excluding public administration, defence and compulsory social security. The survey’s mandatory coverage starts at business units with 10 employees.',
  },
};
export const apiBase = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/';
export const browserLink = dataset => 'https://ec.europa.eu/eurostat/databrowser/view/' + dataset + '/default/table?lang=en';
export function queryURL(definition) {
  const url = new URL(definition.dataset, apiBase);
  url.searchParams.set('lang', 'EN');
  for (const [dimension, codes] of Object.entries(definition.filters)) {
    for (const code of [codes].flat()) url.searchParams.append(dimension, code);
  }
  return url.href;
}
