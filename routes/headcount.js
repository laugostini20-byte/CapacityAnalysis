const express = require('express');

/**
 * Headcount routes. Mount: app.use('/api/headcount', createHeadcountRouter(ctx));
 * - GET /            list all headcount overrides
 * - POST /sync       upload + sync headcount file (multipart "file" + effectiveMonth)
 */
function createHeadcountRouter(ctx) {
  const {
    pool,
    dbRequired,
    upload,
    parseRowsFromBuffer,
    parseHeadcountOverrides,
    syncHeadcountOverrides,
    parseMonthInput
  } = ctx;
  const router = express.Router();

  router.get('/', async (_req, res) => {
    if (!dbRequired(res)) return;
    try {
      const result = await pool.query(
        `SELECT id, lab_raw, lab_key, headcount, to_char(effective_month, 'YYYY-MM') AS effective_month,
                created_at, updated_at
         FROM headcount_overrides
         ORDER BY effective_month DESC, updated_at DESC, id DESC`
      );
      const overrides = result.rows.map(r => ({
        id: Number(r.id),
        lab: r.lab_raw,
        labKey: r.lab_key,
        headcount: Number(r.headcount),
        effectiveMonth: r.effective_month,
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

    const effectiveMonth = parseMonthInput(req.body.effectiveMonth);
    if (!effectiveMonth) {
      res.status(400).json({error: 'Effective month is required in YYYY-MM format.'});
      return;
    }

    let rows;
    try {
      rows = parseRowsFromBuffer(req.file);
    } catch (err) {
      res.status(400).json({error: `Could not parse file: ${err.message}`});
      return;
    }

    const {overrides, issues, skipped} = parseHeadcountOverrides(rows);
    if (!overrides.length) {
      res.status(400).json({
        error: 'No valid headcount rows found. Expected columns like Lab and Headcount.',
        issues: issues.slice(0, 50),
        skipped: skipped.slice(0, 100)
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const summary = await syncHeadcountOverrides(
        client,
        overrides,
        req.file.originalname || 'upload',
        effectiveMonth
      );
      await client.query('COMMIT');
      res.json({
        summary,
        parsedRows: rows.length,
        validRows: overrides.length,
        effectiveMonth,
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

module.exports = createHeadcountRouter;
