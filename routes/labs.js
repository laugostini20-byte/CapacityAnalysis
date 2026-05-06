const express = require('express');

/**
 * Labs routes. Mount: app.use('/api/labs', createLabsRouter(ctx));
 * - GET /history/:key   all std-hours records for one lab (oldest first)
 */
function createLabsRouter(ctx) {
  const {pool, dbRequired} = ctx;
  const router = express.Router();

  router.get('/history/:key', async (req, res) => {
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

  return router;
}

module.exports = createLabsRouter;
