# Lab Capacity Review

This app now supports persistent onsite schedule storage using PostgreSQL (Railway-ready).

## Local run

1. Install dependencies:

```bash
npm install
```

2. Copy env template:

```bash
cp .env.example .env
```

3. Set `DATABASE_URL` in `.env` (optional for local UI-only mode).
4. Optional access protection:
   - Set `APP_USER` and `APP_PASS` to enable HTTP Basic Auth for the whole app.
5. Local host binding defaults to `127.0.0.1`. For hosted deploys, set `HOST=0.0.0.0`.
6. Start server:

```bash
npm run dev
```

Open: `http://localhost:3000`

## API endpoints

- `GET /api/health`
- `GET /api/schedules`
- `POST /api/schedules/sync` (multipart file field: `file`)
- `GET /api/std-hours`
- `POST /api/std-hours/sync` (multipart fields: `file`, `effectiveFrom`, optional `effectiveTo`)

## Upload sync behavior

When a schedule file is uploaded:

- New date ranges are inserted.
- Existing date ranges (same lab + start date + end date) are updated when values changed.
- Unchanged entries remain untouched.

The response includes `inserted`, `updated`, and `unchanged` counts.

## Lab Mapping + Active/Inactive Labs

- The app reads aliases and lab status from `lab_mapping_variants.csv` in the project root.
- Uploads map incoming lab aliases (e.g., `05 - houston`, `Houston Cal Lab`) to canonical lab keys before saving.
- Rows that map to `Inactive` labs are skipped during upload and returned as warnings.
- The UI only shows labs marked `Active` in `lab_mapping_variants.csv`.

## Historical WIP Source

- LY peak values on the Status Board are sourced from `historical wip caltrak labs.xlsx` (sheet `WIP`, category `Workable WIP Std. Hrs.`).
- The server exposes this via `GET /api/historical-wip`, and the frontend uses it for the `LY Wk Peak` calculation.

For standard-hours uploads:

- Upload a CSV/XLSX/XLS file with columns like `Lab` and `Current Std Hours`.
- Before saving, the popup previews how many rows match current tool labs and lists unmatched labels.
- The app prompts for `Effective from` and optional `Effective to` dates.
- Hours apply only within that date range.
- If multiple uploads overlap for a lab/date, the newest upload wins.

## Railway deploy

1. Push this repo to GitHub.
2. In Railway: `New Project` -> `Deploy from GitHub repo`.
3. Add a PostgreSQL service in the Railway project.
4. In your app service variables, set:
   - `DATABASE_URL` to the Postgres connection string.
   - `HOST=0.0.0.0`
   - `APP_USER` and `APP_PASS` (recommended, since only you and your boss should access it).
5. Deploy.

On startup, the app auto-runs `schema.sql` to create required tables.
