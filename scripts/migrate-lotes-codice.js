/**
 * Migración y Extracción Estructurada de Lotes CODICE (PLACSP)
 * 
 * Lee todos los volcados XML Atom de data_raw (2018-2026),
 * extrae los elementos <cac:ProcurementProjectLot> y colecciones <cac:TenderResult>,
 * crea la tabla `contract_lots`, y actualiza las columnas `lotizado`, `num_lotes`
 * y `lotes_origen` en `contracts`.
 */

const { DatabaseSync } = require('node:sqlite');
const { sanitizeNifForStorage } = require('./nif-privacy');
const { isEligibleAwardLotStatus } = require('../src/lib/lot-status.js');
const { extractPartyIdByScheme, extractTenderResultLotId } = require('./placsp-xml');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');
const RAW_DIR = path.resolve(__dirname, '../data_raw');
const LOTES_CACHE_VERSION = 5;
const {
  isDesertedTenderResult,
  isAwardedTenderResult,
  isFormalizedTenderResult,
  isCanceledTenderResult,
} = require('../src/lib/placsp-codice');

function decodeXmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#xD;/g, ' ')
    .replace(/&#10;/g, ' ')
    .replace(/&apos;/g, "'")
    .trim();
}

function getTag(pattern, source) {
  const m = source.match(pattern);
  return m ? decodeXmlEntities(m[1]) : null;
}

function collectLotAwards(lotAwards, tenderResults) {
  for (const tr of tenderResults) {
    if (!/^\d+$/.test(String(tr.numeroLote || '').trim())) continue;
    const lotId = String(tr.numeroLote).trim();
    const awardKey = [lotId, tr.adjudicatario, tr.nifAdjudicatario, tr.importeSinIva, tr.importeConIva, tr.fechaAdjudicacion, tr.resultCode, tr.resultCodeListUri].join('|');
    if (!lotAwards.has(awardKey)) lotAwards.set(awardKey, { ...tr, numeroLote: lotId });
  }
}

function parseLotsFromEntry(xml) {
  const expediente = getTag(/<cbc:ContractFolderID>([^<]+)<\/cbc:ContractFolderID>/, xml);
  const entryId = getTag(/<id>([^<]+)<\/id>/, xml);
  if (!expediente && !entryId) return null;

  // 1. Convocatoria: cac:ProcurementProjectLot
  const projectLots = [];
  const lotMatches = [...xml.matchAll(/<cac:ProcurementProjectLot>([\s\S]*?)<\/cac:ProcurementProjectLot>/g)];
  for (const m of lotMatches) {
    const lotXml = m[1];
    const lotId = getTag(/<cbc:ID[^>]*>([^<]+)<\/cbc:ID>/, lotXml);
    const lotName = getTag(/<cac:ProcurementProject>[\s\S]*?<cbc:Name>([\s\S]*?)<\/cbc:Name>/, lotXml);
    const budgetMatch = lotXml.match(/<cac:BudgetAmount>([\s\S]*?)<\/cac:BudgetAmount>/);
    const budgetXml = budgetMatch ? budgetMatch[1] : '';
    const budgetEx = parseFloat(getTag(/<cbc:TaxExclusiveAmount[^>]*>([^<]+)<\/cbc:TaxExclusiveAmount>/, budgetXml) || '0') || null;
    const budgetTot = parseFloat(getTag(/<cbc:TotalAmount[^>]*>([^<]+)<\/cbc:TotalAmount>/, budgetXml) || '0') || null;
    const lotEstimatedMatch = lotXml.match(/<cac:EstimatedOverallContractAmount>([\s\S]*?)<\/cac:EstimatedOverallContractAmount>/);
    const lotEstimatedXml = lotEstimatedMatch ? lotEstimatedMatch[1] : '';
    const lotValorEstimado = parseFloat(
      getTag(/<cbc:EstimatedOverallContractAmount[^>]*>([^<]+)<\/cbc:EstimatedOverallContractAmount>/, lotXml) ||
      getTag(/<cbc:TaxExclusiveAmount[^>]*>([^<]+)<\/cbc:TaxExclusiveAmount>/, lotEstimatedXml) ||
      '0'
    ) || null;
    const cpv = getTag(/<cbc:ItemClassificationCode[^>]*>([^<]+)<\/cbc:ItemClassificationCode>/, lotXml);

    if (lotId) {
      projectLots.push({
        numeroLote: lotId,
        nombreLote: lotName || `Lote ${lotId}`,
        importeSinIva: budgetEx,
        importeConIva: budgetTot,
        valorEstimado: lotValorEstimado,
        cpv: cpv || null,
      });
    }
  }

  // 2. Adjudicaciones: cac:TenderResult
  const tenderResults = [];
  const trMatches = [...xml.matchAll(/<cac:TenderResult>([\s\S]*?)<\/cac:TenderResult>/g)];
  for (const tr of trMatches) {
    const trXml = tr[1];
    const resultCode = getTag(/<cbc:ResultCode[^>]*>([^<]+)<\/cbc:ResultCode>/, trXml);
    const resultListUriMatch = trXml.match(/<cbc:ResultCode[^>]*listURI="([^"]+)"[^>]*>/);
    const resultCodeListUri = resultListUriMatch ? resultListUriMatch[1] : null;
    const desc = getTag(/<cbc:Description>([\s\S]*?)<\/cbc:Description>/, trXml);
    const awardDate = getTag(/<cbc:AwardDate>([^<]+)<\/cbc:AwardDate>/, trXml);

    // Lot identification
    const lotId =
      extractTenderResultLotId(trXml) ||
      getTag(/<cac:ProcurementProjectLot>[\s\S]*?<cbc:ID[^>]*>([^<]+)<\/cbc:ID>/, trXml);

    // Winning party
    const winMatch = trXml.match(/<cac:WinningParty>([\s\S]*?)<\/cac:WinningParty>/);
    const winXml = winMatch ? winMatch[1] : '';
    const adjudicatario = getTag(/<cac:PartyName>[\s\S]*?<cbc:Name>([^<]+)<\/cbc:Name>/, winXml);
    const nifAdjudicatario = sanitizeNifForStorage(extractPartyIdByScheme(winXml, 'NIF'));

    // Awarded amount
    const awardedMatch = trXml.match(/<cac:AwardedTenderedProject>([\s\S]*?)<\/cac:AwardedTenderedProject>/);
    const awardedXml = awardedMatch ? awardedMatch[1] : '';
    const amountSinIva = parseFloat(getTag(/<cbc:TaxExclusiveAmount[^>]*>([^<]+)<\/cbc:TaxExclusiveAmount>/, awardedXml) || '0') || null;
    const amountConIva = parseFloat(getTag(/<cbc:PayableAmount[^>]*>([^<]+)<\/cbc:PayableAmount>/, awardedXml) || '0') || null;
    const numOfertas = parseInt(getTag(/<cbc:ReceivedTenderQuantity>([^<]+)<\/cbc:ReceivedTenderQuantity>/, trXml) || '0', 10) || null;

    tenderResults.push({
      numeroLote: lotId || null,
      adjudicatario: adjudicatario || null,
      nifAdjudicatario: nifAdjudicatario || null,
      importeSinIva: amountSinIva,
      importeConIva: amountConIva,
      numOfertas,
      fechaAdjudicacion: awardDate || null,
      resultCode: resultCode || null,
      resultCodeListUri,
      descripcion: desc || null,
    });
  }

  return {
    expediente,
    entryId,
    projectLots,
    tenderResults,
  };
}

async function processZipFile(zipPath, targetNifs, spawnImpl = spawn) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(zipPath)) return reject(new Error(`No existe el archivo ZIP: ${zipPath}`));
    const proc = spawnImpl('unzip', ['-p', zipPath]);
    let buffer = '';
    const results = [];

    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let start;
      while ((start = buffer.indexOf('<entry>')) !== -1) {
        const end = buffer.indexOf('</entry>', start);
        if (end === -1) {
          buffer = buffer.substring(start);
          break;
        }
        const entry = buffer.substring(start, end + 8);
        buffer = buffer.substring(end + 8);

        let matchNif = false;
        for (const n of targetNifs) {
          if (entry.includes(n)) { matchNif = true; break; }
        }
        if (matchNif) {
          const parsed = parseLotsFromEntry(entry);
          if (parsed) {
            results.push(parsed);
          }
        }
      }
    });

    proc.on('close', (code, signal) => {
      if (code !== 0) {
        return reject(new Error(`unzip falló para ${zipPath} (código ${code}${signal ? `, señal ${signal}` : ''})`));
      }
      resolve(results);
    });
    proc.on('error', (error) => reject(error));
  });
}

function applyLotDataToDb(db, allContracts, expedienteLotsMap) {
  const updateLicStmt = db.prepare(`
    UPDATE contracts 
    SET is_lotized = ?, lot_count = ?, lots_source = ?
    WHERE id = ?
  `);

  const deleteLotAwardsStmt = db.prepare('DELETE FROM lot_awards WHERE contract_id = ?');
  const insertLotAwardStmt = db.prepare(`
    INSERT OR REPLACE INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awardee_nif,
      awarded_amount, awarded_amount_incl_vat, offer_count, award_date,
      result_code, result_code_list_uri, result_state, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertLoteStmt = db.prepare(`
    INSERT OR REPLACE INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name,
      amount_excl_vat, amount_incl_vat, estimated_value, awardee, awardee_nif,
      lot_status, award_date, cpv,
      budget_excl_vat, budget_incl_vat, awarded_amount, awarded_amount_incl_vat, offer_count,
      result_code, result_code_list_uri
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.exec('BEGIN IMMEDIATE;');
  let updatedMultilot = 0;
  let totalLotesInserted = 0;

  try {
    for (const c of allContracts) {
      const expKey = (c.expediente || '').trim();
      const expData = expedienteLotsMap.get(expKey);

      if (expData && expData.lotAwards?.size) {
        deleteLotAwardsStmt.run(c.id);
        const awardIndexByLot = new Map();
        for (const award of expData.lotAwards.values()) {
          const lotId = String(award.numeroLote);
          const awardIndex = (awardIndexByLot.get(lotId) || 0) + 1;
          awardIndexByLot.set(lotId, awardIndex);
          insertLotAwardStmt.run(
            `${c.id}_lot_${lotId}_award_${awardIndex}`,
            c.id,
            c.expediente,
            lotId,
            awardIndex,
            award.adjudicatario || null,
            award.nifAdjudicatario || null,
            award.importeSinIva ?? null,
            award.importeConIva ?? null,
            award.numOfertas ?? null,
            award.fechaAdjudicacion || null,
            award.resultCode || null,
            award.resultCodeListUri || null,
            award.resultState || null,
            award.descripcion || null
          );
        }
      }

      if (expData && expData.lots.size > 1) {
        const numLotes = expData.lots.size;
        updateLicStmt.run(1, numLotes, expData.origin || 'CODICE_ESTRUCTURADO', c.id);
        updatedMultilot++;

        for (const [lotId, lot] of expData.lots.entries()) {
          const pk = `${c.id}_lote_${lotId}`;
          const hasWinner = Boolean(lot.adjudicatario) && isEligibleAwardLotStatus(lot.estadoLote);
          const pblSinIva = lot.importeSinIva;
          const pblConIva = lot.importeConIva;
          const adjSinIva = hasWinner ? (lot.importeAdjudicacion ?? null) : null;
          const adjConIva = hasWinner ? (lot.importeAdjConIva ?? null) : null;

          insertLoteStmt.run(
            pk,
            c.id,
            c.expediente,
            lot.numeroLote,
            lot.nombreLote,
            pblSinIva ?? adjSinIva,
            pblConIva ?? adjConIva,
            lot.valorEstimado || null,
            hasWinner ? lot.adjudicatario : null,
            hasWinner ? lot.nifAdjudicatario : null,
            lot.estadoLote || (hasWinner ? 'Adjudicado' : 'Definido en pliegos'),
            lot.fechaAdjudicacion || null,
            lot.cpv || null,
            pblSinIva,
            pblConIva,
            adjSinIva,
            adjConIva,
            lot.numOfertas || null,
            lot.resultCode || null,
            lot.resultCodeListUri || null
          );
          totalLotesInserted++;
        }
      } else {
        // Si no viene en XML pero el texto indica división explícita (fallback textual controlado)
        const rawText = ((c.objeto || '') + ' ' + (c.expediente || '')).toLowerCase();
        const numMatch = rawText.match(/(\d+)\s+lotes/);
        if (numMatch && parseInt(numMatch[1], 10) > 1) {
          const n = parseInt(numMatch[1], 10);
          updateLicStmt.run(1, n, 'HEURISTICA_TEXTUAL', c.id);
          updatedMultilot++;
        } else if (rawText.includes('por lotes') || rawText.includes('dividida en lotes') || rawText.includes('dividido en lotes')) {
          updateLicStmt.run(1, 2, 'HEURISTICA_TEXTUAL', c.id);
          updatedMultilot++;
        } else {
          updateLicStmt.run(0, 1, 'LOTE_UNICO', c.id);
        }
      }
    }
    db.exec('COMMIT;');
    return { updatedMultilot, totalLotesInserted };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* transaction may already have rolled back */ }
    throw error;
  }
}

async function main() {
  console.log('🚀 Iniciando migración de Lotes CODICE...');
  const db = new DatabaseSync(DB_PATH);
  try {
    const targetNifs = new Set(db.prepare('SELECT nif FROM contracting_authorities WHERE active = 1').all().map(r => r.nif));

    // 1. Comprobar / Añadir columnas en licitaciones
    const columns = db.prepare('PRAGMA table_info(contracts)').all().map(c => c.name);
    if (!columns.includes('is_lotized')) {
      console.log('➕ Añadiendo columna is_lotized a contracts...');
      db.exec('ALTER TABLE contracts ADD COLUMN is_lotized INTEGER DEFAULT 0;');
    }
    if (!columns.includes('lot_count')) {
      console.log('➕ Añadiendo columna lot_count a contracts...');
      db.exec('ALTER TABLE contracts ADD COLUMN lot_count INTEGER DEFAULT 1;');
    }
    if (!columns.includes('lots_source')) {
      console.log('➕ Añadiendo columna lots_source a contracts...');
      db.exec('ALTER TABLE contracts ADD COLUMN lots_source TEXT;');
    }

    // 2. Crear tabla licitaciones_lotes
    console.log('📦 Creando tabla contract_lots...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS contract_lots (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        case_number TEXT,
        lot_number TEXT NOT NULL,
        lot_name TEXT,
        amount_excl_vat REAL,
        amount_incl_vat REAL,
        estimated_value REAL,
        awardee TEXT,
        awardee_nif TEXT,
        lot_status TEXT,
        award_date TEXT,
        cpv TEXT,
        budget_excl_vat REAL,
        budget_incl_vat REAL,
        awarded_amount REAL,
        awarded_amount_incl_vat REAL,
        offer_count INTEGER,
        result_code TEXT,
        result_code_list_uri TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_contract_lots_contract_id ON contract_lots(contract_id);
      CREATE INDEX IF NOT EXISTS idx_contract_lots_case_number ON contract_lots(case_number);
    `);

    const loteCols = db.prepare('PRAGMA table_info(contract_lots)').all().map(c => c.name);
    if (!loteCols.includes('estimated_value')) {
      db.exec('ALTER TABLE contract_lots ADD COLUMN estimated_value REAL;');
    }
    if (!loteCols.includes('budget_excl_vat')) {
      db.exec('ALTER TABLE contract_lots ADD COLUMN budget_excl_vat REAL;');
    }
    if (!loteCols.includes('budget_incl_vat')) {
      db.exec('ALTER TABLE contract_lots ADD COLUMN budget_incl_vat REAL;');
    }
    if (!loteCols.includes('awarded_amount')) {
      db.exec('ALTER TABLE contract_lots ADD COLUMN awarded_amount REAL;');
    }
    if (!loteCols.includes('awarded_amount_incl_vat')) {
      db.exec('ALTER TABLE contract_lots ADD COLUMN awarded_amount_incl_vat REAL;');
    }
    if (!loteCols.includes('offer_count')) {
      db.exec('ALTER TABLE contract_lots ADD COLUMN offer_count INTEGER;');
    }
    if (!loteCols.includes('result_code')) {
      db.exec('ALTER TABLE contract_lots ADD COLUMN result_code TEXT;');
    }
    if (!loteCols.includes('result_code_list_uri')) {
      db.exec('ALTER TABLE contract_lots ADD COLUMN result_code_list_uri TEXT;');
    }

    const CACHE_FILE = path.resolve(__dirname, '../data/lotes_cache.json');
    const expedienteLotsMap = new Map();
    let cacheUsable = false;

    if (fs.existsSync(CACHE_FILE)) {
      try {
        const rawCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        cacheUsable = rawCache && rawCache._meta?.version === LOTES_CACHE_VERSION;
        if (cacheUsable) {
          for (const [expKey, item] of Object.entries(rawCache)) {
            if (expKey === '_meta' || !item?.lots) continue;
            expedienteLotsMap.set(expKey, {
              expediente: expKey,
              lots: new Map(Object.entries(item.lots)),
              lotAwards: new Map(Object.entries(item.lotAwards || {})),
              origin: item.origin,
            });
          }
          console.log(`⚡ Caché de lotes v${LOTES_CACHE_VERSION} válida: ${expedienteLotsMap.size} expedientes.`);
        } else {
          console.log(`♻️ Caché de lotes obsoleta: se reconstruirá con el parser actual.`);
        }
      } catch (error) {
        console.warn(`⚠️ Caché de lotes inválida: ${error.message}. Se reconstruirá.`);
      }
    }

    if (!cacheUsable) {
      // 3. Procesar archivos zip en data_raw
      const zipFiles = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.zip'));
      console.log(`📁 Encontrados ${zipFiles.length} archivos ZIP en data_raw/`);

    for (const zipFile of zipFiles) {
      const zipPath = path.join(RAW_DIR, zipFile);
      process.stdout.write(`  Procesando ${zipFile}... `);
      const parsedEntries = await processZipFile(zipPath, targetNifs);
      let countLotsInZip = 0;

      for (const entry of parsedEntries) {
        const expKey = (entry.expediente || '').trim();
        if (!expKey) continue;

        if (!expedienteLotsMap.has(expKey)) {
          expedienteLotsMap.set(expKey, {
            expediente: expKey,
            lots: new Map(),
            lotAwards: new Map(),
            origin: null,
          });
        }
        const expRecord = expedienteLotsMap.get(expKey);

        // Consolidar projectLots
        if (entry.projectLots.length > 0) {
          expRecord.origin = 'CODICE_PROJECT_LOT';
          for (const pl of entry.projectLots) {
            const lId = String(pl.numeroLote || expRecord.lots.size + 1);
            if (!expRecord.lots.has(lId)) {
              expRecord.lots.set(lId, {
                numeroLote: lId,
                nombreLote: pl.nombreLote,
                importeSinIva: pl.importeSinIva,
                importeConIva: pl.importeConIva,
                cpv: pl.cpv,
                adjudicatario: null,
                nifAdjudicatario: null,
                fechaAdjudicacion: null,
                importeAdjudicacion: null,
                importeAdjConIva: null,
                numOfertas: null,
                estadoLote: 'Definido en pliegos',
              });
            } else {
              const existing = expRecord.lots.get(lId);
              if (!existing.nombreLote && pl.nombreLote) existing.nombreLote = pl.nombreLote;
              if (!existing.importeSinIva && pl.importeSinIva) existing.importeSinIva = pl.importeSinIva;
              if (!existing.importeConIva && pl.importeConIva) existing.importeConIva = pl.importeConIva;
              if (!existing.cpv && pl.cpv) existing.cpv = pl.cpv;
            }
          }
        }

        // Consolidar tenderResults
        if (entry.tenderResults.length > 0) {
          // Conservar todas las adjudicaciones explícitas por lote, incluidos
          // varios adjudicatarios del mismo lote. La colección se persiste
          // posteriormente en lot_awards.
          collectLotAwards(expRecord.lotAwards, entry.tenderResults);
          if (!expRecord.origin) expRecord.origin = 'CODICE_TENDER_RESULTS';
          // Los TenderResult sin identificador de lote no permiten inferir lotización.
          // La migración legacy debe ser conservadora y no convertirlos en lotes sintéticos.
          const explicitTenderResults = entry.tenderResults.filter((tr) => /^\d+$/.test(String(tr.numeroLote || '').trim()));
          const byLot = new Map();
          for (const tr of explicitTenderResults) {
            const lId = String(tr.numeroLote).trim();
            const current = byLot.get(lId);
            if (!current) {
              byLot.set(lId, tr);
              continue;
            }
            const currentDate = Date.parse(current.fechaAdjudicacion || '') || 0;
            const nextDate = Date.parse(tr.fechaAdjudicacion || '') || 0;
            const currentFinal = isAwardedTenderResult(current.resultCode, current.resultCodeListUri) || isFormalizedTenderResult(current.resultCode, current.resultCodeListUri) || isDesertedTenderResult(current.resultCode, current.resultCodeListUri) || isCanceledTenderResult(current.resultCode, current.resultCodeListUri);
            const nextFinal = isAwardedTenderResult(tr.resultCode, tr.resultCodeListUri) || isFormalizedTenderResult(tr.resultCode, tr.resultCodeListUri) || isDesertedTenderResult(tr.resultCode, tr.resultCodeListUri) || isCanceledTenderResult(tr.resultCode, tr.resultCodeListUri);
            if (nextDate > currentDate || (nextDate === currentDate && nextFinal && !currentFinal)) {
              byLot.set(lId, tr);
            }
          }
          for (const tr of byLot.values()) {
            const lId = String(tr.numeroLote).trim();
            const noAward = isDesertedTenderResult(tr.resultCode, tr.resultCodeListUri) || isCanceledTenderResult(tr.resultCode, tr.resultCodeListUri);
            if (!expRecord.lots.has(lId)) {
              expRecord.lots.set(lId, {
                numeroLote: lId,
                nombreLote: tr.descripcion ? tr.descripcion.slice(0, 100) : `Lote ${lId}`,
                importeSinIva: null,
                importeConIva: null,
                importeAdjudicacion: noAward ? null : tr.importeSinIva,
                importeAdjConIva: noAward ? null : tr.importeConIva,
                cpv: null,
                adjudicatario: noAward ? null : tr.adjudicatario,
                nifAdjudicatario: noAward ? null : tr.nifAdjudicatario,
                fechaAdjudicacion: tr.fechaAdjudicacion,
                importeAdjudicacion: noAward ? null : tr.importeSinIva,
                importeAdjConIva: noAward ? null : tr.importeConIva,
                numOfertas: tr.numOfertas || null,
                estadoLote: isDesertedTenderResult(tr.resultCode, tr.resultCodeListUri) ? 'Desierto' : isCanceledTenderResult(tr.resultCode, tr.resultCodeListUri) ? 'Anulada' : isFormalizedTenderResult(tr.resultCode, tr.resultCodeListUri) ? 'Formalizada' : isAwardedTenderResult(tr.resultCode, tr.resultCodeListUri) ? 'Adjudicado' : 'Resuelto',
                resultCode: tr.resultCode || null,
                resultCodeListUri: tr.resultCodeListUri || null,
              });
            } else {
              const existing = expRecord.lots.get(lId);
              if (tr.adjudicatario && !noAward) existing.adjudicatario = tr.adjudicatario;
              if (tr.nifAdjudicatario && !noAward) existing.nifAdjudicatario = tr.nifAdjudicatario;
              if (tr.importeSinIva != null && !noAward) existing.importeAdjudicacion = tr.importeSinIva;
              if (tr.importeConIva != null && !noAward) existing.importeAdjConIva = tr.importeConIva;
              if (tr.numOfertas != null) existing.numOfertas = tr.numOfertas;
              if (tr.fechaAdjudicacion) existing.fechaAdjudicacion = tr.fechaAdjudicacion;
              existing.resultCode = tr.resultCode || existing.resultCode || null;
              existing.resultCodeListUri = tr.resultCodeListUri || existing.resultCodeListUri || null;
              if (isDesertedTenderResult(tr.resultCode, tr.resultCodeListUri)) {
                existing.estadoLote = 'Desierto';
                existing.adjudicatario = null;
                existing.nifAdjudicatario = null;
                existing.importeAdjudicacion = null;
                existing.importeAdjConIva = null;
              } else if (isCanceledTenderResult(tr.resultCode, tr.resultCodeListUri)) {
                existing.estadoLote = 'Anulada';
                existing.adjudicatario = null;
                existing.nifAdjudicatario = null;
                existing.importeAdjudicacion = null;
                existing.importeAdjConIva = null;
              } else if (isFormalizedTenderResult(tr.resultCode, tr.resultCodeListUri)) {
                existing.estadoLote = 'Formalizada';
              } else if (isAwardedTenderResult(tr.resultCode, tr.resultCodeListUri)) {
                existing.estadoLote = 'Adjudicado';
              }
            }
          }
        }
        countLotsInZip += entry.projectLots.length;
      }
      console.log(`✅ (${parsedEntries.length} entradas, ${countLotsInZip} lotes detectados)`);
      }

      // Guardar caché para ejecuciones instantáneas futuras
      const cacheObj = { _meta: { version: LOTES_CACHE_VERSION } };
      for (const [k, v] of expedienteLotsMap.entries()) {
        cacheObj[k] = {
          expediente: v.expediente,
          origin: v.origin,
          lots: Object.fromEntries(v.lots),
          lotAwards: Object.fromEntries(v.lotAwards || []),
        };
      }
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheObj, null, 2), 'utf8');
      console.log(`💾 Guardada caché de lotes en data/lotes_cache.json (${expedienteLotsMap.size} expedientes).`);
    }

    // 4. Actualizar base de datos
    console.log('\n💾 Actualizando registros en SQLite...');
    const allContracts = db.prepare('SELECT id, case_number AS expediente, object_description AS objeto, procedure FROM contracts').all();
    const { updatedMultilot, totalLotesInserted } = applyLotDataToDb(db, allContracts, expedienteLotsMap);

    console.log(`\n🎉 Migración completada con éxito:`);
    console.log(`   - Contratos analizados: ${allContracts.length}`);
    console.log(`   - Contratos formalmente lotizados identificados: ${updatedMultilot}`);
    console.log(`   - Registros de lotes individuales insertados en contract_lots: ${totalLotesInserted}`);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { collectLotAwards, parseLotsFromEntry, processZipFile, LOTES_CACHE_VERSION, applyLotDataToDb };

