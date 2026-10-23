#!/usr/bin/env node
/**
 * scripts/audit-and-fix-lotes.js
 * 
 * Script de auditoría y migración segura para desduplicar y estructurar lotes en SQLite.
 * 
 * Funcionalidades:
 * 1. Backup atómico previo con verificación de integridad y hash (Paso 0).
 * 2. Modo --dry-run (por defecto) y --apply.
 * 3. Detección de lotes duplicados (_LOTE_ vs _lote_) y auditoría multi-lote.
 * 4. Ampliación de esquema: presupuesto_sin_iva, presupuesto_con_iva,
 *    importe_adjudicacion, importe_adj_con_iva, num_ofertas (INTEGER).
 * 5. Fusión con salvaguardas:
 *    - Preservación de lotes desiertos (importe_adjudicacion = NULL).
 *    - Política explícita ante >2 filas por lote (abortar ante discrepancias).
 *    - Generación de IDs canónicos en minúsculas: ${licitacion_id}_lote_${numLote}.
 * 6. Recálculo del importe de adjudicación en la cabecera (licitaciones).
 * 7. Matriz de asserts matemáticos para todos los contratos afectados.
 * 8. Idempotencia verificable.
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert');
const { validateLotConsistency } = require('./lotes-consistency');
const { eligibleAwardLotStatusSql, eligibleLegacyLotAwardAmountSql, isEligibleAwardLotStatus } = require('../src/lib/lot-status.js');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');
const IS_APPLY = process.argv.includes('--apply');
let activeDb = null;
let transactionStarted = false;

function sanitizeTerminalLotAwardFields(estadoLote, fields) {
  if (isEligibleAwardLotStatus(estadoLote)) return { ...fields };

  return {
    ...fields,
    importeAdjudicacion: null,
    importeAdjConIva: null,
    adjudicatario: null,
    nifAdjudicatario: null,
  };
}

function computeFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

function verifyBackupIntegrity(originalPath, backupPath) {
  console.log('🔒 Verificando integridad del backup y capacidad de restauración...');
  const hashOrig = computeFileSha256(originalPath);
  const hashBackup = computeFileSha256(backupPath);
  assert.strictEqual(hashOrig, hashBackup, 'Error: Los hashes SHA256 del original y backup no coinciden.');

  // Prueba de apertura y lectura con SQLite; cerrar ambas conexiones incluso si falla un assert.
  let dbOriginal;
  let dbBackup;
  try {
    dbBackup = new DatabaseSync(backupPath);
    const check = dbBackup.prepare('PRAGMA integrity_check;').get();
    assert.strictEqual(check.integrity_check, 'ok', 'Error: PRAGMA integrity_check falló en el backup.');

    dbOriginal = new DatabaseSync(originalPath);
    const countOrig = dbOriginal.prepare('SELECT count(*) as c FROM contract_lots;').get().c;
    const countBkp = dbBackup.prepare('SELECT count(*) as c FROM contract_lots;').get().c;
    assert.strictEqual(countOrig, countBkp, 'Error: Conteo de filas en backup difiere del original.');

    console.log(`✅ Backup validado con éxito. SHA256: ${hashBackup.slice(0, 16)}... (filas en lotes: ${countBkp})`);
  } finally {
    dbOriginal?.close();
    dbBackup?.close();
  }
}

function main() {
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('    AUDITORÍA Y MIGRACIÓN SEGURA DE LOTES (Art. 99 LCSP)          ');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`Modo de ejecución: ${IS_APPLY ? '🚀 APLICAR CAMBIOS (--apply)' : '🔍 DRY-RUN (Simulación, sin alterar DB)'}`);
  console.log(`Base de datos: ${DB_PATH}\n`);

  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ Archivo de base de datos no encontrado: ${DB_PATH}`);
    process.exit(1);
  }

  // Paso 0: Backup obligatorio si estamos en modo --apply
  if (IS_APPLY) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${DB_PATH}.backup.${timestamp}`;
    console.log(`📦 Creando backup de seguridad en: ${backupPath}`);
    fs.copyFileSync(DB_PATH, backupPath);
    verifyBackupIntegrity(DB_PATH, backupPath);
    console.log('');
  }

  activeDb = new DatabaseSync(DB_PATH);
  const db = activeDb;
  const hasLotAwardsTable = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1").get());

  // Paso 1: Auditoría previa
  console.log('📊 PASO 1: Analizando contratos en contract_lots...');
  const duplicateContracts = db.prepare(`
    SELECT contract_id, count(DISTINCT id) as total_ids, count(DISTINCT LOWER(lot_number)) as distinct_lots
    FROM contract_lots
    GROUP BY contract_id
    HAVING count(DISTINCT id) > count(DISTINCT LOWER(lot_number))
  `).all();

  console.log(`   • Total contratos con filas duplicadas detectadas: ${duplicateContracts.length}`);

  // Guardar baseline para validación matemática posterior
  const baseline = new Map();
  for (const c of duplicateContracts) {
    const rows = db.prepare(`
      SELECT * FROM contract_lots 
      WHERE contract_id = ? 
      ORDER BY lot_number, id
    `).all(c.contract_id);

    baseline.set(c.contract_id, rows);
  }

  // Paso 2: Evolución de Schema
  console.log('\n🛠️ PASO 2: Verificando / extendiendo esquema de contract_lots...');
  const tableInfo = db.prepare('PRAGMA table_info(contract_lots)').all();
  const existingCols = new Set(tableInfo.map(c => c.name));

  const requiredCols = [
    { name: 'budget_excl_vat', type: 'REAL' },
    { name: 'budget_incl_vat', type: 'REAL' },
    { name: 'awarded_amount', type: 'REAL' },
    { name: 'awarded_amount_incl_vat', type: 'REAL' },
    { name: 'offer_count', type: 'INTEGER' },
  ];

  for (const col of requiredCols) {
    if (!existingCols.has(col.name)) {
      console.log(`   ➕ Añadiendo columna: ${col.name} ${col.type}`);
      if (IS_APPLY) {
        db.exec(`ALTER TABLE contract_lots ADD COLUMN ${col.name} ${col.type};`);
      }
    } else {
      console.log(`   ✓ Columna ya existente: ${col.name}`);
    }
  }

  // Paso 3: Consolidación y deduplicación
  console.log('\n🔄 PASO 3: Consolidando filas de lotes...');
  
  // Obtener todas las licitaciones que tienen registros en licitaciones_lotes
  const allLicIds = db.prepare('SELECT DISTINCT contract_id FROM contract_lots').all().map(r => r.contract_id);

  let totalLotsProcessed = 0;
  let totalDeduplicatedLots = 0;
  let totalDesiertosPreserved = 0;
  const consolidationPlan = [];

  for (const licId of allLicIds) {
    const rows = db.prepare('SELECT * FROM contract_lots WHERE contract_id = ?').all(licId);
    
    // Agrupar por numero_lote normalizado (LOWER + trim)
    const lotMap = new Map();
    for (const r of rows) {
      const key = String(r.lot_number || '').trim().toLowerCase();
      if (!lotMap.has(key)) lotMap.set(key, []);
      lotMap.get(key).push(r);
    }

    for (const lotRows of lotMap.values()) {
      totalLotsProcessed++;
      const numLote = lotRows[0].lot_number;

      if (lotRows.length === 1) {
        // Lote sin duplicados: asegurar que los importes estén en las columnas correctas
        const r = lotRows[0];
        let pblSinIva = r.budget_excl_vat ?? null;
        let pblConIva = r.budget_incl_vat ?? null;
        let adjSinIva = r.awarded_amount ?? null;
        let adjConIva = r.awarded_amount_incl_vat ?? null;
        let estado = r.lot_status || 'Definido en pliegos';

        // Si las columnas nuevas están vacías, poblar según estado/adjudicatario
        const isTerminalNoAward = !isEligibleAwardLotStatus(estado);
        if (pblSinIva == null && adjSinIva == null && r.amount_excl_vat != null) {
          if (!isTerminalNoAward && (r.awardee || estado.toLowerCase().includes('adjudicad'))) {
            adjSinIva = r.amount_excl_vat;
            adjConIva = r.amount_incl_vat;
          } else if (!isTerminalNoAward || !r.awardee) {
            // If a terminal lot still has a legacy awardee, amount_excl_vat is
            // ambiguous residual data: do not reinterpret it as either award or PBL.
            pblSinIva = r.amount_excl_vat;
            pblConIva = r.amount_incl_vat;
          }
        }

        const isDesierto = estado.toLowerCase().includes('desiert');
        if (isDesierto) totalDesiertosPreserved++;

        const sanitizedAward = sanitizeTerminalLotAwardFields(estado, {
          importeAdjudicacion: adjSinIva,
          importeAdjConIva: adjConIva,
          adjudicatario: r.awardee,
          nifAdjudicatario: r.awardee_nif,
        });
        adjSinIva = sanitizedAward.importeAdjudicacion;
        adjConIva = sanitizedAward.importeAdjConIva;

        let numOfertas = r.offer_count != null ? parseInt(r.offer_count, 10) : null;

        consolidationPlan.push({
          action: 'UPDATE_EXISTING',
          id: `${licId}_lote_${numLote}`,
          oldIds: [r.id],
          licitacionId: licId,
          expediente: r.case_number,
          numeroLote: numLote,
          nombreLote: r.lot_name,
          presupuestoSinIva: pblSinIva,
          presupuestoConIva: pblConIva,
          importeAdjudicacion: adjSinIva,
          importeAdjConIva: adjConIva,
          valorEstimado: r.estimated_value,
          adjudicatario: sanitizedAward.adjudicatario,
          nifAdjudicatario: sanitizedAward.nifAdjudicatario,
          estadoLote: estado,
          fechaAdjudicacion: r.award_date,
          cpv: r.cpv,
          numOfertas,
        });

      } else {
        // Lote con múltiples filas (2 o >2)
        totalDeduplicatedLots++;
        
        // Salvaguarda: política explícita para >2 filas
        if (lotRows.length > 2) {
          console.warn(`   ⚠️ ALERTA: El contrato ${licId} lote ${numLote} tiene ${lotRows.length} filas históricas.`);
          const distinctWinners = new Set(lotRows.map(r => r.awardee).filter(Boolean));
          if (distinctWinners.size > 1) {
            throw new Error(`Contradicción irresoluble en ${licId} lote ${numLote}: múltiples adjudicatarios distintos: ${Array.from(distinctWinners).join(', ')}`);
          }
        }

        // Separar fila de pliegos y fila de adjudicación
        // 1. Fila de pliegos: la que tiene _LOTE_ o 'Definido en pliegos' o adjudicatario NULL
        const pliegosRow = lotRows.find(r => 
          r.id.includes('_LOTE_') || 
          r.lot_status === 'Definido en pliegos' || 
          (!r.awardee && r.amount_excl_vat != null)
        ) || lotRows[0];

        // 2. Fila de adjudicación: la que tiene _lote_ o adjudicatario NOT NULL o 'Adjudicado'
        const adjRow = lotRows.find(r => 
          (r.id.includes('_lote_') || r.awardee != null || (r.lot_status && r.lot_status.toLowerCase().includes('adjudicad'))) &&
          r.id !== pliegosRow.id
        ) || lotRows.find(r => r.awardee != null);

        const pblSinIva = pliegosRow ? (pliegosRow.budget_excl_vat ?? pliegosRow.amount_excl_vat) : null;
        const pblConIva = pliegosRow ? (pliegosRow.budget_incl_vat ?? pliegosRow.amount_incl_vat) : null;

        let adjSinIva = null;
        let adjConIva = null;
        let adjudicatario = null;
        let nifAdjudicatario = null;
        let estado = 'Definido en pliegos';
        let fechaAdj = null;
        let numOfertas = null;

        if (adjRow && adjRow.awardee) {
          adjSinIva = adjRow.awarded_amount ?? adjRow.amount_excl_vat;
          adjConIva = adjRow.awarded_amount_incl_vat ?? adjRow.amount_incl_vat;
          adjudicatario = adjRow.awardee;
          nifAdjudicatario = adjRow.awardee_nif;
          estado = adjRow.lot_status || 'Adjudicado';
          fechaAdj = adjRow.award_date;
          numOfertas = adjRow.offer_count != null ? parseInt(adjRow.offer_count, 10) : null;
        } else {
          const terminalRow = lotRows.find(r => !isEligibleAwardLotStatus(r.lot_status));
          if (terminalRow) {
            estado = terminalRow.lot_status || 'Anulada';
            if (estado.toLowerCase().includes('desiert')) totalDesiertosPreserved++;
          }
        }

        const sanitizedAward = sanitizeTerminalLotAwardFields(estado, {
          importeAdjudicacion: adjSinIva,
          importeAdjConIva: adjConIva,
          adjudicatario,
          nifAdjudicatario,
        });
        adjSinIva = sanitizedAward.importeAdjudicacion;
        adjConIva = sanitizedAward.importeAdjConIva;
        adjudicatario = sanitizedAward.adjudicatario;
        nifAdjudicatario = sanitizedAward.nifAdjudicatario;

        const nombreLote = (pliegosRow && pliegosRow.lot_name) || (adjRow && adjRow.lot_name) || lotRows[0].lot_name;
        const cpv = (pliegosRow && pliegosRow.cpv) || (adjRow && adjRow.cpv) || lotRows[0].cpv;
        const valorEstimado = (pliegosRow && pliegosRow.estimated_value) || (adjRow && adjRow.estimated_value) || lotRows[0].estimated_value;

        consolidationPlan.push({
          action: 'MERGE_DUPLICATES',
          id: `${licId}_lote_${numLote}`,
          oldIds: lotRows.map(r => r.id),
          licitacionId: licId,
          expediente: lotRows[0].expediente,
          numeroLote: numLote,
          nombreLote,
          presupuestoSinIva: pblSinIva,
          presupuestoConIva: pblConIva,
          importeAdjudicacion: adjSinIva,
          importeAdjConIva: adjConIva,
          valorEstimado,
          adjudicatario,
          nifAdjudicatario,
          estadoLote: estado,
          fechaAdjudicacion: fechaAdj,
          cpv,
          numOfertas,
        });
      }
    }
  }

  console.log(`   • Total lotes procesados: ${totalLotsProcessed}`);
  console.log(`   • Lotes que requieren consolidación/deduplicación: ${totalDeduplicatedLots}`);
  console.log(`   • Lotes desiertos preservados íntegramente: ${totalDesiertosPreserved}`);

  if (IS_APPLY) {
    db.exec('BEGIN TRANSACTION;');
    transactionStarted = true;

    const deleteOldStmt = db.prepare('DELETE FROM contract_lots WHERE id = ?;');
    const insertConsolidatedStmt = db.prepare(`
      INSERT OR REPLACE INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        amount_excl_vat, amount_incl_vat, estimated_value, awardee, awardee_nif,
        lot_status, award_date, cpv,
        budget_excl_vat, budget_incl_vat, awarded_amount, awarded_amount_incl_vat, offer_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    for (const item of consolidationPlan) {
      // Eliminar filas antiguas
      for (const oldId of item.oldIds) {
        deleteOldStmt.run(oldId);
      }
      // Insertar fila canónica consolidada
      insertConsolidatedStmt.run(
        item.id,
        item.licitacionId,
        item.expediente,
        String(item.numeroLote),
        item.nombreLote,
        item.presupuestoSinIva ?? item.importeAdjudicacion, // compatibilidad hacia atrás
        item.presupuestoConIva ?? item.importeAdjConIva,
        item.valorEstimado,
        item.adjudicatario,
        item.nifAdjudicatario,
        item.estadoLote,
        item.fechaAdjudicacion,
        item.cpv,
        item.presupuestoSinIva,
        item.presupuestoConIva,
        item.importeAdjudicacion,
        item.importeAdjConIva,
        item.numOfertas
      );
    }

    // Paso 4: Actualización de cabecera en licitaciones (expedientes padre)
    console.log('\n📈 PASO 4: Recalculando importes agregados y concurrencia en contracts padre...');
    const updateLicStmt = db.prepare(`
      UPDATE contracts
      SET awarded_amount = ?, 
          awarded_amount_incl_vat = ?, 
          award_amount_type = 'total',
          lot_count = ?,
          awardee = CASE WHEN ? > 1 THEN 'Varios adjudicatarios' ELSE ? END,
          awardee_nif = CASE WHEN ? > 1 THEN NULL ELSE ? END,
          offer_count = CASE WHEN ? > 1 AND offer_count = 1 THEN NULL ELSE offer_count END
      WHERE id = ?;
    `);

    const deleteAlertaBajaStmt = db.prepare(`
      DELETE FROM alerts WHERE id = ?;
    `);
    const deleteAlertaContratoStmt = db.prepare(`
      DELETE FROM alert_contracts WHERE alert_id = ?;
    `);
    const deleteAlertaUnicaStmt = db.prepare(`
      DELETE FROM alerts WHERE id = ?;
    `);
    const deleteAlertaContratoUnicaStmt = db.prepare(`
      DELETE FROM alert_contracts WHERE alert_id = ?;
    `);

    // Filtrar licitaciones genuinas por lotes (CODICE_PROJECT_LOT)
    const genuineLotLics = db.prepare(`
      SELECT DISTINCT id FROM contracts 
      WHERE lots_source = 'CODICE_PROJECT_LOT'
    `).all().map(r => r.id);

    let contractsHeaderUpdated = 0;
    let alertsCleaned = 0;
    for (const licId of genuineLotLics) {
      const lotSummary = db.prepare(`
        SELECT 
          count(*) as total_lotes,
          sum(coalesce(awarded_amount, 0)) as total_adj_sin_iva,
          sum(coalesce(awarded_amount_incl_vat, 0)) as total_adj_con_iva,
          count(DISTINCT awardee) as num_adjudicatarios,
          max(awardee) as single_adjudicatario,
          max(awardee_nif) as single_nif
        FROM contract_lots lot
        WHERE lot.contract_id = ?
          AND (lot.lot_status IN ('Adjudicado', 'Resuelto') OR lot.awardee IS NOT NULL)
          AND lot.awarded_amount IS NOT NULL
          AND ${eligibleLegacyLotAwardAmountSql('lot', hasLotAwardsTable)}
          AND LOWER(TRIM(coalesce(lot.lot_name, ''))) NOT LIKE 'primero.-%'
          AND LOWER(TRIM(coalesce(lot.lot_name, ''))) NOT LIKE 'al ser el único%'
          AND LOWER(TRIM(coalesce(lot.lot_name, ''))) NOT LIKE 'aprobar la propuesta%'
      `).get(licId);

      if (lotSummary && lotSummary.total_adj_sin_iva > 0) {
        updateLicStmt.run(
          lotSummary.total_adj_sin_iva,
          lotSummary.total_adj_con_iva > 0 ? lotSummary.total_adj_con_iva : null,
          lotSummary.total_lotes,
          lotSummary.num_adjudicatarios,
          lotSummary.single_adjudicatario,
          lotSummary.num_adjudicatarios,
          lotSummary.single_nif,
          lotSummary.num_adjudicatarios,
          licId
        );
        contractsHeaderUpdated++;

        // Verificar si la alerta de baja acusada previa se vuelve obsoleta o falsa
        const licRow = db.prepare('SELECT amount_excl_vat, awarded_amount, award_amount_type FROM contracts WHERE id = ?').get(licId);
        if (licRow && (licRow.award_amount_type == null || licRow.award_amount_type === 'total') && licRow.amount_excl_vat > 0 && licRow.awarded_amount > 0) {
          const pbl = Number(licRow.amount_excl_vat);
          const adj = Number(licRow.awarded_amount);
          const realBajaPct = Math.round(((pbl - adj) / pbl) * 1000) / 10;
          const alertaBajaId = `ALERT-BAJA-${licId}`;

          if (realBajaPct < 25) {
            // Ya no supera el umbral del 25% de baja: eliminar alerta espuria si existía
            deleteAlertaBajaStmt.run(alertaBajaId);
            deleteAlertaContratoStmt.run(alertaBajaId);
            alertsCleaned++;
          }
        }

        // Si hay múltiples adjudicatarios distintos, eliminar la alerta de oferta única (espuria)
        if (lotSummary.num_adjudicatarios > 1) {
          const alertaUnicaId = `ALERT-UNICA-${licId}`;
          deleteAlertaUnicaStmt.run(alertaUnicaId);
          deleteAlertaContratoUnicaStmt.run(alertaUnicaId);
        }
      }
    }


    console.log(`   • Contratos padre con adjudicación total actualizada: ${contractsHeaderUpdated}`);
    console.log(`   • Alertas de falsos positivos eliminadas: ${alertsCleaned}`);

    console.log('⏳ Cambios preparados; la transacción se confirmará después de superar todas las verificaciones.');
  } else {
    console.log('\nℹ️ [DRY-RUN] No se realizaron escrituras en la base de datos.');
  }

  // Paso 5: Asserts matemáticos de validación (tanto en dry-run sobre el plan como en apply sobre la DB)
  console.log('\n🧪 PASO 5: Verificación de asserts matemáticos para los 15 contratos...');
  
  for (const [licId, oldRows] of baseline.entries()) {
    // Verificar que en el plan o en la DB hay exactamente el número esperado de lotes únicos
    const distinctLots = new Set(oldRows.map(r => String(r.lot_number).trim().toLowerCase()));
    
    // Obtener las filas resultantes
    let newRows = [];
    if (IS_APPLY) {
      newRows = db.prepare('SELECT * FROM contract_lots WHERE contract_id = ?').all(licId);
    } else {
      newRows = consolidationPlan.filter(p => p.licitacionId === licId);
    }

    assert.strictEqual(
      newRows.length, 
      distinctLots.size, 
      `Assert fallido en ${licId}: filas resultantes (${newRows.length}) != lotes únicos (${distinctLots.size})`
    );

    // Para cada lote, comprobar que no se perdieron los importes originales
    for (const lotKey of distinctLots) {
      const origPliegos = oldRows.find(r => 
        String(r.lot_number).trim().toLowerCase() === lotKey && 
        (r.id.includes('_LOTE_') || !r.awardee)
      );
      const origAdj = oldRows.find(r => 
        String(r.lot_number).trim().toLowerCase() === lotKey && 
        (r.id.includes('_lote_') || r.awardee != null)
      );
      const res = newRows.find(r => String(r.lot_number || r.numeroLote).trim().toLowerCase() === lotKey);
      assert.ok(res, `Assert fallido: no se encontró lote ${lotKey} en resultado para ${licId}`);

      if (origPliegos && origPliegos.amount_excl_vat != null) {
        const valRes = IS_APPLY ? res.budget_excl_vat : res.presupuestoSinIva;
        assert.strictEqual(
          valRes, 
          origPliegos.amount_excl_vat,
          `Assert PBL fallido en ${licId} lote ${lotKey}: obtenido ${valRes} != esperado ${origPliegos.amount_excl_vat}`
        );
      }

      if (origAdj && origAdj.amount_excl_vat != null && origAdj.awardee) {
        const valAdj = IS_APPLY ? res.awarded_amount : res.importeAdjudicacion;
        assert.strictEqual(
          valAdj, 
          origAdj.amount_excl_vat,
          `Assert Adjudicación fallido en ${licId} lote ${lotKey}: obtenido ${valAdj} != esperado ${origAdj.amount_excl_vat}`
        );
      }
    }
  }
  console.log(`✅ Todos los asserts matemáticos de los 15 contratos superados con éxito.`);

  // Verificación específica del contrato 19965034
  const targetId = 'https://contrataciondelestado.es/sindicacion/licitacionesPerfilContratante/19965034';
  let targetLots = [];
  if (IS_APPLY) {
    targetLots = db.prepare('SELECT * FROM contract_lots WHERE contract_id = ? ORDER BY lot_number').all(targetId);
  } else {
    targetLots = consolidationPlan.filter(p => p.licitacionId === targetId).sort((a, b) => String(a.numeroLote).localeCompare(String(b.numeroLote)));
  }

  console.log('\n🎯 Comprobación case_number 10/2026 (19965034):');
  assert.strictEqual(targetLots.length, 2, 'Debe haber exactamente 2 lotes.');
  
  const l1 = targetLots[0];
  const l2 = targetLots[1];

  const l1Pbl = IS_APPLY ? l1.budget_excl_vat : l1.presupuestoSinIva;
  const l1Adj = IS_APPLY ? l1.awarded_amount : l1.importeAdjudicacion;
  const l1Win = l1.awardee;

  const l2Pbl = IS_APPLY ? l2.budget_excl_vat : l2.presupuestoSinIva;
  const l2Adj = IS_APPLY ? l2.awarded_amount : l2.importeAdjudicacion;
  const l2Win = l2.awardee;

  console.log(`   • Lote 1: PBL = ${l1Pbl} € | Adj = ${l1Adj} € | Adjudicatario: ${l1Win}`);
  console.log(`   • Lote 2: PBL = ${l2Pbl} € | Adj = ${l2Adj} € | Adjudicatario: ${l2Win}`);

  assert.strictEqual(l1Pbl, 265379.49, 'Lote 1 PBL debe ser 265379.49');
  assert.strictEqual(l1Adj, 265085.21, 'Lote 1 Adjudicación debe ser 265085.21');
  assert.strictEqual(l1Win, 'EQUIPTURIS, S.L.U.', 'Lote 1 awardee debe ser EQUIPTURIS');

  assert.strictEqual(l2Pbl, 24779.11, 'Lote 2 PBL debe ser 24779.11');
  assert.strictEqual(l2Adj, 24168.0, 'Lote 2 Adjudicación debe ser 24168.0');
  assert.strictEqual(l2Win, 'MOISES MATA, S.L.', 'Lote 2 awardee debe ser MOISES MATA');

  if (IS_APPLY) {
    const parentLic = db.prepare('SELECT amount_excl_vat, awarded_amount FROM contracts WHERE id = ?').get(targetId);
    console.log(`   • Cabecera 10/2026: PBL = ${parentLic.amount_excl_vat} € | Adjudicación total = ${parentLic.awarded_amount} €`);
    assert.strictEqual(parentLic.awarded_amount, 289253.21, 'Importe de cabecera debe ser exactamente 289253.21 €');
  }

  // Verificación específica del contrato 18041232 (Expediente 6/2025 Servicios)
  const id6_2025 = 'https://contrataciondelestado.es/sindicacion/licitacionesPerfilContratante/18041232';
  let lots6_2025 = [];
  if (IS_APPLY) {
    lots6_2025 = db.prepare('SELECT * FROM contract_lots WHERE contract_id = ? ORDER BY lot_number').all(id6_2025);
  } else {
    lots6_2025 = consolidationPlan.filter(p => p.licitacionId === id6_2025).sort((a, b) => String(a.numeroLote).localeCompare(String(b.numeroLote)));
  }

  console.log('\n🎯 Comprobación case_number 6/2025 Servicios (18041232):');
  assert.strictEqual(lots6_2025.length, 5, 'Debe haber exactamente 5 lotes.');
  
  const sumAdj6_2025 = lots6_2025.reduce((acc, l) => {
    const val = IS_APPLY ? l.awarded_amount : l.importeAdjudicacion;
    return acc + (val || 0);
  }, 0);

  console.log(`   • Suma adjudicaciones lotes 1 a 5: ${sumAdj6_2025} €`);
  assert.strictEqual(Math.round(sumAdj6_2025 * 100) / 100, 95632.72, 'Suma real de adjudicaciones debe ser 95632.72 €');

  if (IS_APPLY) {
    const parent6 = db.prepare('SELECT amount_excl_vat, awarded_amount, awardee FROM contracts WHERE id = ?').get(id6_2025);
    console.log(`   • Cabecera 6/2025: PBL = ${parent6.amount_excl_vat} € | Adjudicación total = ${parent6.awarded_amount} € | Adjudicatario: ${parent6.awardee}`);
    assert.strictEqual(parent6.awarded_amount, 95632.72, 'Importe de cabecera debe ser exactamente 95632.72 €');
    assert.strictEqual(parent6.awardee, 'Varios adjudicatarios', 'Adjudicatario cabecera debe ser Varios adjudicatarios');

    // Comprobar que los lotes tienen identificada oferta única (num_ofertas = 1)
    const lotesCon1 = lots6_2025.filter(l => (IS_APPLY ? l.offer_count : l.numOfertas) === 1);
    console.log(`   • Lotes con oferta única identificada (offer_count = 1): ${lotesCon1.length} de ${lots6_2025.length}`);
    assert.strictEqual(lotesCon1.length, 5, 'Todos los lotes deben registrar offer_count = 1');

    // Comprobar que no queda ninguna alerta espuria de baja para 18041232
    const alertaFalsa = db.prepare('SELECT * FROM alerts WHERE id = ?').get(`ALERT-BAJA-${id6_2025}`);
    assert.strictEqual(alertaFalsa, undefined, 'La alerta falsa ALERT-BAJA-18041232 debe haber sido eliminada.');
  }

  // Paso 6: Auditoría genérica de consistencia padre ↔ lotes.
  // No modifica datos: sirve para detectar discrepancias que no deben resolverse
  // mediante correcciones específicas por expediente.
  console.log('\n🔎 PASO 6: Auditoría de consistencia de cabeceras y lotes...');
  const lotizedParents = db.prepare(`
    SELECT id, amount_excl_vat, awarded_amount
    FROM contracts
    WHERE is_lotized = 1
  `).all();
  let consistencyIssues = 0;
  for (const parent of lotizedParents) {
    const lots = db.prepare(`
      SELECT lot_number, budget_excl_vat, awarded_amount, lot_status
      FROM contract_lots
      WHERE contract_id = ?
      ORDER BY lot_number
    `).all(parent.id).map((lot) => ({
      numeroLote: lot.lot_number,
      presupuestoSinIva: lot.budget_excl_vat,
      importeAdjudicacion: lot.awarded_amount,
      estadoLote: lot.lot_status,
    }));

    if (!lots.length) continue;
    const result = validateLotConsistency(parent, lots);
    if (!result.ok) {
      consistencyIssues += result.issues.length;
      console.warn(`   ⚠️ ${parent.id}: ${result.issues.map((i) => i.code).join(', ')}`);
    }
  }
  console.log(`   • Contratos lotizados auditados: ${lotizedParents.length}`);
  console.log(`   • Inconsistencias detectadas: ${consistencyIssues}`);
  if (IS_APPLY) {
    db.exec('COMMIT;');
    transactionStarted = false;
    console.log('✅ Transacción confirmada en SQLite.');
  }
  db.close();
  activeDb = null;
  console.log('\n✨ Auditoría y migración finalizada sin errores.');
}

function cleanupAfterFailure(db, shouldRollback) {
  if (!db) return;

  if (shouldRollback) {
    try {
      db.exec('ROLLBACK;');
      console.error('↩️ Transacción revertida tras un error.');
    } catch {
      // Preservar el error original si la transacción ya no está activa.
    }
  }

  try {
    db.close();
  } catch {
    // Preservar el error original si la conexión ya estaba cerrada.
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    cleanupAfterFailure(activeDb, IS_APPLY && transactionStarted);
    activeDb = null;
    transactionStarted = false;
    throw error;
  }
}

module.exports = { cleanupAfterFailure, verifyBackupIntegrity, sanitizeTerminalLotAwardFields };
