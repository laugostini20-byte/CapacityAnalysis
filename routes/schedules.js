const express = require('express');

/**
 * Schedules routes. Mount: app.use('/api/schedules', createSchedulesRouter(ctx));
 * - GET /            list onsite events in date range
 * - POST /sync       upload + sync schedule file (multipart "file")
 */
function createSchedulesRouter(ctx) {
  const {pool, dbRequired, upload, parseRowsFromBuffer, parseScheduleEvents, syncEvents} = ctx;
  const router = express.Router();

  router.get('/', async (req, res) => {
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

  router.post('/sync', upload.single('file'), async (req, res) => {
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

  return router;
}

module.exports = createSchedulesRouter;
