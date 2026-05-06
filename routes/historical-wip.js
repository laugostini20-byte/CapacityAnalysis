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

  return router;
}

module.exports = createHistoricalWipRouter;
