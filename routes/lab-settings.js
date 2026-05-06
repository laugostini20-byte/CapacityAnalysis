const express = require('express');

/**
 * Lab-settings routes. Mount: app.use('/api/lab-settings', createLabSettingsRouter(ctx));
 * - GET /            return per-lab settings keyed by lab_key
 * - PUT /:key        upsert settings for one lab
 */
function createLabSettingsRouter(ctx) {
  const {pool, dbRequired} = ctx;
  const router = express.Router();

  router.get('/', async (_req, res) => {
    if (!dbRequired(res)) return;
    try {
      const result = await pool.query(
        `SELECT lab_key, lab_raw, system_type, group_name, productivity_pct, days_per_week
         FROM lab_settings ORDER BY lab_raw`
      );
      const settings = {};
      result.rows.forEach(r => {
        settings[r.lab_key] = {
          systemType: r.system_type,
          groupName: r.group_name,
          productivityPct: Number(r.productivity_pct),
          daysPerWeek: Number(r.days_per_week)
        };
      });
      res.json({settings});
    } catch (err) {
      res.status(500).json({error: err.message});
    }
  });

  router.put('/:key', async (req, res) => {
    if (!dbRequired(res)) return;
    const key = decodeURIComponent(req.params.key);
    const labRaw = String(req.body?.labRaw || '').trim();
    const sysRaw = String(req.body?.systemType || 'caltrak').toLowerCase();
    const systemType = ['caltrak', 'indysoft'].includes(sysRaw) ? sysRaw : 'caltrak';
    const groupName = req.body?.groupName ? String(req.body.groupName).trim() : null;
    const rawProd = Number(req.body?.productivityPct);
    const rawDays = Number(req.body?.daysPerWeek);
    if (!key || !labRaw) {
      res.status(400).json({error: 'labKey and labRaw are required.'});
      return;
    }
    const productivityPct = Math.min(100, Math.max(1, Number.isFinite(rawProd) ? rawProd : 70));
    const daysPerWeek = Math.min(7, Math.max(1, Number.isFinite(rawDays) ? rawDays : 5));
    try {
      await pool.query(`
        INSERT INTO lab_settings (lab_key, lab_raw, system_type, group_name, productivity_pct, days_per_week)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (lab_key) DO UPDATE
          SET lab_raw = EXCLUDED.lab_raw,
              system_type = EXCLUDED.system_type,
              group_name = EXCLUDED.group_name,
              productivity_pct = EXCLUDED.productivity_pct,
              days_per_week = EXCLUDED.days_per_week,
              updated_at = NOW()
      `, [key, labRaw, systemType, groupName, productivityPct, daysPerWeek]);
      res.json({ok: true});
    } catch (err) {
      res.status(500).json({error: err.message});
    }
  });

  return router;
}

module.exports = createLabSettingsRouter;
