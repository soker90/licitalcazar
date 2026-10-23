#!/usr/bin/env node
/**
 * Diagnostica expedientes que tenían lotes en un snapshot anterior pero ahora
 * tienen cero filas en licitaciones_lotes y lotizado=0.
 *
 * Uso:
 *   node scripts/diagnose-lost-lotes.js --before=data/licitaciones_alcazar.before.db
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { resolveCurrentContract } = require('./restore-missing-lotes-match');

function arg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}
function openDb(file) {
  if (!file || !fs.existsSync(file)) throw new Error(`No existe la BD: ${file || '(sin ruta)'}`);
  return new DatabaseSync(file, { readOnly: true });
}
function normalizeId(value) {
  return String(value ?? '').trim().replace(/\.0$/, '');
}
function money(v) {
  return Number(Number(v || 0).toFixed(2));
}
function sum(rows, field) {
  return money(rows.reduce((s, r) => s + Number(r[field] || 0), 0));
}

function main({ beforePath = arg('before'), currentPath = arg('after') || path.resolve(__dirname, '../data/licitaciones_alcazar.db') } = {}) {
  let before;
  let current;

  try {
    before = openDb(beforePath);
    current = openDb(currentPath);

    const oldLots = before.prepare(`
      SELECT *
      FROM contract_lots
      ORDER BY contract_id, lot_number
    `).all();

    const oldByParent = new Map();
    for (const lot of oldLots) {
      const key = normalizeId(lot.contract_id);
      const list = oldByParent.get(key) || [];
      list.push(lot);
      oldByParent.set(key, list);
    }

    const beforeContracts = before.prepare('SELECT id, case_number FROM contracts').all();
    const beforeById = new Map(beforeContracts.map(r => [normalizeId(r.id), r]));

    const currentContracts = current.prepare(`
      SELECT id, case_number AS expediente, is_lotized AS lotizado, lot_count AS num_lotes, lots_source AS lotes_origen,
             amount_excl_vat AS importe_sin_iva, awarded_amount AS importe_adjudicacion, awarded_amount_incl_vat AS importe_adj_con_iva,
             awardee AS awardee, awardee_nif AS nif_awardee, procedure AS procedimiento, contract_type AS tipo_contrato,
             economic_nature AS naturaleza_economica
      FROM contracts
    `).all();
    const byId = new Map(currentContracts.map(r => [normalizeId(r.id), r]));
    const byExpediente = new Map();
    for (const r of currentContracts) {
      const key = normalizeId(r.expediente);
      if (key) byExpediente.set(key, r);
    }

    const currentLotCounts = new Map(
      current.prepare('SELECT contract_id, count(*) total FROM contract_lots GROUP BY contract_id')
        .all().map(r => [normalizeId(r.contract_id), Number(r.total)])
    );

    const candidates = [];
    for (const [oldId, lots] of oldByParent) {
      if ((currentLotCounts.get(oldId) || 0) !== 0) continue;
      const c = resolveCurrentContract(beforeById.get(oldId), { byId, byExpediente }, oldId);
      if (!c || Number(c.lotizado) !== 0) continue;

      candidates.push({
        id: c.id,
        expediente: c.expediente,
        oldLotCount: lots.length,
        oldPbl: sum(lots, 'budget_excl_vat'),
        oldAward: sum(lots, 'awarded_amount'),
        oldLotIds: lots.map(r => r.id),
        oldLotNumbers: lots.map(r => r.lot_number),
        oldLotStates: [...new Set(lots.map(r => r.lot_status).filter(Boolean))],
        oldLotAwardees: [...new Set(lots.map(r => r.awardee).filter(Boolean))],
        current: {
          lotizado: c.lotizado,
          num_lotes: c.num_lotes,
          lotes_origen: c.lotes_origen,
          pbl: money(c.importe_sin_iva),
          award: money(c.importe_adjudicacion),
          awardIva: money(c.importe_adj_con_iva),
          awardee: c.awardee,
          nif: c.nif_awardee,
          procedimiento: c.procedimiento,
          tipo: c.tipo_contrato,
          naturaleza: c.naturaleza_economica,
        },
        deltas: {
          oldLotsAwardVsCurrentAward: money(sum(lots, 'awarded_amount') - Number(c.importe_adjudicacion || 0)),
          oldLotsPblVsCurrentPbl: money(sum(lots, 'budget_excl_vat') - Number(c.importe_sin_iva || 0)),
        }
      });
    }

    candidates.sort((a, b) => Math.abs(b.deltas.oldLotsAwardVsCurrentAward) - Math.abs(a.deltas.oldLotsAwardVsCurrentAward));

    console.log(`Expedientes con lotes antes y 0 lotes ahora + lotizado=0: ${candidates.length}`);
    console.log(JSON.stringify(candidates, null, 2));
    return candidates;
  } finally {
    current?.close();
    before?.close();
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main, openDb, normalizeId, money, sum };
