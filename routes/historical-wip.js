const express = require('express');

/**
 * Historical-WIP route. Mount: app.use('/api/historical-wip', createHistoricalWipRouter(ctx));
 * Returns the precomputed historical WIP series loaded from the xlsx at startup.
 */
function createHistoricalWipRouter(ctx) {
  const {HISTORICAL_WIP} = ctx;
  const router = express.Router();

  router.get('/', (_req, res) => {
    res.json(HISTORICAL_WIP);
  });

  return router;
}

module.exports = createHistoricalWipRouter;
