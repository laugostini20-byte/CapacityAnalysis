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
const LAB_MAPPING_CSV_PATH = path.join(__dirname, 'lab_mapping_variants.csv');

function normalizeLabKey(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadLabMapping(csvPath) {
  const fallback = {
    aliasToCanonicalKey: {},
    canonicalLabByKey: {},
    systemByCanonicalKey: {},
    isActiveByCanonicalKey: {},
    activeCanonicalKeys: []
  };

  if (!fs.existsSync(csvPath)) return fallback;

  try {
    const csvText = fs.readFileSync(csvPath, 'utf8');
    const workbook = XLSX.read(csvText, {type: 'string'});
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, {defval: ''});

    const aliasToCanonicalKey = {};
    const canonicalLabByKey = {};
    const systemByCanonicalKey = {};
    const isActiveByCanonicalKey = {};
    const activeCanonicalKeys = [];

    rows.forEach((row) => {
      const canonicalLab = String(row['Canonical Lab'] || '').trim();
      if (!canonicalLab) return;

      const canonicalKey = normalizeLabKey(canonicalLab);
      const system = String(row.System || '').trim().toLowerCase();
      const status = String(row.Status || '').trim().toLowerCase();
      const isActive = status === 'active';

      canonicalLabByKey[canonicalKey] = canonicalLab;
      if (system === 'caltrak' || system === 'indysoft') {
        systemByCanonicalKey[canonicalKey] = system;
      }
      isActiveByCanonicalKey[canonicalKey] = isActive;
      if (isActive) activeCanonicalKeys.push(canonicalKey);

      aliasToCanonicalKey[canonicalKey] = canonicalKey;
      for (let i = 1; i <= 5; i++) {
        const variant = String(row[`Variant ${i}`] || '').trim();
        if (!variant) continue;
        aliasToCanonicalKey[normalizeLabKey(variant)] = canonicalKey;
      }
    });

    return {
      aliasToCanonicalKey,
      canonicalLabByKey,
      systemByCanonicalKey,
      isActiveByCanonicalKey,
      activeCanonicalKeys
    };
  } catch (err) {
    console.error('Failed to parse lab mapping CSV:', err.message);
    return fallback;
  }
}

const LAB_MAPPING = loadLabMapping(LAB_MAPPING_CSV_PATH);

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

function normalizeScenarioConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const toNum = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const selectedLabs = Array.isArray(src.selectedLabs)
    ? [...new Set(src.selectedLabs.map(v => String(v || '').trim()).filter(Boolean))]
    : [];
  const view = String(src.view || 'weekly').toLowerCase();
  const statusFilter = String(src.statusFilter || 'all').toLowerCase();
  const scopeType = String(src.scopeType || 'all').toLowerCase();
  const scopePlatform = String(src.scopePlatform || 'caltrak').toLowerCase();
  return {
    enabled: Boolean(src.enabled),
    scopeType: ['all', 'platform', 'selection'].includes(scopeType) ? scopeType : 'selection',
    scopePlatform: ['caltrak', 'indysoft'].includes(scopePlatform) ? scopePlatform : 'caltrak',
    onsitePct: toNum(src.onsitePct, 0),
    productivityPct: toNum(src.productivityPct, 0),
    headcountDelta: toNum(src.headcountDelta, 0),
    demandPct: toNum(src.demandPct, 0),
    selectedLabs,
    view: ['weekly', 'monthly', 'quarterly', 'yearly'].includes(view) ? view : 'weekly',
    statusFilter: ['all', 'over', 'risk', 'ok'].includes(statusFilter) ? statusFilter : 'all'
  };
}

// Maps schedule export lab codes (e.g. "05 houston") to canonical BASE_LABS lab keys
const SCHEDULE_LAB_KEY_MAP = {
  '01 rochester':    'rochester cal lab',
  '02 portland':     'portland cal lab',
  '05 houston':      'houston cal lab',
  '06 philadelphia': 'philadelphia cal lab',
  '09 toronto':      'toronto cal lab',
  '11 boston':       'boston cal lab',
  '15 dayton':       'dayton cal lab',
  '17 charlotte':    'charlotte cal lab',
  '19 los angeles':  'los angeles cal lab',
  '23 denver':       'denver cal lab',
  '24 phoenix':      'phoenix cal lab',
  '31 san diego':    'san diego cal lab',
  '33 ottawa':       'ottawa cal lab',
  '61 palm beach':   'palm beach cal lab',
  'm5 st louis':     'st louis cal lab',
};

function mapToCanonicalLabKey(rawLab) {
  const rawKey = normalizeLabKey(rawLab);
  return LAB_MAPPING.aliasToCanonicalKey[rawKey] ?? SCHEDULE_LAB_KEY_MAP[rawKey] ?? rawKey;
}

function resolveLabMatch(rawLab) {
  const rawKey = normalizeLabKey(rawLab);
  if (LAB_MAPPING.aliasToCanonicalKey[rawKey]) {
    return {labKey: LAB_MAPPING.aliasToCanonicalKey[rawKey], matchType: 'mapping'};
  }
  if (SCHEDULE_LAB_KEY_MAP[rawKey]) {
    return {labKey: SCHEDULE_LAB_KEY_MAP[rawKey], matchType: 'legacy_code'};
  }
  return {labKey: rawKey, matchType: 'unmapped'};
}

function isLabActiveByKey(labKey) {
  const key = normalizeLabKey(labKey);
  if (Object.prototype.hasOwnProperty.call(LAB_MAPPING.isActiveByCanonicalKey, key)) {
    return LAB_MAPPING.isActiveByCanonicalKey[key];
  }
  return true;
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
  const skipped = [];

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
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
      issues.push(`Row ${rowNumber} skipped due to missing/invalid Lab, Start, End, or Number of Tech`);
      skipped.push({rowNumber, labRaw: labRaw || null, reason: 'missing_or_invalid_required_fields'});
      return;
    }

    const startDate = toISODateLocal(start);
    const endDate = toISODateLocal(end);
    const match = resolveLabMatch(labRaw);
    const labKey = match.labKey;
    if (!labKey) {
      issues.push(`Row ${rowNumber} skipped due to unusable Lab value`);
      skipped.push({rowNumber, labRaw, reason: 'unusable_lab'});
      return;
    }
    if (!isLabActiveByKey(labKey)) {
      issues.push(`Row ${rowNumber} skipped because "${labRaw}" maps to an inactive lab`);
      skipped.push({rowNumber, labRaw, labKey, reason: 'inactive_lab'});
      return;
    }
    if (match.matchType === 'unmapped') {
      issues.push(`Row ${rowNumber}: "${labRaw}" not found in mapping file; accepted as "${labKey}"`);
    }

    const key = `${labKey}|${startDate}|${endDate}`;
    deduped.set(key, {
      rowNumber,
      labRaw,
      labKey,
      matchType: match.matchType,
      startDate,
      endDate,
      techCount
    });
  });

  return {events: [...deduped.values()], issues, skipped};
}

function parseStdHoursOverrides(rows) {
  const deduped = new Map();
  const issues = [];
  const skipped = [];

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
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
      issues.push(`Row ${rowNumber} skipped due to missing/invalid Lab or Std Hours`);
      skipped.push({rowNumber, labRaw: labRaw || null, reason: 'missing_or_invalid_required_fields'});
      return;
    }

    const match = resolveLabMatch(labRaw);
    const labKey = match.labKey;
    if (!labKey) {
      issues.push(`Row ${rowNumber} skipped due to unusable Lab value`);
      skipped.push({rowNumber, labRaw, reason: 'unusable_lab'});
      return;
    }
    if (!isLabActiveByKey(labKey)) {
      issues.push(`Row ${rowNumber} skipped because "${labRaw}" maps to an inactive lab`);
      skipped.push({rowNumber, labRaw, labKey, reason: 'inactive_lab'});
      return;
    }
    if (match.matchType === 'unmapped') {
      issues.push(`Row ${rowNumber}: "${labRaw}" not found in mapping file; accepted as "${labKey}"`);
    }

    deduped.set(labKey, {rowNumber, labRaw, labKey, stdHours, matchType: match.matchType});
  });

  return {overrides: [...deduped.values()], issues, skipped};
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
  const details = {inserted: [], updated: [], unchanged: []};

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
      details.inserted.push({
        rowNumber: e.rowNumber,
        labRaw: e.labRaw,
        labKey: e.labKey,
        matchType: e.matchType,
        startDate: e.startDate,
        endDate: e.endDate,
        techCount: Number(e.techCount)
      });
      continue;
    }

    const changed = existing.lab_raw !== e.labRaw || isTechCountDifferent(existing.tech_count, e.techCount);
    if (!changed) {
      unchanged++;
      details.unchanged.push({
        rowNumber: e.rowNumber,
        labRaw: e.labRaw,
        labKey: e.labKey,
        matchType: e.matchType,
        startDate: e.startDate,
        endDate: e.endDate,
        techCount: Number(e.techCount)
      });
      continue;
    }

    await client.query(
      `UPDATE onsite_events
       SET lab_raw = $1, tech_count = $2, source_filename = $3, updated_at = NOW()
       WHERE id = $4`,
      [e.labRaw, e.techCount, filename, existing.id]
    );
    updated++;
    details.updated.push({
      rowNumber: e.rowNumber,
      labRaw: e.labRaw,
      labKey: e.labKey,
      matchType: e.matchType,
      startDate: e.startDate,
      endDate: e.endDate,
      previousTechCount: Number(existing.tech_count),
      techCount: Number(e.techCount)
    });
  }

  const removed = 0;
  await client.query(
    `INSERT INTO upload_batches (filename, inserted_count, updated_count, unchanged_count, removed_count)
     VALUES ($1, $2, $3, $4, $5)`,
    [filename, inserted, updated, unchanged, removed]
  );

  return {inserted, updated, unchanged, removed, details};
}

function isStdHoursDifferent(a, b) {
  return Math.abs(Number(a) - Number(b)) > 1e-9;
}

async function syncStdHoursOverrides(client, overrides, filename, effectiveFrom, effectiveTo) {
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const details = {inserted: [], updated: [], unchanged: []};

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
      details.inserted.push({
        rowNumber: row.rowNumber,
        labRaw: row.labRaw,
        labKey: row.labKey,
        matchType: row.matchType,
        stdHours: Number(row.stdHours),
        effectiveFrom,
        effectiveTo
      });
      continue;
    }

    const changed = existing.lab_raw !== row.labRaw || isStdHoursDifferent(existing.std_hours, row.stdHours);
    if (!changed) {
      unchanged++;
      details.unchanged.push({
        rowNumber: row.rowNumber,
        labRaw: row.labRaw,
        labKey: row.labKey,
        matchType: row.matchType,
        stdHours: Number(row.stdHours),
        effectiveFrom,
        effectiveTo
      });
      continue;
    }

    await client.query(
      `UPDATE std_hours_overrides
       SET lab_raw = $1, std_hours = $2, source_filename = $3, updated_at = NOW()
       WHERE id = $4`,
      [row.labRaw, row.stdHours, filename, existing.id]
    );
    updated++;
    details.updated.push({
      rowNumber: row.rowNumber,
      labRaw: row.labRaw,
      labKey: row.labKey,
      matchType: row.matchType,
      previousStdHours: Number(existing.std_hours),
      stdHours: Number(row.stdHours),
      effectiveFrom,
      effectiveTo
    });
  }

  return {inserted, updated, unchanged, details};
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

app.get('/api/lab-mapping', (_req, res) => {
  const activeLabs = LAB_MAPPING.activeCanonicalKeys.map((labKey) => ({
    labKey,
    canonicalLab: LAB_MAPPING.canonicalLabByKey[labKey] || labKey,
    system: LAB_MAPPING.systemByCanonicalKey[labKey] || null,
    status: 'active'
  }));

  res.json({
    source: path.basename(LAB_MAPPING_CSV_PATH),
    activeLabs,
    aliasToCanonicalKey: LAB_MAPPING.aliasToCanonicalKey,
    canonicalLabByKey: LAB_MAPPING.canonicalLabByKey,
    systemByCanonicalKey: LAB_MAPPING.systemByCanonicalKey,
    isActiveByCanonicalKey: LAB_MAPPING.isActiveByCanonicalKey
  });
});

app.get('/api/schedules', async (req, res) => {
  if (!dbRequired(res)) return;
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;

  try {
    const result = await pool.query(
      `SELECT lab_raw, lab_key, start_date::text AS start_date, end_date::text AS end_date, tech_count
       FROM onsite_events
       WHERE ($1::date IS NULL OR end_date >= $1::date)
         AND ($2::date IS NULL OR start_date <= $2::date)
       ORDER BY start_date, end_date, lab_raw`,
      [from, to]
    );

    const events = result.rows.map(r => ({
      lab: r.lab_raw,
      labKey: r.lab_key,
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

  const {events, issues, skipped} = parseScheduleEvents(rows);
  if (!events.length) {
    res.status(400).json({
      error: 'No valid schedule rows found. Expected columns like Lab, Start Time, End Time, Number of Tech.',
      issues: issues.slice(0, 50),
      skipped: skipped.slice(0, 100)
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

  const {overrides, issues, skipped} = parseStdHoursOverrides(rows);
  if (!overrides.length) {
    res.status(400).json({
      error: 'No valid std-hours rows found. Expected columns like Lab and Current Std Hours.',
      issues: issues.slice(0, 50),
      skipped: skipped.slice(0, 100)
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

app.get('/api/scenarios', async (_req, res) => {
  if (!dbRequired(res)) return;
  try {
    const result = await pool.query(
      `SELECT id, name, config_json, created_at, updated_at
       FROM scenario_profiles
       ORDER BY updated_at DESC, id DESC`
    );
    const scenarios = result.rows.map(r => ({
      id: Number(r.id),
      name: r.name,
      config: normalizeScenarioConfig(r.config_json || {}),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
    res.json({scenarios});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.post('/api/scenarios', async (req, res) => {
  if (!dbRequired(res)) return;
  const id = Number.parseInt(req.body?.id, 10);
  const name = String(req.body?.name || '').trim();
  const config = normalizeScenarioConfig(req.body?.config || {});
  if (!name) {
    res.status(400).json({error: 'Scenario name is required.'});
    return;
  }

  try {
    let result;
    if (Number.isInteger(id) && id > 0) {
      result = await pool.query(
        `UPDATE scenario_profiles
         SET name = $1, config_json = $2::jsonb, updated_at = NOW()
         WHERE id = $3
         RETURNING id, name, config_json, created_at, updated_at`,
        [name, JSON.stringify(config), id]
      );
      if (!result.rows.length) {
        res.status(404).json({error: 'Scenario not found.'});
        return;
      }
    } else {
      result = await pool.query(
        `INSERT INTO scenario_profiles (name, config_json)
         VALUES ($1, $2::jsonb)
         RETURNING id, name, config_json, created_at, updated_at`,
        [name, JSON.stringify(config)]
      );
    }
    const row = result.rows[0];
    res.json({
      scenario: {
        id: Number(row.id),
        name: row.name,
        config: normalizeScenarioConfig(row.config_json || {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.delete('/api/scenarios/:id', async (req, res) => {
  if (!dbRequired(res)) return;
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({error: 'Scenario id must be a positive integer.'});
    return;
  }
  try {
    const result = await pool.query('DELETE FROM scenario_profiles WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) {
      res.status(404).json({error: 'Scenario not found.'});
      return;
    }
    res.json({ok: true});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// ─── NEW CAPACITYIQ ROUTES ──────────────────────────────────────────────────

// GET /api/std-hours/current — latest std hours per lab (one row per lab)
app.get('/api/std-hours/current', async (_req, res) => {
  if (!dbRequired(res)) return;
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (lab_key)
        lab_raw, lab_key, std_hours, effective_from::text AS effective_date
      FROM std_hours_overrides
      ORDER BY lab_key, effective_from DESC, updated_at DESC
    `);
    const dataDate = result.rows.reduce((max, r) =>
      (!max || r.effective_date > max ? r.effective_date : max), null);
    res.json({
      labs: result.rows.map(r => ({
        labKey: r.lab_key,
        labRaw: r.lab_raw,
        stdHrsPerWeek: Number(r.std_hours),
        effectiveDate: r.effective_date
      })),
      dataDate
    });
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// GET /api/lab-settings — per-lab settings keyed by lab_key
app.get('/api/lab-settings', async (_req, res) => {
  if (!dbRequired(res)) return;
  try {
    const result = await pool.query(
      `SELECT lab_key, lab_raw, system_type, group_name, productivity_pct, days_per_week
       FROM lab_settings ORDER BY lab_raw`
    );
    const settings = {};
    result.rows.forEach(r => {
      settings[r.lab_key] = {
        systemType: r.system_type,
        groupName: r.group_name,
        productivityPct: Number(r.productivity_pct),
        daysPerWeek: Number(r.days_per_week)
      };
    });
    res.json({settings});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// PUT /api/lab-settings/:key — upsert settings for one lab
app.put('/api/lab-settings/:key', async (req, res) => {
  if (!dbRequired(res)) return;
  const key = decodeURIComponent(req.params.key);
  const labRaw = String(req.body?.labRaw || '').trim();
  const sysRaw = String(req.body?.systemType || 'caltrak').toLowerCase();
  const systemType = ['caltrak', 'indysoft'].includes(sysRaw) ? sysRaw : 'caltrak';
  const groupName = req.body?.groupName ? String(req.body.groupName).trim() : null;
  const rawProd = Number(req.body?.productivityPct);
  const rawDays = Number(req.body?.daysPerWeek);
  if (!key || !labRaw) {
    res.status(400).json({error: 'labKey and labRaw are required.'});
    return;
  }
  const productivityPct = Math.min(100, Math.max(1, Number.isFinite(rawProd) ? rawProd : 70));
  const daysPerWeek = Math.min(7, Math.max(1, Number.isFinite(rawDays) ? rawDays : 5));
  try {
    await pool.query(`
      INSERT INTO lab_settings (lab_key, lab_raw, system_type, group_name, productivity_pct, days_per_week)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (lab_key) DO UPDATE
        SET lab_raw = EXCLUDED.lab_raw,
            system_type = EXCLUDED.system_type,
            group_name = EXCLUDED.group_name,
            productivity_pct = EXCLUDED.productivity_pct,
            days_per_week = EXCLUDED.days_per_week,
            updated_at = NOW()
    `, [key, labRaw, systemType, groupName, productivityPct, daysPerWeek]);
    res.json({ok: true});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// GET /api/labs/history/:key — all std-hours records for one lab (oldest first)
app.get('/api/labs/history/:key', async (req, res) => {
  if (!dbRequired(res)) return;
  const key = decodeURIComponent(req.params.key);
  try {
    const result = await pool.query(`
      SELECT effective_from::text AS date, std_hours
      FROM std_hours_overrides
      WHERE lab_key = $1
      ORDER BY effective_from ASC
    `, [key]);
    res.json({
      history: result.rows.map(r => ({date: r.date, stdHrs: Number(r.std_hours)}))
    });
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// ─── END NEW ROUTES ─────────────────────────────────────────────────────────

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
