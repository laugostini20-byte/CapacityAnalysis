const express = require('express');

/**
 * Health check route. Mount: app.use('/api/health', createHealthRouter(ctx));
 */
function createHealthRouter(ctx) {
  const {pool} = ctx;
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
