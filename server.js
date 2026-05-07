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
const HISTORICAL_WIP_XLSX_PATH = path.join(__dirname, 'historical wip caltrak labs.xlsx');
const HISTORICAL_WIP_CATEGORY = 'Workable WIP Std. Hrs.';

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
      for (let i = 1; i <= 10; i++) {
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

function excelDateToISO(v) {
  if (typeof v === 'number') {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  if (v instanceof Date && !Number.isNaN(v.valueOf())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  return null;
}

function loadHistoricalWipFromWorkbook(xlsxPath) {
  const fallback = {
    source: path.basename(xlsxPath),
    category: HISTORICAL_WIP_CATEGORY,
    dailyByDate: {},
    range: {start: null, end: null},
    labs: [],
    loaded: false,
    message: 'Historical WIP workbook not found'
  };

  if (!fs.existsSync(xlsxPath)) return fallback;

  try {
    const wb = XLSX.readFile(xlsxPath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, {header: 1, defval: null});
    if (!rows.length) return fallback;

    const header = rows[0] || [];
    const dateCols = [];
    for (let c = 3; c < header.length; c++) {
      const iso = excelDateToISO(header[c]);
      if (iso) dateCols.push({idx: c, date: iso});
    }

    const dailyByDate = {};
    const labSet = new Set();
    for (const dc of dateCols) dailyByDate[dc.date] = {};

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const category = String(row[2] || '').trim();
      if (category !== HISTORICAL_WIP_CATEGORY) continue;

      const labRaw = String(row[1] || '').trim();
      if (!labRaw) continue;
      const labNormalized = normalizeLabKey(labRaw);
      labSet.add(labRaw);

      for (const dc of dateCols) {
        const v = row[dc.idx];
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        dailyByDate[dc.date][labNormalized] = Number(v);
      }
    }

    const dates = Object.keys(dailyByDate).sort();
    return {
      source: path.basename(xlsxPath),
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
      message: `Failed to parse workbook: ${err.message}`
    };
  }
}

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
      // Only surface labs that exist in the canonical mapping. Std-hours
      // uploads accept "unmapped" labs with a warning (so the user gets
      // their data persisted without engineering intervention), but those
      // labs shouldn't appear in the Historical WIP review or in the
      // PY As-Of consumers downstream — they're not labs the tool tracks.
      const canonicalLabName = LAB_MAPPING.canonicalLabByKey[row.lab_key];
      if (!canonicalLabName) continue;

      const date = row.entry_date;
      if (!dailyByDate[date]) dailyByDate[date] = {};
      dailyByDate[date][row.lab_key] = Number(row.std_hrs);
      labSet.add(canonicalLabName);
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

const HISTORICAL_WIP = loadHistoricalWipFromWorkbook(HISTORICAL_WIP_XLSX_PATH);

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

function parseMonthInput(v) {
  const s = String(v || '').trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return null;
  const [y, m] = s.split('-').map(n => parseInt(n, 10));
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;
  return `${y}-${String(m).padStart(2, '0')}`;
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
      'Standard Hrs',
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

function parseHeadcountOverrides(rows) {
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
    const countRaw = getRowValueByHeaders(row, [
      'Headcount',
      'Techs',
      'Technicians',
      'Tech Count',
      'Total Techs'
    ]);

    const labRaw = String(labRawVal || '').trim();
    const headcount = parseHoursValue(countRaw);
    if (!labRaw || headcount == null || headcount < 0) {
      issues.push(`Row ${rowNumber} skipped due to missing/invalid Lab or Headcount`);
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

    deduped.set(labKey, {rowNumber, labRaw, labKey, headcount, matchType: match.matchType});
  });

  return {overrides: [...deduped.values()], issues, skipped};
}

// Parses an xlsx loaded as raw rows into historical WIP overrides.
// Auto-detects two formats:
//
//   "Simple" format (employee-native, file headed "Lab Name" + date columns):
//     col 0   = lab name
//     cols 1+ = daily WIP values, header row holds the dates
//
//   "Multi-category" format (legacy, matches loadHistoricalWipFromWorkbook):
//     col 0   = anything (often blank or row index)
//     col 1   = lab name
//     col 2   = category — only rows where category === "Workable WIP Std. Hrs."
//               are imported; all other categories are silently ignored
//     cols 3+ = daily WIP values, header row holds the dates
//
// Detection rule: if header[1] decodes to a valid date, it's the simple format;
// otherwise it's the multi-category format.
//
// Returns {overrides, issues, skipped}.
function parseHistoricalWipRows(workbookBuffer) {
  const overrides = [];
  const issues = [];
  const skipped = [];

  let wb;
  try {
    wb = XLSX.read(workbookBuffer, {type: 'buffer'});
  } catch (err) {
    issues.push(`Could not parse workbook: ${err.message}`);
    return {overrides, issues, skipped};
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) {
    issues.push('Workbook has no sheets');
    return {overrides, issues, skipped};
  }
  const rows = XLSX.utils.sheet_to_json(ws, {header: 1, defval: null});
  if (!rows.length) {
    issues.push('Workbook is empty');
    return {overrides, issues, skipped};
  }

  const header = rows[0] || [];
  const isSimpleFormat = excelDateToISO(header[1]) !== null;
  const labCol = isSimpleFormat ? 0 : 1;
  const dateColStart = isSimpleFormat ? 1 : 3;

  const dateCols = [];
  for (let c = dateColStart; c < header.length; c++) {
    const iso = excelDateToISO(header[c]);
    if (iso) dateCols.push({idx: c, date: iso});
  }
  if (!dateCols.length) {
    issues.push(
      isSimpleFormat
        ? 'No date columns found in header (expected dates in columns 1+)'
        : 'No date columns found in header (expected dates in columns 3+)'
    );
    return {overrides, issues, skipped};
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];

    // Multi-category format filters by category column; simple format treats
    // every row as a WIP row.
    if (!isSimpleFormat) {
      const category = String(row[2] || '').trim();
      if (category !== HISTORICAL_WIP_CATEGORY) continue;
    }

    const labRaw = String(row[labCol] || '').trim();
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

    // Store the canonical lab name (from the mapping CSV), not whatever the
    // uploaded file used. This keeps the labs list deduplicated even when
    // different upload sources use different naming conventions for the same
    // lab (e.g. "Houston" vs "Houston - 5").
    const canonicalLabRaw = LAB_MAPPING.canonicalLabByKey[canonicalKey];

    for (const dc of dateCols) {
      const v = row[dc.idx];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
      overrides.push({
        labRaw: canonicalLabRaw,
        labKey: canonicalKey,
        entryDate: dc.date,
        stdHrs: Number(v)
      });
    }
  }

  return {overrides, issues, skipped};
}

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

// Cascades a successful std-hours upload into the historical_wip table.
// For each std-hours override (lab + value), writes a corresponding row to
// historical_wip keyed on the std-hours upload's effectiveFrom date. Same
// idempotent merge logic as syncHistoricalWipOverrides.
//
// This means a daily/weekly std-hours upload also keeps the Historical WIP
// review page current, so the user doesn't have to maintain two parallel
// upload workflows.
//
// Returns {inserted, updated, unchanged, entryDate}.
async function cascadeStdHoursToHistoricalWip(client, stdHoursOverrides, effectiveFrom, sourceFilename) {
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const o of stdHoursOverrides) {
    const labKey = o.labKey;
    const stdHrs = Number(o.stdHours);
    if (!labKey || !Number.isFinite(stdHrs) || stdHrs < 0) continue;
    // Only cascade labs that are actually in the canonical mapping. The
    // std-hours parser is lenient and will accept unmapped labs with a
    // warning, but Historical WIP should only contain labs the tool tracks.
    const canonicalLabRaw = LAB_MAPPING.canonicalLabByKey[labKey];
    if (!canonicalLabRaw) continue;

    const existing = await client.query(
      `SELECT std_hrs FROM historical_wip WHERE lab_key = $1 AND entry_date = $2`,
      [labKey, effectiveFrom]
    );
    if (!existing.rows.length) {
      await client.query(
        `INSERT INTO historical_wip (lab_raw, lab_key, entry_date, std_hrs, source_filename)
         VALUES ($1, $2, $3, $4, $5)`,
        [canonicalLabRaw, labKey, effectiveFrom, stdHrs, sourceFilename]
      );
      inserted++;
    } else if (Number(existing.rows[0].std_hrs) !== stdHrs) {
      await client.query(
        `UPDATE historical_wip
         SET std_hrs = $1, source_filename = $2, lab_raw = $3, updated_at = NOW()
         WHERE lab_key = $4 AND entry_date = $5`,
        [stdHrs, sourceFilename, canonicalLabRaw, labKey, effectiveFrom]
      );
      updated++;
    } else {
      unchanged++;
    }
  }

  return {inserted, updated, unchanged, entryDate: effectiveFrom};
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

function isHeadcountDifferent(a, b) {
  return Math.abs(Number(a) - Number(b)) > 1e-9;
}

async function syncHeadcountOverrides(client, overrides, filename, effectiveMonth) {
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const details = {inserted: [], updated: [], unchanged: []};

  for (const row of overrides) {
    const existingRes = await client.query(
      `SELECT id, lab_raw, headcount
       FROM headcount_overrides
       WHERE lab_key = $1
         AND effective_month = $2::date
       LIMIT 1`,
      [row.labKey, `${effectiveMonth}-01`]
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      await client.query(
        `INSERT INTO headcount_overrides
          (lab_raw, lab_key, headcount, effective_month, source_filename)
         VALUES ($1, $2, $3, $4::date, $5)`,
        [row.labRaw, row.labKey, row.headcount, `${effectiveMonth}-01`, filename]
      );
      inserted++;
      details.inserted.push({
        rowNumber: row.rowNumber,
        labRaw: row.labRaw,
        labKey: row.labKey,
        matchType: row.matchType,
        headcount: Number(row.headcount),
        effectiveMonth
      });
      continue;
    }

    const changed = existing.lab_raw !== row.labRaw || isHeadcountDifferent(existing.headcount, row.headcount);
    if (!changed) {
      unchanged++;
      details.unchanged.push({
        rowNumber: row.rowNumber,
        labRaw: row.labRaw,
        labKey: row.labKey,
        matchType: row.matchType,
        headcount: Number(row.headcount),
        effectiveMonth
      });
      continue;
    }

    await client.query(
      `UPDATE headcount_overrides
       SET lab_raw = $1, headcount = $2, source_filename = $3, updated_at = NOW()
       WHERE id = $4`,
      [row.labRaw, row.headcount, filename, existing.id]
    );
    updated++;
    details.updated.push({
      rowNumber: row.rowNumber,
      labRaw: row.labRaw,
      labKey: row.labKey,
      matchType: row.matchType,
      previousHeadcount: Number(existing.headcount),
      headcount: Number(row.headcount),
      effectiveMonth
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
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  next();
});
app.use(express.static(__dirname));

// Shared context bundled for route modules
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
  cascadeStdHoursToHistoricalWip,
  mapToCanonicalLabKey,
  parseRowsFromBuffer,
  parseScheduleEvents,
  parseStdHoursOverrides,
  parseHeadcountOverrides,
  syncEvents,
  syncStdHoursOverrides,
  syncHeadcountOverrides,
  parseISODateInput,
  parseMonthInput,
  normalizeScenarioConfig
};

app.use('/api/health', require('./routes/health')(ctx));
app.use('/api/lab-mapping', require('./routes/lab-mapping')(ctx));
app.use('/api/historical-wip', require('./routes/historical-wip')(ctx));
app.use('/api/schedules', require('./routes/schedules')(ctx));
app.use('/api/std-hours', require('./routes/std-hours')(ctx));
app.use('/api/headcount', require('./routes/headcount')(ctx));
app.use('/api/scenarios', require('./routes/scenarios')(ctx));
app.use('/api/lab-settings', require('./routes/lab-settings')(ctx));
app.use('/api/labs', require('./routes/labs')(ctx));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

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

start().catch(err => {
  // eslint-disable-next-line no-console
  console.error('Startup failed:', err);
  process.exit(1);
});
