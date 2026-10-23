const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { normalizeIdentityPart } = require('./contract-identity');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');
const RAW_DIR = path.resolve(__dirname, '../data_raw');

function parseNullableNumber(value) {
  if (value == null || String(value).trim() === '') return null;
  const parsed = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function getTag(regex, str) {
  const m = str.match(regex);
  return m ? m[1].trim() : null;
}

function cleanHtmlEntities(str) {
  if (!str) return null;
  return str
    .replace(/&#xD;/g, '')
    .replace(/&#243;/g, 'ó')
    .replace(/&#237;/g, 'í')
    .replace(/&#225;/g, 'á')
    .replace(/&#233;/g, 'é')
    .replace(/&#250;/g, 'ú')
    .replace(/&#241;/g, 'ñ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function normalizeContractingAuthorityMatch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTargetAuthorities(rows) {
  const byPlacspId = new Map();
  const byDir3 = new Map();
  const byNif = new Map();
  const byName = new Map();
  for (const row of rows) {
    const info = { id: row.id, placsp_id: row.placsp_id, dir3: row.dir3, nif: row.nif };
    if (row.placsp_id) byPlacspId.set(row.placsp_id, info);
    if (row.dir3) byDir3.set(row.dir3, info);
    if (row.nif) {
      const list = byNif.get(row.nif) || [];
      list.push(info);
      byNif.set(row.nif, list);
    }
    for (const name of [row.name, ...(JSON.parse(row.historical_names_json || '[]'))]) {
      const normalized = normalizeContractingAuthorityMatch(name);
      if (normalized) {
        const matches = byName.get(normalized) || [];
        if (!matches.some(existing => existing.id === info.id)) matches.push(info);
        byName.set(normalized, matches);
      }
    }
  }
  return { byPlacspId, byDir3, byNif, byName };
}

function resolveContractingAuthority(ids, contractingAuthorityName, targets) {
  if (ids.ID_PLATAFORMA && targets.byPlacspId.has(ids.ID_PLATAFORMA)) {
    return targets.byPlacspId.get(ids.ID_PLATAFORMA);
  }
  if (ids.DIR3 && targets.byDir3.has(ids.DIR3)) {
    return targets.byDir3.get(ids.DIR3);
  }
  if (ids.NIF) {
    const matches = targets.byNif.get(ids.NIF) || [];
    if (matches.length === 1) return matches[0];
  }
  const name = normalizeContractingAuthorityMatch(contractingAuthorityName);
  if (!name) return null;
  const matches = targets.byName.get(name) || [];
  return matches.length === 1 ? matches[0] : null;
}

async function extractModificationsFromZip(zipPath, targetAuthorities, spawnImpl = spawn) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(zipPath)) return resolve([]);

    const modifications = [];
    const proc = spawnImpl('unzip', ['-p', zipPath]);
    let buffer = '';

    proc.stdout.on('data', chunk => {
      try {
        buffer += chunk.toString('utf8');
      let entryStart;
      while ((entryStart = buffer.indexOf('<entry>')) !== -1) {
        const entryEnd = buffer.indexOf('</entry>', entryStart);
        if (entryEnd === -1) {
          buffer = buffer.substring(entryStart);
          break;
        }
        const entryXml = buffer.substring(entryStart, entryEnd + 8);
        buffer = buffer.substring(entryEnd + 8);

        if (!entryXml.includes('ContractModification')) continue;

        const partyXml = getTag(/<cac-place-ext:LocatedContractingParty>([\s\S]*?)<\/cac-place-ext:LocatedContractingParty>/, entryXml) || '';
        const ids = {};
        for (const match of partyXml.matchAll(/<cbc:ID(?:\s+[^>]*)?\s+schemeName="([^"]+)"[^>]*>([^<]*)<\/cbc:ID>/g)) {
          ids[match[1]] = cleanHtmlEntities(match[2]);
        }
        const contractingAuthorityName = getTag(/<cac:PartyName>[\s\S]*?<cbc:Name>([^<]+)<\/cbc:Name>/, partyXml);
        const authority = resolveContractingAuthority(ids, contractingAuthorityName, targetAuthorities);
        if (!authority) continue;

        const licitacionId = getTag(/<id>([^<]+)<\/id>/, entryXml);
        const case_number = getTag(/<cbc:ContractFolderID[^>]*>([^<]+)<\/cbc:ContractFolderID>/, entryXml);
        const authorityNif = ids.NIF || null;
        const contractingAuthorityId = authority.id;
        if (!licitacionId && !case_number) continue;

        const entryUpdated = getTag(/<updated>([^<]+)<\/updated>/, entryXml);
        const entryLink = cleanHtmlEntities(getTag(/<link[^>]+href="([^"]+)"/, entryXml));

        const modRegex = /<cac:ContractModification>([\s\S]*?)<\/cac:ContractModification>/g;
        let match;
        while ((match = modRegex.exec(entryXml)) !== null) {
          const modXml = match[1];
          const rawNumero = getTag(/<cbc:ID[^>]*>([^<]+)<\/cbc:ID>/, modXml);
          const numero = rawNumero == null || !/^\d{1,5}$/.test(rawNumero) ? null : Number.parseInt(rawNumero, 10);
          if (numero == null) {
            throw new Error(`Identificador de modificación inválido: ${rawNumero ?? 'ausente'}`);
          }
          const rawFecha = getTag(/<cbc:IssueDate[^>]*>([^<]+)<\/cbc:IssueDate>/, modXml) || entryUpdated;
          const document_date = rawFecha ? rawFecha.substring(0, 10) : null;
          const rawNote = getTag(/<cbc:Note[^>]*>([\s\S]*?)<\/cbc:Note>/, modXml);
          const reason = cleanHtmlEntities(rawNote);

          const durTag = modXml.match(/<cbc:ContractModificationDurationMeasure[^>]+unitCode="([^"]+)"[^>]*>([^<]+)<\/cbc:ContractModificationDurationMeasure>/);
          const durValor = durTag ? parseNullableNumber(durTag[2]) : null;
          const durUnidad = durTag ? durTag[1].toUpperCase() : null;

          let duracionDias = null;
          let duracionMeses = null;
          if (durValor != null && (durUnidad === 'DAY' || durUnidad === 'DAYS')) {
            duracionDias = durValor;
            duracionMeses = Math.round((durValor / 30) * 10) / 10;
          } else if (durValor != null && (durUnidad === 'MON' || durUnidad === 'MONTH' || durUnidad === 'MONTHS')) {
            duracionMeses = durValor;
            duracionDias = Math.round(durValor * 30);
          } else if (durValor != null && (durUnidad === 'ANN' || durUnidad === 'YEAR' || durUnidad === 'YEARS')) {
            duracionMeses = durValor * 12;
            duracionDias = Math.round(durValor * 365);
          }

          const docName = getTag(/<cbc:ID schemeName="ID_DOC_PLACE"[^>]*>([^<]+)<\/cbc:ID>/, modXml) || getTag(/<cbc:UUID[^>]*>([^<]+)<\/cbc:UUID>/, modXml);
          const docUri = cleanHtmlEntities(getTag(/<cbc:URI[^>]*>([^<]+)<\/cbc:URI>/, modXml)) || entryLink;

          const amountXmlMatch = modXml.match(/<cac:ContractModificationLegalMonetaryTotal>([\s\S]*?)<\/cac:ContractModificationLegalMonetaryTotal>/);
          const amountXml = amountXmlMatch ? amountXmlMatch[1] : '';
          const rawImporteMod = getTag(/<cbc:TaxExclusiveAmount[^>]*>([^<]+)<\/cbc:TaxExclusiveAmount>/, amountXml);
          const importeMod = parseNullableNumber(rawImporteMod);

          const finalAmountXmlMatch = modXml.match(/<cac:FinalLegalMonetaryTotal>([\s\S]*?)<\/cac:FinalLegalMonetaryTotal>/);
          const finalAmountXml = finalAmountXmlMatch ? finalAmountXmlMatch[1] : '';
          const rawImporteFinal = getTag(/<cbc:TaxExclusiveAmount[^>]*>([^<]+)<\/cbc:TaxExclusiveAmount>/, finalAmountXml);
          const importeFinal = parseNullableNumber(rawImporteFinal);

          let tipo = 'Modificación técnica';
          if (duracionDias > 0 && importeMod > 0) {
            tipo = 'Prórroga y ampliación presupuestaria';
          } else if (duracionDias > 0) {
            tipo = 'Ampliación de plazo';
          } else if (importeMod > 0) {
            tipo = 'Modificación presupuestaria (sobrecoste)';
          }

          const uniqueKey = `${licitacionId}|mod-${numero}`;

          modifications.push({
            id: uniqueKey,
            contract_id: licitacionId,
            contracting_authority_nif: authorityNif,
            contracting_authority_id: contractingAuthorityId,
            case_number: case_number || '',
            modification_number: numero,
            modification_date: document_date,
            reason,
            modification_type: tipo,
            duration_value: durValor,
            duration_unit: durUnidad,
            duration_months: duracionMeses,
            duration_days: duracionDias,
            modification_amount: importeMod,
            final_amount: importeFinal,
            document_url: docUri,
            document_name: docName
          });
        }
      }
      } catch (error) {
        fail(error);
      }
    });

    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    proc.on('close', (code, signal) => {
      if (settled) return;
      if (code !== 0) {
        fail(new Error(`No se pudo extraer ${path.basename(zipPath)} con unzip (exit=${code ?? 'null'}, signal=${signal ?? 'none'}).`));
        return;
      }
      settled = true;
      resolve(modifications);
    });
    proc.on('error', fail);
  });
}

function runInTransaction(db, operation) {
  db.exec('BEGIN TRANSACTION;');
  try {
    const result = operation();
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch {}
    throw error;
  }
}

function resolveModificationContract(db, modification) {
  if (!modification?.case_number) return null;
  const normalizedCaseNumber = normalizeIdentityPart(modification.case_number);
  const sourceCandidates = modification.contract_id
    ? db.prepare(
        'SELECT id, case_number FROM contracts WHERE contracting_authority_id = ? AND (placsp_id = ? OR placsp_id LIKE ?)'
      ).all(modification.contracting_authority_id, modification.contract_id, '%' + modification.contract_id)
        .filter(row => normalizeIdentityPart(row.case_number) === normalizedCaseNumber)
    : [];
  if (sourceCandidates.length === 1) return sourceCandidates[0].id;

  const authorityCandidates = db.prepare(
    'SELECT id, case_number FROM contracts WHERE contracting_authority_id = ?'
  ).all(modification.contracting_authority_id)
    .filter(row => normalizeIdentityPart(row.case_number) === normalizedCaseNumber);
  return authorityCandidates.length === 1 ? authorityCandidates[0].id : null;
}

async function main({ dbPath = DB_PATH, argv = process.argv, db: suppliedDb = null } = {}) {
  const db = suppliedDb || new DatabaseSync(dbPath);
  try {
  const targetRows = db.prepare('SELECT id, placsp_id, dir3, nif, name, historical_names_json FROM contracting_authorities WHERE active = 1').all();
  const targetAuthorities = buildTargetAuthorities(targetRows);
  if (targetRows.length === 0) throw new Error('No hay contracting_authorities actives en la BD. Ejecuta pnpm run init-db.');
  
  // Keep historical modifications already stored. The weekly workflow only
  // downloads the current-year tender package, so dropping this table would
  // silently erase modifications from previous years.
  db.exec(`
    CREATE TABLE IF NOT EXISTS modifications (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      case_number TEXT,
      modification_number INTEGER,
      modification_date TEXT,
      reason TEXT,
      modification_type TEXT,
      duration_value REAL,
      duration_unit TEXT,
      duration_months REAL,
      duration_days REAL,
      modification_amount REAL,
      final_amount REAL,
      document_url TEXT,
      document_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_modifications_contract_id ON modifications(contract_id);
    CREATE INDEX IF NOT EXISTS idx_modifications_case_number ON modifications(case_number);
  `);

  const yearArg = argv.find(a => a.startsWith('--year='));
  const requestedYear = yearArg ? yearArg.split('=')[1].trim() : null;
  const years = !requestedYear || requestedYear.toLowerCase() === 'all'
    ? ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018']
    : [requestedYear];
  if (years.some(year => !/^\d{4}$/.test(year))) {
    throw new Error(`Año inválido en --year: ${yearArg}`);
  }
  console.log(`🔄 Escaneando modifications (${years.join(', ')}) con soporte multiunidad (DAY/MON/ANN)...`);

  const insertStmt = db.prepare(`
    INSERT INTO modifications (
      id, contract_id, case_number, modification_number, modification_date,
      reason, modification_type, duration_value, duration_unit, duration_months, duration_days,
      modification_amount, final_amount, document_url, document_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      modification_date = case
        when modifications.modification_date is null then excluded.modification_date
        when excluded.modification_date is not null and excluded.modification_date < modifications.modification_date then excluded.modification_date
        else modifications.modification_date
      end,
      reason = coalesce(excluded.reason, modifications.reason),
      modification_type = case
        when coalesce(excluded.duration_days, modifications.duration_days) > 0
          and coalesce(excluded.modification_amount, modifications.modification_amount) > 0
          then 'Prórroga y ampliación presupuestaria'
        when coalesce(excluded.duration_days, modifications.duration_days) > 0
          then 'Ampliación de plazo'
        when coalesce(excluded.modification_amount, modifications.modification_amount) > 0
          then 'Modificación presupuestaria (sobrecoste)'
        else 'Modificación técnica'
      end,
      duration_value = coalesce(excluded.duration_value, modifications.duration_value),
      duration_unit = coalesce(excluded.duration_unit, modifications.duration_unit),
      duration_months = coalesce(excluded.duration_months, modifications.duration_months),
      duration_days = coalesce(excluded.duration_days, modifications.duration_days),
      modification_amount = coalesce(excluded.modification_amount, modifications.modification_amount),
      final_amount = coalesce(excluded.final_amount, modifications.final_amount),
      document_url = coalesce(excluded.document_url, modifications.document_url),
      document_name = coalesce(excluded.document_name, modifications.document_name)
  `);

  for (const yr of years) {
    const zipPaths = [
      path.join(RAW_DIR, `licitaciones${yr}.zip`),
      path.join(RAW_DIR, `contratosMenores${yr}.zip`)
    ].filter(fs.existsSync);

    for (const zipPath of zipPaths) {
      process.stdout.write(`   • Escaneando ${path.basename(zipPath)}... `);
      const mods = await extractModificationsFromZip(zipPath, targetAuthorities);
      console.log(`${mods.length} modifications encontradas.`);

      runInTransaction(db, () => {
        for (const m of mods) {
          if (!m.case_number) continue;
          const internalId = resolveModificationContract(db, m);
          if (!internalId) continue;
          m.contract_id = internalId;
          m.id = internalId + '|mod-' + m.modification_number;
          insertStmt.run(
            m.id,
            m.contract_id,
            m.case_number,
            m.modification_number,
            m.modification_date,
            m.reason,
            m.modification_type,
            m.duration_value,
            m.duration_unit,
            m.duration_months,
            m.duration_days,
            m.modification_amount,
            m.final_amount,
            m.document_url,
            m.document_name
          );
        }
      });
    }
  }

  const stats = db.prepare('SELECT count(*) as total, count(modification_date) as con_fecha FROM modifications').get();
  console.log(`\n✅ Proceso completado. Total registros en BD: ${stats.total}, con document_date: ${stats.con_fecha}`);
  } finally {
    if (!suppliedDb) db.close();
  }
  }

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { main, DB_PATH, resolveModificationContract, extractModificationsFromZip, runInTransaction, parseNullableNumber };
