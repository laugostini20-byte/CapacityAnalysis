# Historical WIP Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static `historical wip caltrak labs.xlsx` runtime source with a Postgres-backed store, add an in-app review page accessible from a small nav meta link, and add a 4th tab to the upload modal that lets the operations employee upload their compiled xlsx without involving an engineer.

**Architecture:** New `historical_wip` table mirrors the existing per-row pattern of `std_hours_overrides` / `headcount_overrides`. A one-time migration on first deploy imports the existing xlsx into the table. The `GET /api/historical-wip` response shape is preserved exactly so the modal chart and Status Board PY column keep working with no front-end changes. New `GET /api/historical-wip/coverage` and `POST /api/historical-wip/sync` endpoints power the review page and upload tab. New `js/historical-wip.js` module follows the same pattern as the other tab modules (`js/status-board.js`, `js/analysis.js`, etc.).

**Tech Stack:** Node.js + Express, Postgres (`pg`), `multer` for uploads, `xlsx` (SheetJS) for parsing, vanilla JS frontend.

**Note on testing:** This codebase has no automated test framework. Verification steps below are manual (curl, browser, server logs). Adding a test framework is out of scope for this feature.

---

## Task 1: Create feature branch

**Files:** none (git only)

- [ ] **Step 1: Verify clean working tree on main**

```bash
git status
```

Expected: `On branch main` and `nothing to commit, working tree clean`.

- [ ] **Step 2: Create and switch to the feature branch**

```bash
git checkout -b feature/historical-wip-review
```

Expected: `Switched to a new branch 'feature/historical-wip-review'`.

- [ ] **Step 3: Verify branch**

```bash
git branch --show-current
```

Expected: `feature/historical-wip-review`.

---

## Task 2: Add `historical_wip` table to `schema.sql`

**Files:**
- Modify: `schema.sql` (append new table definition)

- [ ] **Step 1: Append the new table to `schema.sql`**

Open `schema.sql` and append at the end:

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

- [ ] **Step 2: Boot server locally to confirm schema applies**

Stop any running server (`Ctrl+C`), then start:

```bash
npm run dev
```

Expected: server starts cleanly with `Server listening on http://127.0.0.1:3000` and no SQL errors. The table is created (or "already exists, skipped" if Postgres has a previous version). Stop the server (`Ctrl+C`) before continuing.

- [ ] **Step 3: Commit**

```bash
git add schema.sql
git commit -m "feat(schema): add historical_wip table"
```

---

## Task 3: Add `importHistoricalWipFromXlsx` migration helper

**Files:**
- Modify: `server.js` (add new function below the existing `loadHistoricalWipFromWorkbook`)

- [ ] **Step 1: Add the migration helper after `loadHistoricalWipFromWorkbook`**

In `server.js`, locate the line:

```javascript
const HISTORICAL_WIP = loadHistoricalWipFromWorkbook(HISTORICAL_WIP_XLSX_PATH);
```

Insert this new function **just before** that line:

```javascript
// One-time migration: imports rows from the historical WIP xlsx into the
// historical_wip table. Idempotent — should only be called when the table
// is empty. Returns count of rows inserted.
async function importHistoricalWipFromXlsx(pool, xlsxPath) {
  const wipData = loadHistoricalWipFromWorkbook(xlsxPath);
  if (!wipData.loaded) {
    console.warn('Historical WIP migration skipped:', wipData.message);
    return 0;
  }

  const sourceFilename = wipData.source;
  let rowCount = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [date, perLab] of Object.entries(wipData.dailyByDate)) {
      for (const [labKey, value] of Object.entries(perLab)) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
        // labKey here is already normalized (from loadHistoricalWipFromWorkbook).
        // We need to recover the lab_raw from the labs list — best-effort, fall back to labKey.
        const labRaw = wipData.labs.find(l => normalizeLabKey(l) === labKey) || labKey;
        await client.query(
          `INSERT INTO historical_wip (lab_raw, lab_key, entry_date, std_hrs, source_filename)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (lab_key, entry_date) DO NOTHING`,
          [labRaw, labKey, date, value, sourceFilename]
        );
        rowCount++;
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return rowCount;
}
```

- [ ] **Step 2: Syntax check**

```bash
node --check server.js
```

Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(server): add importHistoricalWipFromXlsx migration helper"
```

---

## Task 4: Wire the migration into `start()`

**Files:**
- Modify: `server.js` (`start` function near the bottom)

- [ ] **Step 1: Find the `start()` function**

Locate it near the bottom of `server.js`:

```javascript
async function start() {
  if (pool) {
    await ensureSchema();
    await pool.query('SELECT 1');
  }
  app.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://${HOST}:${PORT}`);
  });
}
```

- [ ] **Step 2: Add the migration call between `ensureSchema()` and `app.listen()`**

Replace the function body with:

```javascript
async function start() {
  if (pool) {
    await ensureSchema();
    await pool.query('SELECT 1');

    // One-time migration: if historical_wip is empty, import the xlsx.
    const wipCount = await pool.query('SELECT COUNT(*) AS c FROM historical_wip');
    if (Number(wipCount.rows[0].c) === 0) {
      try {
        const inserted = await importHistoricalWipFromXlsx(pool, HISTORICAL_WIP_XLSX_PATH);
        // eslint-disable-next-line no-console
        console.log(`Historical WIP migration: inserted ${inserted} rows from xlsx.`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Historical WIP migration failed:', err.message);
      }
    }
  }
  app.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://${HOST}:${PORT}`);
  });
}
```

- [ ] **Step 3: Syntax check**

```bash
node --check server.js
```

Expected: no output.

- [ ] **Step 4: Boot server locally with DATABASE_URL set**

Make sure your local `.env` has `DATABASE_URL` pointing at Railway (or a local Postgres seeded from prod). Then:

```bash
npm run dev
```

Expected console output (first run only, when table is empty):
```
Historical WIP migration: inserted <N> rows from xlsx.
Server listening on http://127.0.0.1:3000
```

If the table already has data, you'll see only the `Server listening...` line.

- [ ] **Step 5: Verify rows landed in DB**

In a separate terminal:

```bash
curl -s http://127.0.0.1:3000/api/historical-wip | head -c 500
```

Expected: a JSON object that includes `dailyByDate`, `range`, `labs`. (At this point we're still reading from the in-memory xlsx — that changes in Task 5/6. The point of this curl is to confirm the existing endpoint still works after our changes.)

Stop the server.

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat(server): run historical_wip migration on startup when table empty"
```

---

## Task 5: Add `loadHistoricalWipFromDb` helper

**Files:**
- Modify: `server.js` (add new function below `importHistoricalWipFromXlsx`)

- [ ] **Step 1: Add the helper**

Just after the `importHistoricalWipFromXlsx` function, insert:

```javascript
// Loads historical WIP from the database in the same shape that
// loadHistoricalWipFromWorkbook used to return. Used by GET /api/historical-wip
// so existing front-end consumers (loadData, modal chart) keep working.
async function loadHistoricalWipFromDb(pool) {
  const fallback = {
    source: 'historical_wip (db)',
    category: HISTORICAL_WIP_CATEGORY,
    dailyByDate: {},
    range: {start: null, end: null},
    labs: [],
    loaded: false,
    message: 'Database not configured'
  };
  if (!pool) return fallback;

  try {
    const result = await pool.query(
      `SELECT lab_raw, lab_key, entry_date::text AS entry_date, std_hrs
       FROM historical_wip
       ORDER BY entry_date, lab_key`
    );
    const dailyByDate = {};
    const labSet = new Set();
    for (const row of result.rows) {
      const date = row.entry_date;
      if (!dailyByDate[date]) dailyByDate[date] = {};
      dailyByDate[date][row.lab_key] = Number(row.std_hrs);
      labSet.add(row.lab_raw);
    }
    const dates = Object.keys(dailyByDate).sort();
    return {
      source: 'historical_wip (db)',
      category: HISTORICAL_WIP_CATEGORY,
      dailyByDate,
      range: {start: dates[0] || null, end: dates[dates.length - 1] || null},
      labs: [...labSet].sort((a, b) => a.localeCompare(b)),
      loaded: true,
      message: null
    };
  } catch (err) {
    return {
      ...fallback,
      loaded: false,
      message: `Failed to query historical_wip: ${err.message}`
    };
  }
}
```

- [ ] **Step 2: Syntax check**

```bash
node --check server.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(server): add loadHistoricalWipFromDb helper"
```

---

## Task 6: Modify `GET /api/historical-wip` to read from DB

**Files:**
- Modify: `routes/historical-wip.js`
- Modify: `server.js` (add `loadHistoricalWipFromDb` to ctx)

- [ ] **Step 1: Pass the new helper through `ctx`**

In `server.js`, find the `ctx` object construction and add `loadHistoricalWipFromDb`. The block looks like:

```javascript
const ctx = {
  pool,
  dbRequired,
  upload,
  LAB_MAPPING,
  LAB_MAPPING_CSV_PATH,
  HISTORICAL_WIP,
  ...
};
```

Add a `loadHistoricalWipFromDb` field:

```javascript
const ctx = {
  pool,
  dbRequired,
  upload,
  LAB_MAPPING,
  LAB_MAPPING_CSV_PATH,
  HISTORICAL_WIP,
  loadHistoricalWipFromDb,
  ...
};
```

- [ ] **Step 2: Replace the route handler in `routes/historical-wip.js`**

Open `routes/historical-wip.js`. Replace the entire file with:

```javascript
const express = require('express');

/**
 * Historical-WIP route. Mount: app.use('/api/historical-wip', createHistoricalWipRouter(ctx));
 * Returns historical WIP series. Reads from the historical_wip database table;
 * falls back to the in-memory xlsx-loaded HISTORICAL_WIP if the DB is unavailable.
 */
function createHistoricalWipRouter(ctx) {
  const {pool, HISTORICAL_WIP, loadHistoricalWipFromDb} = ctx;
  const router = express.Router();

  router.get('/', async (_req, res) => {
    if (pool) {
      const fromDb = await loadHistoricalWipFromDb(pool);
      if (fromDb.loaded) {
        res.json(fromDb);
        return;
      }
    }
    res.json(HISTORICAL_WIP);
  });

  return router;
}

module.exports = createHistoricalWipRouter;
```

- [ ] **Step 3: Syntax check both files**

```bash
node --check server.js
node --check routes/historical-wip.js
```

Expected: no output for either.

- [ ] **Step 4: Boot server and verify response shape unchanged**

```bash
npm run dev
```

In a separate terminal:

```bash
curl -s http://127.0.0.1:3000/api/historical-wip | python -m json.tool | head -30
```

(If `python` isn't available, use `node -e "process.stdin.pipe(process.stdout)"` and pipe through.)

Expected: a JSON object with `dailyByDate`, `range`, `labs`, `loaded: true`, and `source: "historical_wip (db)"`. The `range` should match what was in the xlsx.

Stop the server.

- [ ] **Step 5: Commit**

```bash
git add server.js routes/historical-wip.js
git commit -m "feat(api): GET /api/historical-wip now reads from DB"
```

---

## Task 7: Add `GET /api/historical-wip/coverage`

**Files:**
- Modify: `routes/historical-wip.js`

- [ ] **Step 1: Add the new route handler**

In `routes/historical-wip.js`, inside `createHistoricalWipRouter`, add a new route after the existing `router.get('/')`:

```javascript
  router.get('/coverage', async (_req, res) => {
    if (!pool) {
      res.status(503).json({error: 'Database not configured'});
      return;
    }
    try {
      const summary = await pool.query(`
        SELECT
          MIN(entry_date)::text AS first_date,
          MAX(entry_date)::text AS last_date,
          COUNT(*)::int AS total_entries,
          COUNT(DISTINCT lab_key)::int AS lab_count
        FROM historical_wip
      `);
      const lastUploadResult = await pool.query(`
        SELECT source_filename, created_at
        FROM historical_wip
        ORDER BY created_at DESC
        LIMIT 1
      `);
      const row = summary.rows[0];
      const today = new Date().toISOString().slice(0, 10);
      const daysBehind = row.last_date
        ? Math.max(0, Math.floor((Date.parse(today) - Date.parse(row.last_date)) / 86400000))
        : null;
      const lastUpload = lastUploadResult.rows[0]
        ? {
            filename: lastUploadResult.rows[0].source_filename,
            uploadedAt: lastUploadResult.rows[0].created_at
          }
        : null;
      res.json({
        firstDate: row.first_date,
        lastDate: row.last_date,
        today,
        daysBehind,
        totalEntries: row.total_entries,
        labCount: row.lab_count,
        lastUpload
      });
    } catch (err) {
      res.status(500).json({error: err.message});
    }
  });
```

- [ ] **Step 2: Syntax check**

```bash
node --check routes/historical-wip.js
```

Expected: no output.

- [ ] **Step 3: Boot server and curl the new endpoint**

```bash
npm run dev
```

In a separate terminal:

```bash
curl -s http://127.0.0.1:3000/api/historical-wip/coverage
```

Expected: a JSON object like:
```
{"firstDate":"2025-03-17","lastDate":"2026-04-18","today":"2026-05-06","daysBehind":18,"totalEntries":14326,"labCount":22,"lastUpload":{...}}
```

Numbers will vary based on actual data. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add routes/historical-wip.js
git commit -m "feat(api): add GET /api/historical-wip/coverage"
```

---

## Task 8: Add `POST /api/historical-wip/sync`

**Files:**
- Modify: `routes/historical-wip.js`
- Modify: `server.js` (add a parsing helper to ctx)

- [ ] **Step 1: Add `parseHistoricalWipRows` helper to `server.js`**

In `server.js`, near the existing `parseScheduleEvents` and `parseStdHoursOverrides` helpers, add:

```javascript
// Parses an xlsx loaded as raw rows into historical WIP overrides.
// Mirrors the format used by loadHistoricalWipFromWorkbook (header in row 0,
// lab in column 1, category in column 2, daily values in columns 3+).
// Returns {overrides, issues, skipped}.
function parseHistoricalWipRows(workbookBuffer) {
  const overrides = [];
  const issues = [];
  const skipped = [];

  let wb;
  try {
    wb = XLSX.read(workbookBuffer, {type: 'buffer'});
  } catch (err) {
    issues.push({reason: `Could not parse workbook: ${err.message}`});
    return {overrides, issues, skipped};
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) {
    issues.push({reason: 'Workbook has no sheets'});
    return {overrides, issues, skipped};
  }
  const rows = XLSX.utils.sheet_to_json(ws, {header: 1, defval: null});
  if (!rows.length) {
    issues.push({reason: 'Workbook is empty'});
    return {overrides, issues, skipped};
  }

  const header = rows[0] || [];
  const dateCols = [];
  for (let c = 3; c < header.length; c++) {
    const iso = excelDateToISO(header[c]);
    if (iso) dateCols.push({idx: c, date: iso});
  }
  if (!dateCols.length) {
    issues.push({reason: 'No date columns found in header (expected dates in columns 3+)'});
    return {overrides, issues, skipped};
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const category = String(row[2] || '').trim();
    if (category !== HISTORICAL_WIP_CATEGORY) continue;

    const labRaw = String(row[1] || '').trim();
    if (!labRaw) {
      skipped.push({rowNumber: r + 1, reason: 'Empty lab name'});
      continue;
    }
    const labKey = normalizeLabKey(labRaw);
    const canonicalKey = LAB_MAPPING.aliasToCanonicalKey[labKey] || labKey;
    if (!LAB_MAPPING.canonicalLabByKey[canonicalKey]) {
      skipped.push({rowNumber: r + 1, labRaw, reason: `Unknown lab: "${labRaw}"`});
      continue;
    }

    for (const dc of dateCols) {
      const v = row[dc.idx];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
      overrides.push({
        labRaw,
        labKey: canonicalKey,
        entryDate: dc.date,
        stdHrs: Number(v)
      });
    }
  }

  return {overrides, issues, skipped};
}
```

- [ ] **Step 2: Add `syncHistoricalWipOverrides` helper to `server.js`**

Just below `parseHistoricalWipRows`, add:

```javascript
// Merges parsed historical WIP overrides into the historical_wip table.
// Insert new (lab_key, entry_date) rows; update existing rows when std_hrs differs;
// leave unchanged rows alone. Returns {inserted, updated, unchanged}.
async function syncHistoricalWipOverrides(client, overrides, sourceFilename) {
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const o of overrides) {
    const existing = await client.query(
      `SELECT std_hrs FROM historical_wip WHERE lab_key = $1 AND entry_date = $2`,
      [o.labKey, o.entryDate]
    );
    if (!existing.rows.length) {
      await client.query(
        `INSERT INTO historical_wip (lab_raw, lab_key, entry_date, std_hrs, source_filename)
         VALUES ($1, $2, $3, $4, $5)`,
        [o.labRaw, o.labKey, o.entryDate, o.stdHrs, sourceFilename]
      );
      inserted++;
    } else if (Number(existing.rows[0].std_hrs) !== o.stdHrs) {
      await client.query(
        `UPDATE historical_wip
         SET std_hrs = $1, source_filename = $2, updated_at = NOW()
         WHERE lab_key = $3 AND entry_date = $4`,
        [o.stdHrs, sourceFilename, o.labKey, o.entryDate]
      );
      updated++;
    } else {
      unchanged++;
    }
  }

  return {inserted, updated, unchanged};
}
```

- [ ] **Step 3: Wire the helpers into `ctx`**

Update the `ctx` object in `server.js`:

```javascript
const ctx = {
  pool,
  dbRequired,
  upload,
  LAB_MAPPING,
  LAB_MAPPING_CSV_PATH,
  HISTORICAL_WIP,
  loadHistoricalWipFromDb,
  parseHistoricalWipRows,
  syncHistoricalWipOverrides,
  ...
};
```

(Add the two new fields; existing fields stay.)

- [ ] **Step 4: Add `POST /sync` route in `routes/historical-wip.js`**

Update `createHistoricalWipRouter` to destructure the new helpers and add the route:

```javascript
function createHistoricalWipRouter(ctx) {
  const {
    pool,
    dbRequired,
    upload,
    HISTORICAL_WIP,
    loadHistoricalWipFromDb,
    parseHistoricalWipRows,
    syncHistoricalWipOverrides
  } = ctx;
  const router = express.Router();

  // ... existing GET / and GET /coverage routes stay ...

  router.post('/sync', upload.single('file'), async (req, res) => {
    if (!dbRequired(res)) return;
    if (!req.file) {
      res.status(400).json({error: 'Missing upload file. Field name must be "file".'});
      return;
    }

    const {overrides, issues, skipped} = parseHistoricalWipRows(req.file.buffer);
    if (!overrides.length) {
      res.status(400).json({
        error: 'No valid historical-WIP rows found. Expected the same xlsx format as the existing file (header in row 1, lab in col 2, category "Workable WIP Std. Hrs." in col 3, daily values in cols 4+).',
        issues: issues.slice(0, 50),
        skipped: skipped.slice(0, 100)
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const summary = await syncHistoricalWipOverrides(
        client,
        overrides,
        req.file.originalname || 'upload'
      );
      await client.query('COMMIT');
      res.json({
        summary: {...summary, skipped: skipped.length},
        parsedRows: overrides.length + skipped.length,
        validRows: overrides.length,
        skippedRows: skipped.length,
        skipped: skipped.slice(0, 100),
        issues: issues.slice(0, 50)
      });
    } catch (err) {
      await client.query('ROLLBACK');
      res.status(500).json({error: err.message});
    } finally {
      client.release();
    }
  });

  return router;
}
```

- [ ] **Step 5: Syntax check both files**

```bash
node --check server.js
node --check routes/historical-wip.js
```

Expected: no output.

- [ ] **Step 6: Boot server**

```bash
npm run dev
```

Expected: starts cleanly.

- [ ] **Step 7: Test the upload happy path**

In a separate terminal:

```bash
curl -s -F "file=@historical wip caltrak labs.xlsx" \
  http://127.0.0.1:3000/api/historical-wip/sync
```

Expected: a JSON response with `summary.inserted: 0`, `summary.updated: 0`, and `summary.unchanged` matching the row count (since we're uploading the same xlsx that's already in the DB).

Stop the server.

- [ ] **Step 8: Commit**

```bash
git add server.js routes/historical-wip.js
git commit -m "feat(api): add POST /api/historical-wip/sync"
```

---

## Task 9: Add `historicalWipState` to `js/state.js`

**Files:**
- Modify: `js/state.js`

- [ ] **Step 1: Append the new state object**

At the end of `js/state.js`, append:

```javascript

// ─── HISTORICAL WIP TAB STATE ────────────────────────────────────────────────
const historicalWipState = {
  coverage: null,    // {firstDate, lastDate, today, daysBehind, totalEntries, labCount, lastUpload}
  rangeStart: null,  // ISO date — defaults to lastDate - 60d
  rangeEnd: null,    // ISO date — defaults to lastDate
  searchTerm: '',
};
```

- [ ] **Step 2: Syntax check**

```bash
node --check js/state.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add js/state.js
git commit -m "feat(state): add historicalWipState object"
```

---

## Task 10: Add nav meta link and view panel to `index.html`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the meta link**

In `index.html`, find the `<div class="nav-meta">`:

```html
<div class="nav-meta">
  <span id="data-date-label">—</span>
  <button class="nav-btn" onclick="openUploadModal()">Upload data</button>
</div>
```

Replace it with:

```html
<div class="nav-meta">
  <span id="data-date-label">—</span>
  <a class="nav-link" id="nav-historical-wip-link" onclick="switchTab('historical-wip')">Historical WIP</a>
  <button class="nav-btn" onclick="openUploadModal()">Upload data</button>
</div>
```

- [ ] **Step 2: Add the new view panel**

Find the closing `</div>` of `<div id="view-analysis" class="view-panel">`. Just after it, add:

```html

<!-- ─── HISTORICAL WIP TAB ──────────────────────────────────────────────── -->
<div id="view-historical-wip" class="view-panel">
  <!-- rendered by renderHistoricalWipTab() -->
</div>
```

- [ ] **Step 3: Verify HTML still parses cleanly**

Boot the server:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser. The page should still render. The new "Historical WIP" link should be visible in the top-right meta area, between the "Week of [date]" label and the "Upload data" button. Clicking it should currently switch to a blank panel — that's expected, the render function comes in Task 12.

Stop the server.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(ui): add Historical WIP nav link and view panel"
```

---

## Task 11: Update `switchTab()` to handle the new tab

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Find `switchTab`**

In `app.js`, locate:

```javascript
function switchTab(tabName) {
  st.tab = tabName;
  document.querySelectorAll('.nav-tab').forEach((el, i) => {
    const tabs = ['status-board', 'scenario-planner', 'analysis'];
    el.classList.toggle('active', tabs[i] === tabName);
  });
  document.querySelectorAll('.view-panel').forEach(el => el.classList.remove('active'));
  document.getElementById('view-' + tabName).classList.add('active');
  if (tabName === 'scenario-planner') renderScenarioPlanner();
  if (tabName === 'analysis') renderAnalysisTab();
}
```

- [ ] **Step 2: Add the new case**

Replace it with:

```javascript
function switchTab(tabName) {
  st.tab = tabName;
  document.querySelectorAll('.nav-tab').forEach((el, i) => {
    const tabs = ['status-board', 'scenario-planner', 'analysis'];
    el.classList.toggle('active', tabs[i] === tabName);
  });
  // Toggle the historical-wip nav link "active" state separately (it's an <a>, not a .nav-tab button)
  const histLink = document.getElementById('nav-historical-wip-link');
  if (histLink) histLink.classList.toggle('active', tabName === 'historical-wip');
  document.querySelectorAll('.view-panel').forEach(el => el.classList.remove('active'));
  document.getElementById('view-' + tabName).classList.add('active');
  if (tabName === 'scenario-planner') renderScenarioPlanner();
  if (tabName === 'analysis') renderAnalysisTab();
  if (tabName === 'historical-wip') renderHistoricalWipTab();
}
```

- [ ] **Step 3: Syntax check**

```bash
node --check app.js
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat(ui): wire Historical WIP into switchTab"
```

---

## Task 12: Create `js/historical-wip.js` with render functions

**Files:**
- Create: `js/historical-wip.js`

- [ ] **Step 1: Create the file with the full module**

Create `js/historical-wip.js` with this content:

```javascript
'use strict';

// ─── HISTORICAL WIP TAB ──────────────────────────────────────────────────────
// Read-only review of the historical_wip table. Coverage card + per-lab data
// table. Loaded after js/api.js, alongside the other tab modules.

async function renderHistoricalWipTab() {
  const panel = document.getElementById('view-historical-wip');
  if (!panel) return;

  panel.innerHTML = '<div style="padding:20px;color:#71717a">Loading…</div>';

  try {
    const [coverage, fullData] = await Promise.all([
      apiFetch('/api/historical-wip/coverage'),
      apiFetch('/api/historical-wip')
    ]);
    historicalWipState.coverage = coverage;

    // Default range = last 60 days through lastDate
    if (!historicalWipState.rangeEnd && coverage.lastDate) {
      historicalWipState.rangeEnd = coverage.lastDate;
      const endMs = Date.parse(coverage.lastDate);
      historicalWipState.rangeStart = new Date(endMs - 60 * 86400000).toISOString().slice(0, 10);
    }

    panel.innerHTML = `
      <div class="hwip-layout">
        ${renderHistoricalWipCoverage(coverage)}
        ${renderHistoricalWipControls()}
        ${renderHistoricalWipTable(fullData, historicalWipState.rangeStart, historicalWipState.rangeEnd)}
      </div>
    `;
  } catch (err) {
    panel.innerHTML = `<div style="padding:20px;color:#b91c1c">Failed to load historical WIP: ${esc(err.message)}</div>`;
  }
}

function renderHistoricalWipCoverage(coverage) {
  if (!coverage || !coverage.lastDate) {
    return `
      <div class="hwip-coverage">
        <div class="hwip-coverage-title">Historical WIP Coverage</div>
        <div class="hwip-coverage-empty">No data yet. Upload a file via the Upload data button.</div>
      </div>
    `;
  }

  const daysBehind = coverage.daysBehind ?? 0;
  let staleClass = 'hwip-stale-ok';
  let staleLabel = 'current';
  if (daysBehind > 14) {
    staleClass = 'hwip-stale-bad';
    staleLabel = `${daysBehind} days behind — update soon`;
  } else if (daysBehind > 7) {
    staleClass = 'hwip-stale-warn';
    staleLabel = `${daysBehind} days behind`;
  } else if (daysBehind > 0) {
    staleLabel = `${daysBehind} days behind`;
  }

  const lastUploadLine = coverage.lastUpload
    ? `Last upload: ${formatDateLabel(coverage.lastUpload.uploadedAt)} — ${esc(coverage.lastUpload.filename)}`
    : 'Last upload: —';

  return `
    <div class="hwip-coverage">
      <div class="hwip-coverage-title">Historical WIP Coverage</div>
      <div class="hwip-coverage-grid">
        <div><span class="hwip-coverage-k">Earliest date</span><span class="hwip-coverage-v">${formatDateLabel(coverage.firstDate)}</span></div>
        <div><span class="hwip-coverage-k">Latest date</span><span class="hwip-coverage-v">${formatDateLabel(coverage.lastDate)}</span></div>
        <div><span class="hwip-coverage-k">Today</span><span class="hwip-coverage-v">${formatDateLabel(coverage.today)}</span></div>
        <div><span class="hwip-coverage-k">Total entries</span><span class="hwip-coverage-v">${fmtInt(coverage.totalEntries)} across ${coverage.labCount} labs</span></div>
      </div>
      <div class="hwip-stale ${staleClass}">${staleLabel}</div>
      <div class="hwip-last-upload">${lastUploadLine}</div>
    </div>
  `;
}

function renderHistoricalWipControls() {
  return `
    <div class="hwip-controls">
      <label>From <input type="date" id="hwip-range-start" value="${historicalWipState.rangeStart || ''}" onchange="onHistoricalWipRangeChange()"></label>
      <label>To <input type="date" id="hwip-range-end" value="${historicalWipState.rangeEnd || ''}" onchange="onHistoricalWipRangeChange()"></label>
      <input type="search" id="hwip-search" placeholder="Search labs…" oninput="onHistoricalWipSearch(this.value)" style="margin-left:auto;min-width:200px">
    </div>
  `;
}

function renderHistoricalWipTable(fullData, rangeStart, rangeEnd) {
  if (!fullData || !fullData.dailyByDate) {
    return '<div style="padding:20px;color:#a1a1aa">No data.</div>';
  }

  // Build sorted list of dates within range, most recent first
  const allDates = Object.keys(fullData.dailyByDate).sort();
  const dates = allDates.filter(d => (!rangeStart || d >= rangeStart) && (!rangeEnd || d <= rangeEnd)).reverse();

  // Build sorted list of labs (filtered by search term)
  const term = (historicalWipState.searchTerm || '').toLowerCase();
  const labs = (fullData.labs || []).filter(l => !term || l.toLowerCase().includes(term));

  if (!dates.length) {
    return '<div style="padding:20px;color:#a1a1aa">No dates in selected range.</div>';
  }

  const headerCells = dates.map(d => `<th class="hwip-date-col">${formatShortDate(d)}</th>`).join('');
  const bodyRows = labs.map(labRaw => {
    const key = labKey(labRaw);
    const cells = dates.map(d => {
      const val = fullData.dailyByDate[d]?.[key];
      if (val == null || !Number.isFinite(val)) {
        return '<td class="hwip-cell hwip-empty"><span class="hwip-dot"></span></td>';
      }
      return `<td class="hwip-cell">${fmt(val, 1)}</td>`;
    }).join('');
    return `<tr><td class="hwip-lab">${esc(labRaw)}</td>${cells}</tr>`;
  }).join('');

  return `
    <div class="hwip-table-wrap">
      <table class="hwip-table">
        <thead>
          <tr>
            <th class="hwip-lab-col">Lab</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

function onHistoricalWipRangeChange() {
  const startEl = document.getElementById('hwip-range-start');
  const endEl = document.getElementById('hwip-range-end');
  historicalWipState.rangeStart = startEl?.value || null;
  historicalWipState.rangeEnd = endEl?.value || null;
  renderHistoricalWipTab();
}

function onHistoricalWipSearch(term) {
  historicalWipState.searchTerm = term || '';
  // Re-render only the table (cheaper than full reload).
  apiFetch('/api/historical-wip').then(fullData => {
    const wrap = document.querySelector('#view-historical-wip .hwip-table-wrap');
    if (!wrap) return;
    const newTable = document.createElement('div');
    newTable.innerHTML = renderHistoricalWipTable(fullData, historicalWipState.rangeStart, historicalWipState.rangeEnd);
    wrap.replaceWith(newTable.firstElementChild);
  }).catch(() => {});
}

function formatDateLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
}

function formatShortDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}
```

- [ ] **Step 2: Syntax check**

```bash
node --check js/historical-wip.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add js/historical-wip.js
git commit -m "feat(ui): add js/historical-wip.js with review tab rendering"
```

---

## Task 13: Add CSS for Historical WIP page

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Append the new CSS at the end of `styles.css`**

```css

/* ── HISTORICAL WIP TAB ─────────────────────────────────────────────────── */
#view-historical-wip { padding: 16px 20px; }
.nav-link {
  color: #c7d6e6; font-size: 12px; font-weight: 600; cursor: pointer;
  padding: 4px 8px; border-radius: 6px; white-space: nowrap; user-select: none;
}
.nav-link:hover { color: #fff; background: #12385d; }
.nav-link.active { color: #fff; background: #00539b; }

.hwip-layout { display: flex; flex-direction: column; gap: 14px; }

.hwip-coverage {
  background: #fff; border: 1px solid #d0dce8; border-radius: 12px;
  padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,35,66,.08);
}
.hwip-coverage-title {
  font-size: 11px; font-weight: 700; color: #6b7a90;
  text-transform: uppercase; letter-spacing: .5px; margin-bottom: 10px;
}
.hwip-coverage-empty { font-size: 13px; color: #71717a; }
.hwip-coverage-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px; margin-bottom: 10px;
}
.hwip-coverage-grid > div { display: flex; flex-direction: column; gap: 2px; }
.hwip-coverage-k {
  font-size: 10px; font-weight: 700; color: #71717a;
  text-transform: uppercase; letter-spacing: .4px;
}
.hwip-coverage-v { font-size: 14px; font-weight: 700; color: #18181b; font-variant-numeric: tabular-nums; }
.hwip-stale {
  display: inline-block; padding: 4px 10px; border-radius: 999px;
  font-size: 11px; font-weight: 700; margin-top: 4px;
}
.hwip-stale-ok { background: #f0fdf4; color: #14532d; border: 1px solid #bbf7d0; }
.hwip-stale-warn { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
.hwip-stale-bad { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
.hwip-last-upload { font-size: 11px; color: #a1a1aa; margin-top: 8px; }

.hwip-controls {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  background: #fff; border: 1px solid #d0dce8; border-radius: 12px;
  padding: 10px 14px; box-shadow: 0 1px 3px rgba(0,35,66,.08);
}
.hwip-controls label {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; color: #6b7a90;
  text-transform: uppercase; letter-spacing: .4px;
}
.hwip-controls input[type="date"], .hwip-controls input[type="search"] {
  border: 1px solid #d0dce8; border-radius: 6px; padding: 5px 8px; font-size: 12px;
}

.hwip-table-wrap {
  overflow-x: auto; background: #fff; border: 1px solid #d0dce8;
  border-radius: 12px; box-shadow: 0 1px 3px rgba(0,35,66,.08);
}
.hwip-table {
  width: max-content; min-width: 100%; border-collapse: collapse; font-size: 12px;
}
.hwip-table thead th {
  position: sticky; top: 0; background: #002342; color: #dbe6f3;
  padding: 8px 10px; font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .4px; white-space: nowrap;
  border-bottom: 1px solid #0f2f4f;
}
.hwip-lab-col { position: sticky; left: 0; z-index: 2; background: #002342; text-align: left; }
.hwip-date-col { text-align: right; }
.hwip-table tbody tr { border-bottom: 1px solid #f4f4f5; }
.hwip-table tbody td { padding: 7px 10px; vertical-align: middle; }
.hwip-cell { text-align: right; font-variant-numeric: tabular-nums; color: #52525b; }
.hwip-cell.hwip-empty { color: #d1d5db; }
.hwip-lab {
  position: sticky; left: 0; background: #fff; font-weight: 600; color: #18181b;
  white-space: nowrap; box-shadow: 1px 0 0 #e4e4e7;
}
.hwip-dot {
  display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  background: #d4d4d8;
}
```

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "feat(ui): add styles for Historical WIP page"
```

---

## Task 14: Wire `js/historical-wip.js` script tag into `index.html`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the script tag**

Find the existing block of script tags near the bottom:

```html
<script src="js/upload.js"></script>
<script src="js/analysis.js"></script>
<script src="app.js"></script>
```

Insert the new script tag before `app.js`:

```html
<script src="js/upload.js"></script>
<script src="js/analysis.js"></script>
<script src="js/historical-wip.js"></script>
<script src="app.js"></script>
```

- [ ] **Step 2: Boot server and test the new tab end-to-end**

```bash
npm run dev
```

In your browser, hard-reload `http://localhost:3000`:

- The "Historical WIP" link should be visible top-right.
- Click it. The Historical WIP review page should render with the coverage card, controls, and the data table.
- The "days behind" indicator should be the right color (red if >14 days behind real data).
- The data table should show recent dates with values; missing cells show small grey dots.
- Type a lab name in the search box — the table should filter.
- Change the date range — the table should reload.
- Click the Status Board tab — should switch back cleanly.
- Click the Historical WIP link again — should reload the tab.

If anything is broken, check DevTools Console for errors. Stop the server.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(ui): wire historical-wip.js script tag"
```

---

## Task 15: Add 4th tab to upload modal

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the tab button**

In `index.html`, find:

```html
<div class="upload-tabs">
  <button class="upload-tab active" id="utab-std-hours" onclick="switchUploadTab('std-hours')">Std Hours</button>
  <button class="upload-tab" id="utab-schedule" onclick="switchUploadTab('schedule')">Onsite Schedule</button>
  <button class="upload-tab" id="utab-headcount" onclick="switchUploadTab('headcount')">Headcount</button>
</div>
```

Add a 4th button:

```html
<div class="upload-tabs">
  <button class="upload-tab active" id="utab-std-hours" onclick="switchUploadTab('std-hours')">Std Hours</button>
  <button class="upload-tab" id="utab-schedule" onclick="switchUploadTab('schedule')">Onsite Schedule</button>
  <button class="upload-tab" id="utab-headcount" onclick="switchUploadTab('headcount')">Headcount</button>
  <button class="upload-tab" id="utab-historical-wip" onclick="switchUploadTab('historical-wip')">Historical WIP</button>
</div>
```

- [ ] **Step 2: Add the upload-pane**

Find the closing `</div>` of `<div id="upload-pane-headcount" hidden>`. Just after it, before the closing of `<div class="modal-body">`, add:

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

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(ui): add Historical WIP tab to upload modal"
```

---

## Task 16: Update `js/upload.js` to dispatch the new type

**Files:**
- Modify: `js/upload.js`

- [ ] **Step 1: Extend `switchUploadTab` to include the new tab**

In `js/upload.js`, find this block (around line 19):

```javascript
function switchUploadTab(tabName) {
  ['std-hours', 'schedule', 'headcount'].forEach(t => {
    document.getElementById(`utab-${t}`)?.classList.toggle('active', t === tabName);
    const pane = document.getElementById(`upload-pane-${t}`);
    if (pane) pane.hidden = t !== tabName;
  });
}
```

Replace the array with the four-element version:

```javascript
function switchUploadTab(tabName) {
  ['std-hours', 'schedule', 'headcount', 'historical-wip'].forEach(t => {
    document.getElementById(`utab-${t}`)?.classList.toggle('active', t === tabName);
    const pane = document.getElementById(`upload-pane-${t}`);
    if (pane) pane.hidden = t !== tabName;
  });
}
```

- [ ] **Step 2: Extend `submitUpload` to map the new type to its endpoint**

Find this block (around line 139):

```javascript
  const url = type === 'std-hours'
    ? '/api/std-hours/sync'
    : type === 'headcount'
      ? '/api/headcount/sync'
      : '/api/schedules/sync';
```

Replace it with:

```javascript
  const url = type === 'std-hours'
    ? '/api/std-hours/sync'
    : type === 'headcount'
      ? '/api/headcount/sync'
      : type === 'historical-wip'
        ? '/api/historical-wip/sync'
        : '/api/schedules/sync';
```

- [ ] **Step 3: Verify `renderUploadReport` works as-is**

The existing `renderUploadReport` reads from `data.summary.inserted/updated/unchanged` (which the new endpoint returns) and from `data.skipped[].rowNumber/labRaw/reason` (which the new endpoint also returns — Task 8's parser was written to match this shape).

The `formatSkippedReason` function will pass through the historical-wip reasons (e.g. `"Unknown lab: Tangent NYC"`) unchanged because they don't match any of the special-cased codes.

The optional `data.summary.details.{inserted,updated,unchanged}` arrays are absent from the historical-wip response — that's fine; `renderUploadReport` defaults them to empty arrays and skips those sections.

**No code change needed in `renderUploadReport`.**

- [ ] **Step 4: Syntax check**

```bash
node --check js/upload.js
```

Expected: no output.

- [ ] **Step 5: Boot server and test the upload modal end-to-end**

```bash
npm run dev
```

In the browser:
1. Click the "Upload data" button.
2. Click the new "Historical WIP" tab inside the modal.
3. The pane should swap to a file picker and submit button.
4. Pick the existing `historical wip caltrak labs.xlsx` file. Submit.
5. Result should display "Upload complete." followed by `Inserted: 0 | Updated: 0 | Unchanged: <N>` (where N is the number of cells in the xlsx).
6. Close the modal.
7. Click the "Historical WIP" link in the nav.
8. Coverage card should reflect the data.

Stop the server.

- [ ] **Step 6: Commit**

```bash
git add js/upload.js
git commit -m "feat(ui): wire Historical WIP type into upload modal logic"
```

---

## Task 17: Run the full verification plan from the spec

**Files:** none (testing only)

- [ ] **Step 1: Migration parity**

Restart server with a `DATABASE_URL` pointed at a fresh database. Confirm console shows the migration ran and inserted N rows. Then restart again — confirm it does NOT re-import (count stays the same).

- [ ] **Step 2: API parity**

Curl `/api/historical-wip` and confirm the response shape matches what was previously served from the xlsx (same dates, same labs, same values).

- [ ] **Step 3: Modal chart parity (CRITICAL)**

Open the app at the Status Board. Click three different lab rows to open their modal charts:
- One CalTrak lab with std hours data
- One IndySoft lab
- One lab with sparse data (e.g. one of the smaller labs)

For each, verify the chart renders normally and shows the historical line at the right level. **If any chart is broken or missing data, this is a blocker** — investigate before merging.

- [ ] **Step 4: Coverage card**

Visit the Historical WIP tab. Confirm:
- First/last dates match the data range
- Days-behind value matches reality
- Color of the staleness indicator is correct

- [ ] **Step 5: Upload happy path**

Upload the existing xlsx unchanged. Result: `Inserted: 0 | Updated: 0 | Unchanged: <N>`.

- [ ] **Step 6: Upload merge**

Make a copy of the xlsx, change ONE cell value, save it. Upload the modified file. Result: `Inserted: 0 | Updated: 1 | Unchanged: <N-1>`.

- [ ] **Step 7: Upload of new dates**

In a copy of the xlsx, add a new date column with values for a few labs. Upload. The `Inserted` count should match the number of (lab, date) cells with valid numbers in that new column.

- [ ] **Step 8: Unknown lab**

Add a row to the xlsx with a lab name that doesn't appear in `lab_mapping_variants.csv`. Upload. That row's lab should appear in the "Skipped rows" section of the result with reason `Unknown lab: "..."`.

- [ ] **Step 9: No deletions**

Make a copy of the xlsx with several recent dates removed. Upload. Open the Historical WIP tab and confirm those dates are still present in the table.

- [ ] **Step 10: Final tag**

```bash
git tag historical-wip-verified
```

Branch is ready for the user to evaluate.

---

## Done

Branch is ready for the user to test on Railway (or merge to main + verify live).

If it works as expected: merge to `main`. If not: roll back the branch (`git checkout main && git branch -D feature/historical-wip-review` after notes captured).
