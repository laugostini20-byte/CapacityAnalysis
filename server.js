require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const {Pool} = require('pg');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: 10 * 1024 * 1024}
});

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';
const DATABASE_URL = process.env.DATABASE_URL || '';
const hasDatabase = Boolean(DATABASE_URL);
const APP_USER = process.env.APP_USER || '';
const APP_PASS = process.env.APP_PASS || '';

const pool = hasDatabase
  ? new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? {rejectUnauthorized: false} : false
  })
  : null;

const SCHEMA_SQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

function normalizeHeader(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getRowValueByHeaders(row, headerCandidates) {
  const map = {};
  Object.keys(row || {}).forEach(key => { map[normalizeHeader(key)] = row[key]; });
  for (const header of headerCandidates) {
    const val = map[normalizeHeader(header)];
    if (val != null && String(val).trim() !== '') return val;
  }
  return null;
}

function parseHoursValue(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/,/g, '').replace(/[^0-9.\-]/g, '').trim();
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseAnyDate(v) {
  if (!v && v !== 0) return null;
  if (v instanceof Date && !Number.isNaN(v.valueOf())) return v;

  if (typeof v === 'number') {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return new Date(parsed.y, parsed.m - 1, parsed.d);
    }
    const fallback = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!Number.isNaN(fallback.valueOf())) return fallback;
  }

  const d = new Date(String(v));
  return Number.isNaN(d.valueOf()) ? null : d;
}

function toISODateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISODateInput(v) {
  const s = String(v || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(n => parseInt(n, 10));
  const parsed = new Date(y, m - 1, d);
  if (Number.isNaN(parsed.valueOf())) return null;
  if (parsed.getFullYear() !== y || (parsed.getMonth() + 1) !== m || parsed.getDate() !== d) return null;
  return s;
}

function normalizeLabKey(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRowsFromBuffer(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  let workbook;

  if (ext === '.csv') {
    workbook = XLSX.read(file.buffer.toString('utf8'), {type: 'string'});
  } else {
    workbook = XLSX.read(file.buffer, {type: 'buffer', cellDates: false});
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, {defval: ''});
}

function parseScheduleEvents(rows) {
  const deduped = new Map();
  const issues = [];

  rows.forEach((row, idx) => {
    const labRawVal = getRowValueByHeaders(row, [
      'Lab',
      'Lab / Department',
      'Lab Name',
      'Department',
      'Location'
    ]);
    const startVal = getRowValueByHeaders(row, ['Start Time', 'Start', 'From']);
    const endVal = getRowValueByHeaders(row, ['End Time', 'End', 'To']) ?? startVal;
    const techVal = getRowValueByHeaders(row, ['Number of Tech', 'Techs', 'Tech Count']);

    const labRaw = String(labRawVal || '').trim();
    const start = parseAnyDate(startVal);
    const end = parseAnyDate(endVal);
    const techCount = parseHoursValue(techVal);

    if (!labRaw || !start || !end || techCount == null || techCount < 0) {
      issues.push(`Row ${idx + 2} skipped due to missing/invalid Lab, Start, End, or Number of Tech`);
      return;
    }

    const startDate = toISODateLocal(start);
    const endDate = toISODateLocal(end);
    const labKey = normalizeLabKey(labRaw);
    if (!labKey) {
      issues.push(`Row ${idx + 2} skipped due to unusable Lab value`);
      return;
    }

    const key = `${labKey}|${startDate}|${endDate}`;
    deduped.set(key, {
      labRaw,
      labKey,
      startDate,
      endDate,
      techCount
    });
  });

  return {events: [...deduped.values()], issues};
}

function parseStdHoursOverrides(rows) {
  const deduped = new Map();
  const issues = [];

  rows.forEach((row, idx) => {
    const labRawVal = getRowValueByHeaders(row, [
      'Lab',
      'Lab / Department',
      'Lab Name',
      'Department',
      'Location'
    ]);
    const stdRaw = getRowValueByHeaders(row, [
      'Current Std Hours',
      'Std Hours',
      'Standard Hours',
      'StdHrs',
      'Weekly Demand',
      'Demand Hrs'
    ]);

    const labRaw = String(labRawVal || '').trim();
    const stdHours = parseHoursValue(stdRaw);
    if (!labRaw || stdHours == null || stdHours < 0) {
      issues.push(`Row ${idx + 2} skipped due to missing/invalid Lab or Std Hours`);
      return;
    }

    const labKey = normalizeLabKey(labRaw);
    if (!labKey) {
      issues.push(`Row ${idx + 2} skipped due to unusable Lab value`);
      return;
    }

    deduped.set(labKey, {labRaw, labKey, stdHours});
  });

  return {overrides: [...deduped.values()], issues};
}

async function ensureSchema() {
  if (!pool) return;
  await pool.query(SCHEMA_SQL);
}

async function getExistingEventMap(client) {
  const res = await client.query(`
    SELECT id, lab_raw, lab_key, start_date::text AS start_date, end_date::text AS end_date, tech_count
    FROM onsite_events
  `);
  const map = new Map();
  res.rows.forEach(r => {
    const key = `${r.lab_key}|${r.start_date}|${r.end_date}`;
    map.set(key, r);
  });
  return map;
}

function isTechCountDifferent(a, b) {
  return Math.abs(Number(a) - Number(b)) > 1e-9;
}

async function syncEvents(client, events, filename) {
  const existingMap = await getExistingEventMap(client);
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const e of events) {
    const key = `${e.labKey}|${e.startDate}|${e.endDate}`;
    const existing = existingMap.get(key);

    if (!existing) {
      await client.query(
        `INSERT INTO onsite_events (lab_raw, lab_key, start_date, end_date, tech_count, source_filename)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [e.labRaw, e.labKey, e.startDate, e.endDate, e.techCount, filename]
      );
      inserted++;
      continue;
    }

    const changed = existing.lab_raw !== e.labRaw || isTechCountDifferent(existing.tech_count, e.techCount);
    if (!changed) {
      unchanged++;
      continue;
    }

    await client.query(
      `UPDATE onsite_events
       SET lab_raw = $1, tech_count = $2, source_filename = $3, updated_at = NOW()
       WHERE id = $4`,
      [e.labRaw, e.techCount, filename, existing.id]
    );
    updated++;
  }

  const removed = 0;
  await client.query(
    `INSERT INTO upload_batches (filename, inserted_count, updated_count, unchanged_count, removed_count)
     VALUES ($1, $2, $3, $4, $5)`,
    [filename, inserted, updated, unchanged, removed]
  );

  return {inserted, updated, unchanged, removed};
}

function isStdHoursDifferent(a, b) {
  return Math.abs(Number(a) - Number(b)) > 1e-9;
}

async function syncStdHoursOverrides(client, overrides, filename, effectiveFrom, effectiveTo) {
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of overrides) {
    const existingRes = await client.query(
      `SELECT id, lab_raw, std_hours
       FROM std_hours_overrides
       WHERE lab_key = $1
         AND effective_from = $2::date
         AND (
           ($3::date IS NULL AND effective_to IS NULL)
           OR effective_to = $3::date
         )
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
      [row.labKey, effectiveFrom, effectiveTo]
    );

    const existing = existingRes.rows[0];
    if (!existing) {
      await client.query(
        `INSERT INTO std_hours_overrides
          (lab_raw, lab_key, std_hours, effective_from, effective_to, source_filename)
         VALUES ($1, $2, $3, $4::date, $5::date, $6)`,
        [row.labRaw, row.labKey, row.stdHours, effectiveFrom, effectiveTo, filename]
      );
      inserted++;
      continue;
    }

    const changed = existing.lab_raw !== row.labRaw || isStdHoursDifferent(existing.std_hours, row.stdHours);
    if (!changed) {
      unchanged++;
      continue;
    }

    await client.query(
      `UPDATE std_hours_overrides
       SET lab_raw = $1, std_hours = $2, source_filename = $3, updated_at = NOW()
       WHERE id = $4`,
      [row.labRaw, row.stdHours, filename, existing.id]
    );
    updated++;
  }

  return {inserted, updated, unchanged};
}

function dbRequired(res) {
  if (pool) return true;
  res.status(503).json({
    error: 'Database is not configured yet. Set DATABASE_URL to enable persistent schedule storage.'
  });
  return false;
}

function parseBasicAuth(header) {
  if (!header || !header.startsWith('Basic ')) return null;
  const encoded = header.slice(6);
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (sep < 0) return null;
    return {
      username: decoded.slice(0, sep),
      password: decoded.slice(sep + 1)
    };
  } catch (_err) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  if (!APP_USER || !APP_PASS) return next();
  const creds = parseBasicAuth(req.headers.authorization || '');
  if (creds && creds.username === APP_USER && creds.password === APP_PASS) return next();
  res.setHeader('WWW-Authenticate', 'Basic realm="Capacity Tool"');
  return res.status(401).send('Authentication required');
}

app.use(express.json());
app.use(authMiddleware);
app.use(express.static(__dirname));

app.get('/api/health', async (_req, res) => {
  if (!pool) {
    res.json({ok: true, database: 'not_configured'});
    return;
  }
  try {
    await pool.query('SELECT 1');
    res.json({ok: true, database: 'connected'});
  } catch (err) {
    res.status(500).json({ok: false, error: err.message});
  }
});

app.get('/api/schedules', async (req, res) => {
  if (!dbRequired(res)) return;
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;

  try {
    const result = await pool.query(
      `SELECT lab_raw, start_date::text AS start_date, end_date::text AS end_date, tech_count
       FROM onsite_events
       WHERE ($1::date IS NULL OR end_date >= $1::date)
         AND ($2::date IS NULL OR start_date <= $2::date)
       ORDER BY start_date, end_date, lab_raw`,
      [from, to]
    );

    const events = result.rows.map(r => ({
      lab: r.lab_raw,
      startDate: r.start_date,
      endDate: r.end_date,
      techCount: Number(r.tech_count)
    }));

    res.json({events});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.post('/api/schedules/sync', upload.single('file'), async (req, res) => {
  if (!dbRequired(res)) return;
  if (!req.file) {
    res.status(400).json({error: 'Missing upload file. Field name must be "file".'});
    return;
  }

  let rows;
  try {
    rows = parseRowsFromBuffer(req.file);
  } catch (err) {
    res.status(400).json({error: `Could not parse file: ${err.message}`});
    return;
  }

  const {events, issues} = parseScheduleEvents(rows);
  if (!events.length) {
    res.status(400).json({
      error: 'No valid schedule rows found. Expected columns like Lab, Start Time, End Time, Number of Tech.',
      issues: issues.slice(0, 25)
    });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const summary = await syncEvents(client, events, req.file.originalname || 'upload');
    await client.query('COMMIT');
    res.json({
      summary,
      parsedRows: rows.length,
      validRows: events.length,
      issues: issues.slice(0, 25)
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({error: err.message});
  } finally {
    client.release();
  }
});

app.get('/api/std-hours', async (_req, res) => {
  if (!dbRequired(res)) return;

  try {
    const result = await pool.query(
      `SELECT id, lab_raw, lab_key, std_hours, effective_from::text AS effective_from, effective_to::text AS effective_to,
              created_at, updated_at
       FROM std_hours_overrides
       ORDER BY updated_at DESC, id DESC`
    );
    const overrides = result.rows.map(r => ({
      id: Number(r.id),
      lab: r.lab_raw,
      labKey: r.lab_key,
      stdHours: Number(r.std_hours),
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
    res.json({overrides});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.post('/api/std-hours/sync', upload.single('file'), async (req, res) => {
  if (!dbRequired(res)) return;
  if (!req.file) {
    res.status(400).json({error: 'Missing upload file. Field name must be "file".'});
    return;
  }

  const effectiveFrom = parseISODateInput(req.body.effectiveFrom);
  const effectiveToRaw = String(req.body.effectiveTo || '').trim();
  const effectiveTo = effectiveToRaw ? parseISODateInput(effectiveToRaw) : null;
  if (!effectiveFrom) {
    res.status(400).json({error: 'Effective from date is required in YYYY-MM-DD format.'});
    return;
  }
  if (effectiveToRaw && !effectiveTo) {
    res.status(400).json({error: 'Effective to date must be YYYY-MM-DD format or blank.'});
    return;
  }
  if (effectiveTo && effectiveTo < effectiveFrom) {
    res.status(400).json({error: 'Effective to date must be on or after Effective from date.'});
    return;
  }

  let rows;
  try {
    rows = parseRowsFromBuffer(req.file);
  } catch (err) {
    res.status(400).json({error: `Could not parse file: ${err.message}`});
    return;
  }

  const {overrides, issues} = parseStdHoursOverrides(rows);
  if (!overrides.length) {
    res.status(400).json({
      error: 'No valid std-hours rows found. Expected columns like Lab and Current Std Hours.',
      issues: issues.slice(0, 25)
    });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const summary = await syncStdHoursOverrides(
      client,
      overrides,
      req.file.originalname || 'upload',
      effectiveFrom,
      effectiveTo
    );
    await client.query('COMMIT');
    res.json({
      summary,
      parsedRows: rows.length,
      validRows: overrides.length,
      effectiveFrom,
      effectiveTo,
      issues: issues.slice(0, 25)
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({error: err.message});
  } finally {
    client.release();
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

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

start().catch(err => {
  // eslint-disable-next-line no-console
  console.error('Startup failed:', err);
  process.exit(1);
});
