# European Living Standards Dashboard

**What does a salary buy across Europe?** Explore official Eurostat figures for take-home pay, purchasing power, household spending, price levels, typical household income, inflation, and whether household incomes grew faster than prices. The dashboard works with country selections and has no personal inputs.

**[Open the public dashboard](https://nikosapostolo.github.io/European-Living-Standards/)** · **[Read the full methodology](docs/methodology.md)** for definitions, the exact Eurostat queries, and worked salary and spending examples.

- **Are salaries keeping up with prices?** Start with Greece and compare take-home pay with consumer prices on the same scale. Pick your own years and add up to four countries.
- Use Eurostat’s EU-27 benchmark to put salaries, spending, prices and household income in context.
- **Where does a salary go furthest?** Rank countries by what take-home pay can buy at local prices. The table shows pay in euros, local price levels and changes in pay after inflation.
- Use **Income vs prices** to compare changes in typical household income, consumer prices, and purchasing power for the same calendar year.
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

**Public dashboard.** GitHub Actions runs **Refresh and publish dashboard** daily at 11:37 UTC, on pushes to `main`, and on manual runs started under **Actions**. It fetches the full filtered history from Eurostat, validates it, runs the checks, saves the snapshot and publishes the static files to GitHub Pages. If preparation fails, the workflow logs the error and the previous live snapshot stays available. The public site serves files and has no manual refresh route. Manual runs use the repository’s access controls.

To deploy a fork, choose **Settings → Pages → Build and deployment → Source → GitHub Actions** and run the workflow from the fork’s default branch. If you use another default branch, update the branch references in `.github/workflows/refresh.yml`. The workflow needs permission to commit the snapshot and deploy Pages.

**Private Sites copy.** The dashboard’s private Sites copy keeps its own daily schedule and persistent snapshot. Its refresh tools and service route use the private site’s authorization. To recreate that deployment, enable the `BUCKET` R2 binding and `mcp` capability from the hosting manifest. The daily task calls `refresh_eurostat_snapshot`, then `get_eurostat_snapshot_status` to verify the new timestamp. Keep service credentials in request headers and outside the repository.

The footer shows the last successful refresh and the latest available data period by topic. Each comparison shows the period used for its selected countries.

## Project map

| Path | Contents |
| --- | --- |
| `public/` | Dashboard, verified queries, comparison calculations and initial data snapshot. |
| `src/` | Statistics API decoder, validation, hosted snapshot refresh and delivery. |
| `scripts/` | Local server, build, refresh and official export cross-check. |
| `tests/` | Reproducible comparison and refresh checks. |
| `docs/` | Methodology, source metadata and the recorded cell-by-cell verification. |

[Read the methodology](docs/methodology.md) · [View Eurostat cross-check results](docs/crosscheck.tsv)
