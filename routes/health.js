const express = require('express');

/**
 * Health check route.
 * Mount with: app.use('/api/health', createHealthRouter(pool));
 *
 * @param {import('pg').Pool|null} pool - Postgres pool, or null if DB not configured.
 * @returns {express.Router}
 */
function createHealthRouter(pool) {
  const router = express.Router();

  router.get('/', async (_req, res) => {
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

  return router;
}

module.exports = createHealthRouter;
