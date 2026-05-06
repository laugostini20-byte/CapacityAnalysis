const express = require('express');
const path = require('path');

/**
 * Lab-mapping route. Mount: app.use('/api/lab-mapping', createLabMappingRouter(ctx));
 * Returns the active labs and the alias->canonical map loaded from CSV.
 */
function createLabMappingRouter(ctx) {
  const {LAB_MAPPING, LAB_MAPPING_CSV_PATH} = ctx;
  const router = express.Router();

  router.get('/', (_req, res) => {
    const activeLabs = LAB_MAPPING.activeCanonicalKeys.map((labKey) => ({
      labKey,
      canonicalLab: LAB_MAPPING.canonicalLabByKey[labKey] || labKey,
      system: LAB_MAPPING.systemByCanonicalKey[labKey] || null,
      status: 'active'
    }));

    res.json({
      source: path.basename(LAB_MAPPING_CSV_PATH),
      activeLabs,
      aliasToCanonicalKey: LAB_MAPPING.aliasToCanonicalKey,
      canonicalLabByKey: LAB_MAPPING.canonicalLabByKey,
      systemByCanonicalKey: LAB_MAPPING.systemByCanonicalKey,
      isActiveByCanonicalKey: LAB_MAPPING.isActiveByCanonicalKey
    });
  });

  return router;
}

module.exports = createLabMappingRouter;
