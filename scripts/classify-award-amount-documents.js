#!/usr/bin/env node
/**
 * Resolve PLACSP awarded amounts that are likely unit prices using evidence
 * from the official tender documents already indexed in contract_documents.
 *
 * This is deliberately conservative:
 * - candidate selection does not infer unit prices from the size of a reduction;
 * - only strong unit-price expressions in eligible document text classify as
 *   "unitario";
 * - absence of evidence leaves the value as "desconocido";
 * - the source amount is never modified.
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');
const TMP_DIR = '/tmp/licitalcazar-award-docs';

const CANDIDATE_SQL = `
  SELECT c.id, c.case_number, c.awarded_amount, c.amount_excl_vat,
         c.award_amount_type
  FROM contracts c
  WHERE c.awarded_amount IS NOT NULL
    AND c.awarded_amount > 0
    AND (c.award_amount_type IS NULL OR c.award_amount_type = 'desconocido')
    AND EXISTS (
      SELECT 1 FROM contract_documents d
      WHERE d.contract_id = c.id
        AND d.document_type IN ('PLIEGO', 'RESOLUCION', 'INFORME_TECNICO')
    )
  ORDER BY c.case_number
`;

const STRONG_PATTERNS = [
  /precio\s+(?:de\s+)?la\s+hora/i,
  /precio\s+por\s+hora/i,
  /precio\s*\/\s*hora/i,
  /(?:precio|importe)\s+(?:por\s+)?(?:kil[oó]metro|km)/i,
  /precio\s+unitari[oa]s?/i,
  /precios\s+unitari[oa]s?/i,
  /por\s+unidad(?:es)?/i,
  /precio\s+por\s+unidad(?:es)?/i,
  /unidad(?:es)?\s+(?:de|a)\s*[:=]/i,
  /(?:euros?|€)\s*(?:por|\/)\s*(?:hora|km|kil[oó]metro|unidad|ud\.?|servicio)/i,
  /canon\s+(?:mensual|anual)/i,
];

function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findEvidence(text) {
  const normalized = normalizeText(text);
  for (const pattern of STRONG_PATTERNS) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const start = Math.max(0, match.index - 180);
    const end = Math.min(normalized.length, match.index + match[0].length + 260);
    return normalized.slice(start, end);
  }
  return null;
}

function downloadText(url, key, execFileSyncImpl = execFileSync) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const pdf = path.join(TMP_DIR, key + '.pdf');
  const txt = path.join(TMP_DIR, key + '.txt');
  try {
    execFileSyncImpl('curl', ['-s', '--fail', url, '-A', 'Mozilla/5.0', '-L', '--max-time', '15', '-o', pdf], { stdio: 'ignore' });
    if (!fs.existsSync(pdf) || fs.statSync(pdf).size < 1000) return null;
    execFileSyncImpl('pdftotext', ['-layout', pdf, txt], { stdio: 'ignore' });
    if (!fs.existsSync(txt)) return null;
    return fs.readFileSync(txt, 'utf8');
  } catch {
    return null;
  } finally {
    for (const file of [pdf, txt]) {
      try { fs.unlinkSync(file); } catch {}
    }
  }
}

function main() {
  const db = new DatabaseSync(DB_PATH);
  const dryRun = process.argv.includes('--dry-run');

  const candidates = db.prepare(CANDIDATE_SQL).all();

  let classified = 0;
  let inspected = 0;
  const update = db.prepare(`UPDATE contracts
    SET award_amount_type = 'unitario'
    WHERE id = ? AND (award_amount_type IS NULL OR award_amount_type = 'desconocido')`);

  if (!dryRun) db.exec('BEGIN');
  try {
    for (const c of candidates) {
      const docs = db.prepare(`
        SELECT id, title, source_url, document_type
        FROM contract_documents
        WHERE contract_id = ?
          AND document_type IN ('PLIEGO', 'RESOLUCION', 'INFORME_TECNICO')
        ORDER BY CASE document_type
          WHEN 'PLIEGO' THEN 0
          WHEN 'RESOLUCION' THEN 1
          ELSE 2
        END, id
      `).all(c.id);

      let evidence = null;
      let evidenceDoc = null;
      for (const doc of docs) {
        inspected++;
        const text = downloadText(doc.source_url, String(c.id).replace(/[^a-zA-Z0-9_-]/g, '_') + '_' + doc.id.replace(/[^a-zA-Z0-9_-]/g, '_'));
        evidence = findEvidence(text);
        if (evidence) {
          evidenceDoc = doc;
          break;
        }
      }

      if (evidence) {
        classified++;
        console.log(`🟢 ${c.case_number}: UNITARIO — ${evidenceDoc.document_type} — ${evidenceDoc.title}`);
        console.log(`   evidencia: …${evidence}…`);
        if (!dryRun) update.run(c.id);
      }
    }

    if (!dryRun) db.exec('COMMIT');
  } catch (err) {
    if (!dryRun) { try { db.exec('ROLLBACK'); } catch {} }
    throw err;
  }

  console.log(`\n📊 Candidatos: ${candidates.length}`);
  console.log(`📄 Documentos inspeccionados: ${inspected}`);
  console.log(`🟢 Clasificados como unitarios: ${classified}`);
  if (dryRun) console.log('🔎 DRY-RUN: no se ha modificado la BD.');
}

if (require.main === module) main();

module.exports = { normalizeText, findEvidence, STRONG_PATTERNS, CANDIDATE_SQL, downloadText };
