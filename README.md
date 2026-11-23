# European Living Standards Dashboard

**What does a salary buy across Europe?** Explore official Eurostat figures for take-home pay, purchasing power, household spending, price levels, median disposable income, inflation, and whether household incomes grew faster than prices. The dashboard works with country selections and has no personal inputs.

**[Read the full methodology](docs/methodology.md)** for definitions, the exact Eurostat queries, and worked salary and spending examples.

- **Are salaries keeping up with prices?** Start with Greece and compare take-home pay with consumer prices on the same scale. Pick your own years and add up to four countries.
- **Where does a salary go furthest?** Rank countries by pay in purchasing power standards (PPS). The table shows pay in euros, local price levels and changes in pay after inflation.
- Use **Income vs prices** to compare changes in median household income, consumer prices, and purchasing power for the same calendar year.
- Explore what households spend, how prices compare with the EU-27 benchmark, and what has happened to inflation over time.
- Sort and filter tables, download the current comparison as CSV, or open the source dataset from each view.

## Run locally

Install Node.js 22 or later. The project uses built-in Node and browser APIs, so it needs no package installation.

```bash
git clone https://github.com/NikosApostolo/European-Living-Standards.git
cd European-Living-Standards
npm start
```

Open [localhost:8000](http://localhost:8000). The repository includes a validated Eurostat snapshot, so the local app can start immediately.

| Command | What it does |
| --- | --- |
| `npm start` | Serves the dashboard and the local snapshot. Use `PORT=8080 npm start` to choose a different port. |
| `npm run refresh` | Fetches the full filtered history and atomically replaces the local snapshot after validation. |
| `npm test` | Tests the comparison rules, flags, missing values, revisions and failed refreshes. |
| `node scripts/crosscheck.mjs` | Compares selected cells against Eurostat’s tab-separated Data Browser export format. Refresh first if Eurostat has released revisions since the local snapshot. |
| `npm run build` | Generates a deployable Worker and copies the hosting manifest into `dist`. |

## Daily refresh

**Hosted dashboard.** The site’s daily schedule calls the server’s `refresh_eurostat_snapshot` tool. The Worker fetches Eurostat data, validates it, and publishes it to persistent storage. It uses a conditional write so simultaneous attempts cannot overwrite each other. A failed fetch or validation leaves the previous successful snapshot intact. If you recreate the deployment, enable a daily schedule on the private site with the prompt “Run refresh_eurostat_snapshot, then call get_eurostat_snapshot_status to verify the resulting timestamp and latest periods.” Enable the `BUCKET` R2 binding and `mcp` capability from the hosting manifest. The same server operation also accepts a JSON `POST /refresh` through Sites service access. It returns the new timestamp and latest periods, which can be checked against `GET /snapshot.json`. Keep the Site owner-only so Sites can authorize these update routes. Supply the service credential in the request header at runtime and keep it out of the repository.

**GitHub snapshot.** The `Refresh Eurostat snapshot` workflow runs daily at 11:37 UTC and also supports manual runs. To enable it in a fork, open **Actions**, enable workflows if prompted, and use **Refresh Eurostat snapshot → Run workflow** to verify the first run. The workflow updates the repository’s copy of the snapshot. The hosted dashboard refreshes its own copy independently. The refresh runs on the default branch with permission to commit the new data file. Repository rules that disallow bot commits require a separate publishing branch or a pull-request-based workflow.

The app displays the last successful snapshot refresh, the period used in each chart, and Eurostat’s source update timestamp separately.

## Project map

| Path | Contents |
| --- | --- |
| `public/` | Dashboard, verified queries, comparison calculations and initial data snapshot. |
| `src/` | Statistics API decoder, validation, hosted snapshot refresh and delivery. |
| `scripts/` | Local server, build, refresh and official export cross-check. |
| `tests/` | Reproducible comparison and refresh checks. |
| `docs/` | Methodology, source metadata and the recorded cell-by-cell verification. |

[Read the methodology](docs/methodology.md) · [View Eurostat cross-check results](docs/crosscheck.tsv)
