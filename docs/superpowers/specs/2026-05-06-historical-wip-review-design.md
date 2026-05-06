# Historical WIP Review — Design Spec

**Date:** 2026-05-06
**Status:** Approved for implementation (on a feature branch — merge to `main`
contingent on the user evaluating the deployed branch and choosing to keep it)

---

## 1. Overview

### Problem

`historical wip caltrak labs.xlsx` lives in the repository and is loaded into
memory at server startup. When the data goes stale, the only fix is for someone
to edit the xlsx, commit it, push, and wait for Railway to redeploy. There is
no in-app review of what data exists, no signal when the data is stale, and no
way for a non-developer to update it. As a result, the data is currently 18+
days behind reality (last entry Apr 18, 2026 vs. today May 6, 2026), and the
Status Board's "PY As-Of" column and the lab-detail modal chart silently show
incomplete history.

### Goal

Two changes, both behind a small new "Historical WIP" entry point in the nav:

1. **Review** — a page that shows what historical WIP data is in the system,
   highlights gaps, and signals staleness clearly.
2. **Update** — a new tab in the existing upload modal that lets the operations
   employee upload their compiled xlsx without involving an engineer or a deploy.

### Non-goals (explicitly out of scope for this iteration)

- Editing individual cells through the UI.
- Deleting individual rows/dates.
- Alerting/email when data goes stale.
- Replacing the manual compilation workflow with auto-derivation from std-hours
  uploads.
- Allowing partial xlsx uploads to *delete* rows that aren't in the upload file.

### Primary user

Sr. Director of Operations (Louis), and a single operations employee who
compiles the historical WIP data manually each week and currently emails the
xlsx for inclusion in the repo.

---

## 2. Data model

### New Postgres table

```sql
CREATE TABLE IF NOT EXISTS historical_wip (
  id BIGSERIAL PRIMARY KEY,
  lab_raw TEXT NOT NULL,
  lab_key TEXT NOT NULL,
  entry_date DATE NOT NULL,
  std_hrs NUMERIC(12,2) NOT NULL CHECK (std_hrs >= 0),
  source_filename TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT historical_wip_key UNIQUE (lab_key, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_historical_wip_entry_date
  ON historical_wip (entry_date);
CREATE INDEX IF NOT EXISTS idx_historical_wip_lab_key
  ON historical_wip (lab_key);
```

Schema additions go in `schema.sql`. The auto-bootstrap in `server.js` runs
this on startup, so deployment requires no manual migration step.

### Why one row per lab per date

The xlsx today is laid out as a wide matrix (rows = labs, columns = dates).
Storing it that way in Postgres would require schema changes every time a new
date is added. Normalizing to one row per (lab, date) makes the table
append-friendly and matches the shape of the rest of the database (the
`std_hours_overrides`, `headcount_overrides`, and `onsite_events` tables all
follow the same pattern).

---

## 3. One-time migration of the existing xlsx

On the first deploy of this branch, the existing
`historical wip caltrak labs.xlsx` gets imported into the new `historical_wip`
table. This is done by the same `loadHistoricalWipFromWorkbook` parser that
exists today, refactored to write rows instead of returning an in-memory
object.

### Migration trigger

In `server.js`'s `start()` function, after `ensureSchema()`:

```
if pool exists:
  ensureSchema()
  if (await pool.query('SELECT 1 FROM historical_wip LIMIT 1')).rowCount == 0:
    importHistoricalWipFromXlsx(pool, HISTORICAL_WIP_XLSX_PATH)
```

The `rowCount == 0` check makes the migration idempotent: it only runs when
the table is empty. If a deployment somewhere has the table populated (e.g.
manually seeded), the migration is skipped.

### Post-migration

The xlsx file stays in the repository as a seed/backup but is no longer the
runtime source of truth. `server.js` continues to import it only as the source
data for the migration.

---

## 4. API endpoints

### Modified: `GET /api/historical-wip`

**Request:** none
**Response shape:** unchanged from today (`{source, category, dailyByDate, range, labs, loaded, message}`)

The implementation switches from reading `HISTORICAL_WIP` (the in-memory object
loaded at startup) to a SQL query that returns the same shape. This keeps the
front-end consumers — `loadData()` in app.js and the modal chart — working
without any changes.

The query:

```sql
SELECT lab_raw, lab_key, entry_date::text AS entry_date, std_hrs
FROM historical_wip
ORDER BY entry_date, lab_key
```

The result is reshaped server-side into the existing `dailyByDate` map (a
nested object: `{ 'YYYY-MM-DD': { labKey: value } }`) before being sent.

### New: `GET /api/historical-wip/coverage`

**Request:** none
**Response shape:**

```json
{
  "firstDate": "2025-03-17",
  "lastDate":  "2026-04-18",
  "today":     "2026-05-06",
  "daysBehind": 18,
  "totalEntries": 14326,
  "labCount": 22,
  "lastUpload": {
    "filename": "historical wip caltrak labs.xlsx",
    "uploadedAt": "2026-04-07T14:51:00Z"
  }
}
```

Used by the review page coverage card. `daysBehind` is computed server-side as
`today - lastDate` in calendar days.

`lastUpload` is sourced from the most recent `created_at` in the table along
with its `source_filename`. If no rows exist, `lastUpload` is `null`.

### New: `POST /api/historical-wip/sync`

**Request:** multipart form with field `file` (CSV or XLSX)
**Response shape:**

```json
{
  "summary": {
    "inserted":  126,
    "updated":   14,
    "unchanged": 1832,
    "skipped":   2
  },
  "skipped":   [{"row": 5, "reason": "Unknown lab: Tangent NYC"}],
  "issues":    [],
  "parsedRows": 1974,
  "validRows":  1972
}
```

### Merge behavior

- New `(lab_key, entry_date)` rows are **inserted**.
- Existing rows where `std_hrs` differs are **updated** (and `updated_at` set
  to NOW()).
- Existing rows where `std_hrs` is unchanged are **left untouched** (counted
  as `unchanged`).
- Rows with unknown labs (no entry in `lab_mapping_variants.csv`) are
  **skipped** and reported in `skipped`.
- **No deletions.** If a date appears in the database but not in the upload,
  it stays. This protects against accidental data loss from partial uploads.

The merge is wrapped in a single transaction. If any individual row fails, the
entire upload is rolled back.

### File format expected

Identical to the current `historical wip caltrak labs.xlsx`:

- Sheet name: doesn't matter (first sheet used)
- Row 1: header. Columns 0-2 are metadata; columns 3+ are dates.
- Each subsequent row has lab in column 1, category in column 2, daily values
  in columns 3+.
- Only rows where category is exactly `Workable WIP Std. Hrs.` are imported;
  all other categories are silently ignored (this matches existing behavior).

---

## 5. Frontend changes

### Nav meta link

In `index.html`, inside the existing `<div class="nav-meta">`, before the
`Upload data` button, add a small text link:

```html
<a class="nav-link" onclick="switchTab('historical-wip')">Historical WIP</a>
```

Styling: muted color (matches the "Week of [date]" label), underline on hover,
no border or background. It is intentionally less prominent than the
"Upload data" button — this is a data-management view, not an action a user
takes constantly.

### `switchTab()` extension

The existing `switchTab` function in `app.js` already handles tab swapping for
Status Board, Scenario Planner, and Analysis. Add a fourth case:

```javascript
const tabs = ['status-board', 'scenario-planner', 'analysis', 'historical-wip'];
// ... existing classlist toggle logic
if (tabName === 'historical-wip') renderHistoricalWipTab();
```

Note: the `tabs` array is used to mark the *active* class on nav buttons.
Because `historical-wip` is rendered as a meta-area link rather than a button
in the tab strip, the active-class toggle won't apply to a button — that's
fine. The meta link can have its own `.active` styling toggled separately if
desired.

### New view panel

In `index.html`, add a `<div id="view-historical-wip" class="view-panel">`
sibling to the existing tab panels. It is rendered into by
`renderHistoricalWipTab()`.

### New file: `js/historical-wip.js`

Loaded after `js/api.js` and before `app.js` (alongside the other tab
modules). Contains:

- `renderHistoricalWipTab()` — top-level render entry
- `renderHistoricalWipCoverage(coverage)` — coverage card
- `renderHistoricalWipTable(data, dateRange)` — per-lab data table
- `setHistoricalWipDateRange(start, end)` — date range picker handler
- `onHistoricalWipLabSearch(term)` — lab name filter

State for this tab is namespaced under a new `historicalWipState` object in
`js/state.js`:

```javascript
const historicalWipState = {
  coverage: null,             // from /api/historical-wip/coverage
  rangeStart: null,           // ISO date — defaults to lastDate - 60d
  rangeEnd: null,             // ISO date — defaults to lastDate
  searchTerm: '',
};
```

### Coverage card layout

```
┌─────────────────────────────────────────────────────┐
│ Historical WIP Coverage                             │
│                                                     │
│ Earliest date: Mar 17, 2025                         │
│ Latest date:   Apr 18, 2026                         │
│ Today:         May 6, 2026                          │
│                                  ⚠ 18 days behind   │
│                                                     │
│ Total entries: 14,326 across 22 labs                │
│                                                     │
│ Last upload: Apr 7, 2026 — historical wip caltrak labs.xlsx │
└─────────────────────────────────────────────────────┘
```

Staleness indicator color rules:

| Days behind | Color  | Label                       |
|-------------|--------|-----------------------------|
| ≤ 7         | green  | "current"                   |
| 8 - 14      | yellow | "N days behind"             |
| > 14        | red    | "N days behind — update soon" |

### Per-lab data table

- Rows: one per lab. Default sort: alphabetical. Sticky leftmost column.
- Columns: dates within the date range. Leftmost column (after the sticky
  lab name) is the most recent date; older dates extend to the right. This
  matches how the existing xlsx is laid out so reading the table feels
  familiar to the employee compiling the data.
- Cell content: `std_hrs` value, formatted to 1 decimal. Empty cells render as
  a small grey dot (CSS only, no extra DOM).
- Above the table: a date range picker (two date inputs: From / To) and a lab
  name search box.
- Default range: `lastDate - 60 days` to `lastDate`. User can widen or narrow.
- Horizontal scroll for the date columns; vertical scroll for the lab rows.

### Upload tab in existing modal

In `index.html`, add a 4th tab to the upload modal:

```html
<button class="upload-tab" id="utab-historical-wip"
        onclick="switchUploadTab('historical-wip')">Historical WIP</button>
```

And a 4th `upload-pane`:

```html
<div id="upload-pane-historical-wip" hidden>
  <form class="upload-form" onsubmit="submitUpload(event,'historical-wip')">
    <div class="upload-field">
      <label>File (CSV or Excel)</label>
      <input type="file" name="file" accept=".csv,.xlsx,.xls" required>
    </div>
    <button type="submit" class="upload-submit">Upload historical WIP</button>
    <div id="upload-result-historical-wip" class="upload-result"></div>
  </form>
</div>
```

The existing `submitUpload(event, type)` function in `js/upload.js` already
dispatches by `type`. It needs one new case:

```javascript
if (type === 'historical-wip') {
  endpoint = '/api/historical-wip/sync';
}
```

After a successful upload: the result text in the modal includes
inserted/updated/unchanged/skipped counts. The upload modal stays open so the
user can see the result. Closing the modal triggers a refresh of the
historical-wip tab if it is currently active.

---

## 6. Modal chart dependency

The lab-detail modal (opened by clicking a row on Status Board) renders a
chart that includes historical WIP data. The chart functions
(`buildLabChart`, `getHistoricalWipForMonth`, `historicalLabLookupKeys`) read
from `st.historicalWipDaily`, which is populated by `loadData()` from the
`/api/historical-wip` endpoint.

Because **the response shape of `/api/historical-wip` is preserved exactly**,
the modal chart code does not change. After this feature ships:

- The modal chart will start showing whatever data is in the new DB table.
- After the migration, that data is identical to today's xlsx — chart looks
  unchanged.
- After the first upload of fresher data, the chart automatically reflects
  the newer dates with no additional code work.

This is intentional and is part of why the response shape was kept stable.
**Verification of this is a required step in the implementation plan**: after
migration, open a lab modal and confirm the chart looks identical to the
pre-migration version.

---

## 7. Verification plan

Before merging the feature branch to `main`, the following must be verified
locally with the `.env` pointed at the Railway database (or a local Postgres
seeded from production):

1. **Schema bootstrap**: starting the server creates the `historical_wip`
   table if absent.
2. **Migration**: with an empty `historical_wip` table, the server populates
   it from the xlsx on startup. Subsequent restarts don't double-import.
3. **API parity**: `GET /api/historical-wip` returns the same data shape as
   before, with the same date range and lab list.
4. **Modal chart parity**: open three different lab modals (one CalTrak with
   data, one IndySoft, one with sparse data). Each chart looks identical to
   pre-migration.
5. **Coverage card**: shows the correct first/last date and days-behind
   value.
6. **Upload happy path**: upload the existing xlsx with no changes — result
   should be `0 inserted, 0 updated, ~14326 unchanged`.
7. **Upload merge**: edit a single value in a copy of the xlsx, upload it —
   result should be `0 inserted, 1 updated, ~14325 unchanged`.
8. **Upload of new dates**: upload an xlsx with extra date columns — result
   should reflect those as `inserted`.
9. **Unknown lab**: upload an xlsx with a lab name that doesn't exist in
   `lab_mapping_variants.csv` — that row is skipped, reported in `skipped`.
10. **No deletions**: upload an xlsx missing some dates — those dates remain
    in the DB.

If any of the above fails, the branch is not ready to merge.

---

## 8. Branch plan

- All work happens on `feature/historical-wip-review`.
- The user evaluates the feature on Railway via a preview deploy of the branch
  if Railway plan supports it; otherwise they merge to `main` and evaluate
  there, with rollback ready (`git revert HEAD --no-edit && git push`).
- The xlsx file remains in the repository even after the feature ships. It is
  no longer the runtime source of truth, but is kept for migration safety and
  git history.

---

## 9. Open questions / future enhancements

These are not part of this design, but are likely follow-ups:

- **Editable cells**: clicking a cell in the data table allows editing a
  single value. Useful for fixing one-off errors without re-uploading.
- **Staleness alerts**: an email or banner alert when data crosses the
  "red" threshold (>14 days behind).
- **Auto-derivation**: when std-hours is uploaded, automatically write a
  historical WIP row for that effective date. Would eliminate most of the
  manual compilation work.
- **Per-lab history viewer**: a chart per lab showing WIP trend over time.
  Could replace or supplement the existing modal chart.
- **Bulk delete**: the ability to remove a date or a lab from the table.
  Currently no UI for this — would need to be added carefully because it is
  destructive.
