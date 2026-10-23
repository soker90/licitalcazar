#!/usr/bin/env node
/**
 * Semantic comparison of derived audit alerts between two SQLite snapshots.
 *
 * Alerts are matched by type plus the set of linked contracts' logical identities
 * (case number + contracting authority), so internal contract IDs may change between
 * snapshots without creating false additions/removals.
 *
 * Usage:
 *   node scripts/compare-derived-alerts.js --reference=/path/ref.db --rebuild=/path/rebuild.db
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const { normalizeIdentityPart } = require('./contract-identity');

function arg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((a) => a.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}

function openDb(file) {
  if (!file || !fs.existsSync(file)) throw new Error(`No existe la BD: ${file || '(sin ruta)'}`);
  return new DatabaseSync(file, { readOnly: true });
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]));
  }
  return value;
}

function alertRecords(db) {
  const alerts = db.prepare(`
    SELECT id, category AS categoria, type AS tipo, severity AS severidad, level AS nivel, scale_score AS score_escala, confidence AS confianza, title AS titulo,
           description AS descripcion, target_data AS dato_objetivo, source AS fuente, source_url AS url_fuente, extracted_at AS fecha_extraccion,
           applied_rule AS regla_aplicada, methodology_version AS version_metodologia, limitations AS limitaciones, alternative_explanation AS explicacion_alternativa,
           requires_human_review AS requiere_revision_humana, evidence AS evidencia, factors_json, continuity_pattern AS patron_continuidad,
           explanations_json, documents_json, created_at AS fecha_creacion
    FROM alerts
  `).all();

  const links = db.prepare(`
    SELECT ac.alert_id AS alerta_id, ac.contract_id AS contrato_id,
           c.case_number AS expediente, c.contracting_authority_id AS authority_id
    FROM alert_contracts ac
    LEFT JOIN contracts c ON c.id = ac.contract_id
    ORDER BY alerta_id, contrato_id
  `).all();

  const byAlert = new Map();
  for (const row of links) {
    const list = byAlert.get(row.alerta_id) || [];
    const expediente = normalizeIdentityPart(row.expediente);
    const authorityId = normalizeIdentityPart(row.authority_id);
    const identity = expediente && authorityId
      ? JSON.stringify([expediente, authorityId])
      : `id:${row.contrato_id}`;
    list.push({ id: row.contrato_id, identity });
    byAlert.set(row.alerta_id, list);
  }

  return alerts.map((a) => {
    const alertLinks = byAlert.get(a.id) || [];
    const contratoIds = [...new Set(alertLinks.map((link) => link.id))].sort();
    const contractIdentities = [...new Set(alertLinks.map((link) => link.identity))].sort();
    const key = JSON.stringify([a.tipo, contractIdentities]);

    const payload = { ...a };
    delete payload.id;
    delete payload.fecha_creacion;
    delete payload.fecha_extraccion;

    for (const field of ['factores_json', 'explicaciones_json', 'documentos_json']) {
      try {
        payload[field] = stable(JSON.parse(payload[field] || 'null'));
      } catch {
        payload[field] = payload[field];
      }
    }

    return { key, id: a.id, contratoIds, payload };
  });
}

function index(records, label) {
  const map = new Map();
  const duplicates = [];
  for (const r of records) {
    if (map.has(r.key)) duplicates.push(r.key);
    map.set(r.key, r);
  }
  if (duplicates.length) {
    console.warn(`WARN: ${label} contiene claves semánticas duplicadas: ${duplicates.length}`);
  }
  return { map, duplicates };
}

function diffPayload(a, b) {
  const fields = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const diff = {};
  for (const field of fields) {
    const av = JSON.stringify(stable(a?.[field]));
    const bv = JSON.stringify(stable(b?.[field]));
    if (av !== bv) diff[field] = { reference: a?.[field], rebuild: b?.[field] };
  }
  return diff;
}

function main() {
  const referencePath = arg('reference');
  const rebuildPath = arg('rebuild');
  if (!referencePath || !rebuildPath) {
    console.error('Uso: node scripts/compare-derived-alerts.js --reference=/ruta/ref.db --rebuild=/ruta/rebuild.db');
    process.exitCode = 2;
    return;
  }

  let reference;
  let rebuild;
  try {
    reference = openDb(referencePath);
    rebuild = openDb(rebuildPath);
    const refRecords = alertRecords(reference);
    const rebuildRecords = alertRecords(rebuild);
    const ref = index(refRecords, 'reference');
    const reb = index(rebuildRecords, 'rebuild');

    const onlyReference = [...ref.map.keys()].filter((k) => !reb.map.has(k));
    const onlyRebuild = [...reb.map.keys()].filter((k) => !ref.map.has(k));
    const common = [...ref.map.keys()].filter((k) => reb.map.has(k));

    const payloadDifferences = common
      .map((key) => ({ key, idReference: ref.map.get(key).id, idRebuild: reb.map.get(key).id, fields: diffPayload(ref.map.get(key).payload, reb.map.get(key).payload) }))
      .filter((x) => Object.keys(x.fields).length > 0);

    function counts(records) {
      const out = {};
      for (const r of records) out[r.payload.tipo] = (out[r.payload.tipo] || 0) + 1;
      return out;
    }

    const result = {
      reference: { total: refRecords.length, byType: counts(refRecords), duplicateSemanticKeys: ref.duplicates.length },
      rebuild: { total: rebuildRecords.length, byType: counts(rebuildRecords), duplicateSemanticKeys: reb.duplicates.length },
      semanticIdentity: {
        onlyReference: onlyReference.length,
        onlyRebuild: onlyRebuild.length,
        common: common.length,
      },
      payloadDifferences: payloadDifferences.length,
      samples: {
        onlyReference: onlyReference.slice(0, 20).map((key) => ({ key, id: ref.map.get(key).id, contratos: ref.map.get(key).contratoIds })),
        onlyRebuild: onlyRebuild.slice(0, 20).map((key) => ({ key, id: reb.map.get(key).id, contratos: reb.map.get(key).contratoIds })),
        payloadDifferences: payloadDifferences.slice(0, 20),
      },
    };

    console.log(JSON.stringify(result, null, 2));

    if (onlyReference.length || onlyRebuild.length || payloadDifferences.length || ref.duplicates.length || reb.duplicates.length) {
      process.exitCode = 1;
    }
  } finally {
    reference?.close();
    rebuild?.close();
  }
}

if (require.main === module) main();

module.exports = { alertRecords, index, diffPayload, stable };
