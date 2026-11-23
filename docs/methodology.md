# Methodology

The dashboard compares pay, spending, prices and income across countries. The two salary views show what pay buys across countries and how it has changed over time. The separate household income view uses survey-based income data. It uses Eurostat’s Statistics API for the dashboard snapshot and Eurostat’s Data Browser TSV download format to cross-check published observations. The dashboard records each API query and its source timestamp alongside the values and flags.

| View | Eurostat dataset and exact selection |
| --- | --- |
| Take-home pay | [earn_nt_net](https://ec.europa.eu/eurostat/databrowser/view/earn_nt_net/default/table?lang=en). Annual, `estruct=NET`, `ecase=P1_NCH_AW100`, `currency=EUR`, `PPS` and `NAC`. A modelled, single worker without children at 100% of the country’s average wage. Eurostat deducts income tax and employee social contributions and includes family allowances where applicable. The PPS series is taken directly from this dataset. |
| Household spending | [nama_10_cp18](https://ec.europa.eu/eurostat/databrowser/view/nama_10_cp18/default/table?lang=en). Annual, `unit=CP_MEUR`, `coicop18=TOTAL` and divisions `CP01` through `CP13`. Data use current prices in million euros. The domestic basis includes spending by visitors and excludes residents’ spending abroad. `CP04` includes the rental value imputed to owner-occupied housing. |
| Price levels | [prc_ppp_ind_1](https://ec.europa.eu/eurostat/databrowser/view/prc_ppp_ind_1/default/table?lang=en). Annual, `indic_ppp=PLI_EU27_2020`. `E011` household final consumption expenditure, `A010101` food, `A0104` housing, water, electricity, gas and other fuels, `A010405` electricity, gas and other fuels, and `A0107` transport. A value of 120 is 20% above the EU-27 benchmark for that category and year. |
| Household income | [ilc_di03](https://ec.europa.eu/eurostat/databrowser/view/ilc_di03/default/table?lang=en). Annual, `age=TOTAL`, `sex=T`, `statinfo=MED_EI`, units `PPS`, `NAC` and `EUR`. Disposable household income is adjusted for household size and composition before taking the median across people. Income generally refers to the calendar year before the survey year. The Household income tab uses PPS. Income vs prices uses national currency for growth and uses the euro series to check for currency changes. |
| Inflation | [prc_hicp_minr](https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr/default/table?lang=en). Monthly, `unit=RCH_A`, `coicop18=TOTAL` under ECOICOP version 2. Each observation gives the all-items year-over-year rate for the selected month. |
| Income vs prices | [prc_hicp_ainr](https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_ainr/default/table?lang=en). Annual, `unit=INX_A_AVG`, `coicop18=TOTAL`. The all-items HICP index is averaged over the calendar year, with 2025 as its base. The app pairs its growth with national-currency income growth from `ilc_di03`. |

## Exact Eurostat API queries

These are the requests used to build and refresh the snapshot. The repeated filters select each listed unit or category in a single request.

- [earn_nt_net · Annual take-home pay](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/earn_nt_net?lang=EN&freq=A&currency=EUR&currency=PPS&currency=NAC&estruct=NET&ecase=P1_NCH_AW100)
- [nama_10_cp18 · How households spend](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nama_10_cp18?lang=EN&freq=A&unit=CP_MEUR&coicop18=TOTAL&coicop18=CP01&coicop18=CP02&coicop18=CP03&coicop18=CP04&coicop18=CP05&coicop18=CP06&coicop18=CP07&coicop18=CP08&coicop18=CP09&coicop18=CP10&coicop18=CP11&coicop18=CP12&coicop18=CP13)
- [prc_ppp_ind_1 · Consumer price levels](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_ppp_ind_1?lang=EN&freq=A&indic_ppp=PLI_EU27_2020&ppp_cat18=E011&ppp_cat18=A010101&ppp_cat18=A0104&ppp_cat18=A010405&ppp_cat18=A0107)
- [ilc_di03 · Median disposable income](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/ilc_di03?lang=EN&freq=A&age=TOTAL&sex=T&statinfo=MED_EI&unit=PPS&unit=NAC&unit=EUR)
- [prc_hicp_minr · Inflation over time](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?lang=EN&freq=M&unit=RCH_A&coicop18=TOTAL)
- [prc_hicp_ainr · Annual average consumer price index](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_ainr?lang=EN&freq=A&unit=INX_A_AVG&coicop18=TOTAL)

## Countries, coverage and flags

The initial ranking shows all 27 EU members. The broader scope includes European reporters with at least one published observation in the selected series. The EU aggregate is `EU27_2020`, and Greece uses Eurostat’s code `EL`. The filter matches exact countries, so other aggregates and non-European comparison countries do not enter rankings.

Each comparison defaults to the newest period with data for every country in scope. If there is no shared period, the dashboard shows the newest period with any selected observation and identifies gaps. Users can select a newer or earlier period when it exists in the source. Blank and confidential values do not enter rankings or CSV value fields. The app preserves raw flags and displays their meanings. The [Eurostat flag guide](https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Tutorial:Symbols_and_abbreviations) defines common flags such as `b`, `e`, `p` and `c`.

## Salaries vs prices

For each country and calendar year, the dashboard pairs the annual net salary in Eurostat’s national-currency series (`earn_nt_net`, `NAC`) with the annual-average all-items Harmonised Index of Consumer Prices (`prc_hicp_ainr`, `INX_A_AVG`, `TOTAL`). The modeled salary is for a single worker without children earning their country’s average wage. The price series tracks an average basket of goods and services.

- **Take-home pay index** is `100 × (pay in the selected year ÷ pay in the start year)`.
- **Consumer price index** is `100 × (annual-average HICP in the selected year ÷ annual-average HICP in the start year)`.
- **Pay after inflation** is `100 × [(pay in the selected year ÷ pay in the start year) ÷ (HICP in the selected year ÷ HICP in the start year) − 1]`.

The same start year and chart scale apply to every selected country. The default opens on Greece and selects the latest uninterrupted stretch comparable across the chosen countries. The earlier-history shortcut opens the preceding comparable stretch. The year controls give access to the full matched history, including missing periods. A missing observation leaves a gap. A break makes the affected series unavailable relative to the original start year from that boundary onward. Starting at the boundary allows comparison within the new series. Each chart gives its actual coverage and the CSV preserves the inputs, flags, calculated values and any comparability notes.

Eurostat switched the earnings model from the OECD to the Joint Research Centre for 2024 and flags the affected observations. The dashboard also blocks comparisons across the earlier provider changes documented by Eurostat (2005 for Cyprus, Estonia, Latvia, Lithuania and Malta, 2008 for Bulgaria and Romania, and 2013 for Croatia). A break flag (`b`) on the newer value or a definition difference (`d`) at either end blocks the affected change. Estimates and provisional figures retain their flags. [Eurostat earnings metadata](https://ec.europa.eu/eurostat/cache/metadata/en/earn_net_esms.htm)

Euro-area values can be published on a euro-fixed basis. When a comparison crosses euro adoption, the app checks that the national-currency and euro observations on both sides are consistent with that scale. Both must be published, and the national-currency value must be within 10% of the euro value to allow for differences between the historic market rate and the fixed conversion rate. The calculation continues to use Eurostat’s national-currency series. Türkiye’s published values change scale at the 2004 observation, so the dashboard blocks comparisons across that boundary. [Euro adoption dates](https://economy-finance.ec.europa.eu/euro/what-euro-area_en) · [Central Bank of Türkiye on the redenomination](https://www.tcmb.gov.tr/wps/wcm/connect/EN/TCMB+EN/Main+Menu/Banknotes/From+the+New+Turkish+Lira+to+the+Turkish+Lira/)

### Worked example for Greece

From **2024 to 2025**, annual take-home pay rose from **€20,041.56** to **€21,498.27**, or **7.27%**. Annual-average HICP rose from **97.19** to **100.00**, or **2.89%**. Pay after inflation rose **4.25%**, calculated as `100 × [(21,498.27 ÷ 20,041.56) ÷ (100.00 ÷ 97.19) − 1]`. [Verified source cells](crosscheck.tsv)

## Where a salary goes furthest

The ranking uses Eurostat’s published annual take-home pay in PPS, which adjusts for differences in local prices. The table shows pay in euros, pay in PPS and the overall household consumer price level (EU-27 = 100) for one shared year. Its last column shows the change in pay after inflation over the separate range selected in Salaries vs prices. These measures describe buying power at a point in time and how it has changed over time.

## Income vs prices

Median equivalised disposable income is the middle income across people after taxes and including benefits, with household income adjusted for the number and ages of household members. The comparison measures changes in this median across survey years.

For income reference year `t`, the app reads national-currency incomes from surveys `t + 1` and `t`, and annual-average price indices from calendar years `t` and `t − 1`. The comparison uses EU-SILC survey years from 2003. Eurostat assigns income to the preceding calendar year for participating countries. Ireland used a rolling period through survey year 2019, so its first eligible comparison is income year 2020. Historical UK observations used a rolling or current-income period and cannot be aligned to these calendar years. [EU-SILC metadata](https://ec.europa.eu/eurostat/cache/metadata/en/ilc_sieusilc.htm) · [Ireland’s metadata](https://ec.europa.eu/eurostat/cache/metadata/en/ilc_simsilc_ie.htm) · [Historical UK and Irish reference periods](https://ec.europa.eu/eurostat/documents/3888793/14842408/KS-01-21-385-EN-N.pdf/78e803f6-7e06-341c-c99f-67ac67cb8e28)

- **Income change** is `100 × (this year’s income ÷ last year’s income − 1)`.
- **Price change** is `100 × (this year’s annual-average HICP ÷ last year’s annual-average HICP − 1)`.
- **Income change after inflation** is `100 × [(this year’s income ÷ last year’s income) ÷ (this year’s annual-average HICP ÷ last year’s annual-average HICP) − 1]`.

The default is the latest year with comparable data for every country in scope. If there is no such year, the view uses the latest year with data for at least one of those countries and marks the gaps. The chart shows signed changes around a zero line. The CSV keeps the calculated precision, flags and reasons for unavailable values.

Missing data, a break at the newer observation (`b`), or a definition difference at either observation (`d`) blocks the affected change. The older observation’s break flag describes its boundary with an earlier year. Within two survey years of a known euro adoption, the app checks whether each national-currency value equals its published EUR equivalent. If only one matches, or an EUR value is missing, it leaves the income change unavailable. The growth calculation itself uses national-currency values. An unaffected component can still appear when the other is unavailable. [Euro adoption dates](https://economy-finance.ec.europa.eu/euro/what-euro-area_en)

### Worked example for Greece

For income year **2024**, Eurostat published **€11,700** in the 2025 survey and **€10,850** in the 2024 survey. The annual-average HICP was **97.19** in 2024 and **94.37** in 2023. Income rose **7.83%**, prices rose **2.99%**, and income after inflation rose **4.71%**, calculated as `100 × [(11,700 ÷ 10,850) ÷ (97.19 ÷ 94.37) − 1]`. [Source cells and verification](crosscheck.tsv)

## Spending calculations

A category’s spending share is `100 × expenditure for the category ÷ published total expenditure`, using the same country, year and unit. All 13 top-level divisions must be present to display a 100% stack. Their sum must match the official total within €0.7 million. This allows up to €0.05 million of rounding for each of the 13 divisions and the total, based on the €0.1 million precision visible in the source. Partial or unreconciled shares appear in the table with their original published denominator.

### Worked example

Eurostat published €38,270.1 million in spending on housing, water, electricity, gas and other fuels in Greece in 2024. It published €178,902.8 million in total household spending for the same country, year, and unit. The calculation is **100 × 38,270.1 ÷ 178,902.8 = 21.39%**. The chart shows **21.4%** and the CSV retains the calculated precision. The housing category includes an estimate of the rent owners would pay for their own homes.

## Refreshes and revisions

The daily refresh requests the complete filtered history so it can pick up new periods and changes Eurostat makes to older observations. After validating the filters, units, data and coverage, the app publishes the new snapshot as one update. A failed refresh leaves the last successful snapshot in place. The chart’s observation period, Eurostat’s source update time, and the dashboard’s last successful refresh are shown separately.

## Initial verification

The first snapshot was fetched on 22 November 2026. The latest period available for all 27 EU countries is 2025 for pay, overall price levels and household income, and October 2026 for inflation. The spending source includes 2025 for 26 EU members, so a full EU-27 comparison uses 2024.

The [cross-check record](crosscheck.tsv) compares official Eurostat TSV values and flags against the dashboard snapshot, including the inputs for the 2024 Greek, Romanian and Slovak income comparisons.

Additional official references cover the [Statistics API](https://ec.europa.eu/eurostat/en/web/user-guides/data-browser/api-data-access/api-detailed-guidelines/api-statistics), [Data Browser TSV export links](https://ec.europa.eu/eurostat/en/web/user-guides/data-browser/api-data-access/api-faq/excel-power-query), [national-accounts spending](https://ec.europa.eu/eurostat/cache/metadata/EN/nama_10_cp18_esms_el.htm), [EU-SILC income](https://ec.europa.eu/eurostat/cache/metadata/en/ilc_sieusilc.htm), and [HICP methodology](https://ec.europa.eu/eurostat/cache/metadata/en/prc_hicp_esms.htm).
