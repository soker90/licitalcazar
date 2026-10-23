#!/usr/bin/env node
/**
 * Auditoría no destructiva de lotes/resultados actuales.
 *
 * Distingue:
 * - CODICE_PROJECT_LOT: lotes estructurales; se valida suma contra cabecera.
 * - CODICE_TENDER_RESULT(S): resultados TenderResult; no se interpretan
 *   automáticamente como lotes independientes cuando la cabecera indica un
 *   único lote/contrato.
 *
 * Uso:
 *   node scripts/audit-lotes-actuales.js
 *   node scripts/audit-lotes-actuales.js --db=/ruta/db
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { validateLotConsistency, roundMoney } = require('./lotes-consistency');

const dbPath = process.argv.find(a => a.startsWith('--db='))?.slice(5)
  || path.resolve(__dirname, '../data/licitaciones_alcazar.db');

if (!fs.existsSync(dbPath)) throw new Error(`No existe la BD: ${dbPath}`);
const db = new DatabaseSync(dbPath, { readOnly: true });

const parents = db.prepare(`
  SELECT id, case_number AS expediente, amount_excl_vat AS importe_sin_iva, awarded_amount AS importe_adjudicacion,
         is_lotized AS lotizado, lot_count AS num_lotes, lots_source AS lotes_origen
  FROM contracts
  WHERE lotizado = 1
  ORDER BY id
`).all();

const summary = {
  totalLotizedParents: parents.length,
  projectLotParents: 0,
  tenderResultParents: 0,
  otherOriginParents: 0,
  parentsWithoutRows: 0,
  structuralParentsWithIssues: 0,
  tenderSingleContractParents: 0,
  tenderMultiLotCandidates: 0,
  tenderResultSequenceCandidates: 0,
  duplicateLotNumbers: 0,
};

const structuralIssues = [];
const tenderResultCandidates = [];
const duplicateLotNumbers = [];

function cleanNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? roundMoney(n) : null;
}

for (const parent of parents) {
  const lots = db.prepare(`
    SELECT id, lot_number AS numero_lote, budget_excl_vat AS presupuesto_sin_iva, budget_incl_vat AS presupuesto_con_iva,
           awarded_amount, awarded_amount_incl_vat AS importe_adj_con_iva, lot_status AS estado_lote,
           awardee AS adjudicatario, awardee_nif AS nif_adjudicatario, offer_count AS num_ofertas, award_date AS fecha_adjudicacion,
           lot_name AS nombre_lote
    FROM contract_lots
    WHERE contract_id = ?
    ORDER BY lot_number, id
  `).all(parent.id);

  if (!lots.length) {
    summary.parentsWithoutRows++;
    structuralIssues.push({
      code: 'LOTIZED_PARENT_WITHOUT_LOTS',
      id: parent.id,
      expediente: parent.expediente,
      numLotes: parent.num_lotes,
      lotesOrigen: parent.lotes_origen,
    });
    continue;
  }

  const origin = String(parent.lotes_origen || '');
  const isProjectLot = origin === 'CODICE_PROJECT_LOT';
  const isTenderResult = origin === 'CODICE_TENDER_RESULT' || origin === 'CODICE_TENDER_RESULTS';

  if (isProjectLot) {
    summary.projectLotParents++;
    const result = validateLotConsistency(parent, lots.map(l => ({
      numeroLote: l.numero_lote,
      presupuestoSinIva: l.presupuesto_sin_iva,
      importeAdjudicacion: l.importe_adjudicacion,
      estadoLote: l.estado_lote,
    })));

    const seen = new Map();
    for (const lot of lots) {
      const key = String(lot.numero_lote ?? '').trim().toLowerCase();
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(lot);
    }

    for (const [numero, rows] of seen) {
      if (rows.length > 1) {
        summary.duplicateLotNumbers++;
        duplicateLotNumbers.push({
          id: parent.id,
          expediente: parent.expediente,
          numeroLote: numero,
          rowIds: rows.map(r => r.id),
        });
      }
    }

    if (!result.ok || [...seen.values()].some(rows => rows.length > 1)) {
      summary.structuralParentsWithIssues++;
      structuralIssues.push(...result.issues.map(issue => ({
        ...issue,
        id: parent.id,
        expediente: parent.expediente,
        lotCount: lots.length,
        parentNumLotes: parent.num_lotes,
        lotesOrigen: origin,
      })));
    }
    continue;
  }

  if (isTenderResult) {
    summary.tenderResultParents++;

    const parentAward = cleanNumber(parent.importe_adjudicacion);
    const lotAwards = lots
      .map(l => cleanNumber(l.importe_adjudicacion))
      .filter(v => v != null && v >= 0);
    const lotAwardSum = roundMoney(lotAwards.reduce((a, b) => a + b, 0));
    const ratio = parentAward > 0 ? roundMoney(lotAwardSum / parentAward) : null;

    const distinctAwardees = new Set(
      lots.map(l => String(l.adjudicatario || '').trim()).filter(Boolean)
    );
    const distinctAmounts = new Set(lotAwards);

    if (Number(parent.num_lotes) === 1 && lots.length > 1) {
      summary.tenderSingleContractParents++;
      summary.tenderResultSequenceCandidates++;
      tenderResultCandidates.push({
        code: 'TENDER_RESULTS_FOR_SINGLE_CONTRACT',
        id: parent.id,
        expediente: parent.expediente,
        parentNumLotes: Number(parent.num_lotes),
        rowCount: lots.length,
        parentAward,
        lotAwardSum,
        ratio,
        distinctAwardees: distinctAwardees.size,
        distinctAmounts: distinctAmounts.size,
        rows: lots.map(l => ({
          id: l.id,
          numeroLote: l.numero_lote,
          award: cleanNumber(l.importe_adjudicacion),
          awardee: l.adjudicatario,
          resultDate: l.fecha_adjudicacion,
          state: l.estado_lote,
        })),
      });
      continue;
    }

    if (Number(parent.num_lotes) === lots.length && lots.length > 1) {
      summary.tenderMultiLotCandidates++;
      continue;
    }

    tenderResultCandidates.push({
      code: 'TENDER_RESULT_COUNT_MISMATCH',
      id: parent.id,
      expediente: parent.expediente,
      parentNumLotes: Number(parent.num_lotes),
      rowCount: lots.length,
      parentAward,
      lotAwardSum,
      ratio,
      distinctAwardees: distinctAwardees.size,
      distinctAmounts: distinctAmounts.size,
    });
    continue;
  }

  summary.otherOriginParents++;
  structuralIssues.push({
    code: 'UNKNOWN_LOT_ORIGIN',
    id: parent.id,
    expediente: parent.expediente,
    numLotes: parent.num_lotes,
    rowCount: lots.length,
    lotesOrigen: origin || null,
  });
}

console.log(JSON.stringify({
  db: dbPath,
  summary: {
    ...summary,
    structuralIssueCount: structuralIssues.length,
    tenderResultCandidateCount: tenderResultCandidates.length,
    duplicateLotNumberCount: duplicateLotNumbers.length,
  },
  structuralIssues,
  duplicateLotNumbers,
  tenderResultCandidates,
}, null, 2));

db.close();
