const express = require('express');

/**
 * Std-hours routes. Mount: app.use('/api/std-hours', createStdHoursRouter(ctx));
 * - GET /            list all overrides
 * - POST /sync       upload + sync std-hours file (multipart "file" + effectiveFrom/effectiveTo)
 * - GET /current     latest std hours per canonical lab (one row per lab)
 */
function createStdHoursRouter(ctx) {
  const {
    pool,
    dbRequired,
    upload,
    parseRowsFromBuffer,
    parseStdHoursOverrides,
    syncStdHoursOverrides,
    parseISODateInput,
    mapToCanonicalLabKey
  } = ctx;
  const router = express.Router();

  router.get('/', async (_req, res) => {
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

  router.post('/sync', upload.single('file'), async (req, res) => {
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

  router.get('/current', async (_req, res) => {
    if (!dbRequired(res)) return;
    try {
      const result = await pool.query(`
        SELECT DISTINCT ON (lab_key)
          lab_raw, lab_key, std_hours, effective_from::text AS effective_date
        FROM std_hours_overrides
        ORDER BY lab_key, effective_from DESC, updated_at DESC
      `);
      // Resolve to canonical keys and keep only the latest per canonical key
      const canonicalMap = {};
      result.rows.forEach(r => {
        const canonical = mapToCanonicalLabKey(r.lab_key);
        const existing = canonicalMap[canonical];
        if (!existing || r.effective_date > existing.effective_date) {
          canonicalMap[canonical] = r;
        }
      });
      const resolved = Object.values(canonicalMap);
      const dataDate = resolved.reduce((max, r) =>
        (!max || r.effective_date > max ? r.effective_date : max), null);
      res.json({
        labs: resolved.map(r => ({
          labKey: mapToCanonicalLabKey(r.lab_key),
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

  return router;
}

module.exports = createStdHoursRouter;
