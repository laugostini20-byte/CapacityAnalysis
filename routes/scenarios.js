const express = require('express');

/**
 * Scenarios routes. Mount: app.use('/api/scenarios', createScenariosRouter(ctx));
 * - GET /            list all saved scenarios
 * - POST /           upsert a scenario (id present = update, else insert)
 * - DELETE /:id      delete by id
 */
function createScenariosRouter(ctx) {
  const {pool, dbRequired, normalizeScenarioConfig} = ctx;
  const router = express.Router();

  router.get('/', async (_req, res) => {
    if (!dbRequired(res)) return;
    try {
      const result = await pool.query(
        `SELECT id, name, config_json, created_at, updated_at
         FROM scenario_profiles
         ORDER BY updated_at DESC, id DESC`
      );
      const scenarios = result.rows.map(r => ({
        id: Number(r.id),
        name: r.name,
        config: normalizeScenarioConfig(r.config_json || {}),
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }));
      res.json({scenarios});
    } catch (err) {
      res.status(500).json({error: err.message});
    }
  });

  router.post('/', async (req, res) => {
    if (!dbRequired(res)) return;
    const id = Number.parseInt(req.body?.id, 10);
    const name = String(req.body?.name || '').trim();
    const config = normalizeScenarioConfig(req.body?.config || {});
    if (!name) {
      res.status(400).json({error: 'Scenario name is required.'});
      return;
    }

    try {
      let result;
      if (Number.isInteger(id) && id > 0) {
        result = await pool.query(
          `UPDATE scenario_profiles
           SET name = $1, config_json = $2::jsonb, updated_at = NOW()
           WHERE id = $3
           RETURNING id, name, config_json, created_at, updated_at`,
          [name, JSON.stringify(config), id]
        );
        if (!result.rows.length) {
          res.status(404).json({error: 'Scenario not found.'});
          return;
        }
      } else {
        result = await pool.query(
          `INSERT INTO scenario_profiles (name, config_json)
           VALUES ($1, $2::jsonb)
           RETURNING id, name, config_json, created_at, updated_at`,
          [name, JSON.stringify(config)]
        );
      }
      const row = result.rows[0];
      res.json({
        scenario: {
          id: Number(row.id),
          name: row.name,
          config: normalizeScenarioConfig(row.config_json || {}),
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }
      });
    } catch (err) {
      res.status(500).json({error: err.message});
    }
  });

  router.delete('/:id', async (req, res) => {
    if (!dbRequired(res)) return;
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({error: 'Scenario id must be a positive integer.'});
      return;
    }
    try {
      const result = await pool.query('DELETE FROM scenario_profiles WHERE id = $1 RETURNING id', [id]);
      if (!result.rows.length) {
        res.status(404).json({error: 'Scenario not found.'});
        return;
      }
      res.json({ok: true});
    } catch (err) {
      res.status(500).json({error: err.message});
    }
  });

  return router;
}

module.exports = createScenariosRouter;
