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

  return router;
}

module.exports = createHistoricalWipRouter;
