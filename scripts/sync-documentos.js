/**
 * Synchronizer for Official Tender Documents from PLACSP
 * 
 * Fetches attached public documents (reports, specifications, board minutes,
 * abnormality justification reports under Art. 149 LCSP) directly from PLACSP.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync, execSync } = require('node:child_process');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');

function initDocumentsTable(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS contract_documents (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        case_number TEXT,
        document_date TEXT,
        title TEXT NOT NULL,
        source_url TEXT NOT NULL,
        document_type TEXT,
        is_abnormally_low_bid_justification INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_contract_documents_contract_id ON contract_documents(contract_id);
      CREATE INDEX IF NOT EXISTS idx_contract_documents_abnormality ON contract_documents(is_abnormally_low_bid_justification);
    `);

    let cols = db.prepare('PRAGMA table_info(contracts)').all().map(c => c.name);
    if (!cols.includes('updated_at')) {
      db.exec('ALTER TABLE contracts ADD COLUMN updated_at TEXT;');
      db.exec('CREATE INDEX IF NOT EXISTS idx_contracts_updated_at ON contracts(updated_at);');
      cols = [...cols, 'updated_at'];
    }
    if (!cols.includes('documents_synced_at')) {
      db.exec('ALTER TABLE contracts ADD COLUMN documents_synced_at TEXT;');
      db.exec('CREATE INDEX IF NOT EXISTS idx_contracts_documents_synced_at ON contracts(documents_synced_at);');
      cols = [...cols, 'documents_synced_at'];
    }
    if (!cols.includes('documents_empty_confirmation_count')) {
      db.exec('ALTER TABLE contracts ADD COLUMN documents_empty_confirmation_count INTEGER NOT NULL DEFAULT 0;');
      db.exec('CREATE INDEX IF NOT EXISTS idx_contracts_documents_empty_confirmation_count ON contracts(documents_empty_confirmation_count);');
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function classifyDocument(title) {
  const normalized = (title || '').toLowerCase();

  const isAbnormalityJustification = /(anormal|temerar|justifica.*(?:oferta|precio|econom)|viabilidad.*econ|art\.?\s*149)/i.test(normalized);

  let docType = 'OTROS';
  if (isAbnormalityJustification) {
    docType = 'INFORME_ANORMALIDAD';
  } else if (/(pliego|pcap|ppt|prescripci|cl[aá]usul)/i.test(normalized)) {
    docType = 'PLIEGO';
  } else if (/(acta.*mesa|sesi[oó]n.*mesa|mesa.*contratac)/i.test(normalized)) {
    docType = 'ACTA_MESA';
  } else if (/(informe|memoria|juicio.*valor|criterio|insuficiencia.*medio)/i.test(normalized)) {
    docType = 'INFORME_TECNICO';
  } else if (/(resoluci|decreto|adjudicaci|acuerdo|formalizaci)/i.test(normalized)) {
    docType = 'RESOLUCION';
  }

  return {
    document_type: docType,
    tipo_documento: docType,
    is_abnormally_low_bid_justification: isAbnormalityJustification ? 1 : 0,
    es_justificacion_anormalidad: isAbnormalityJustification ? 1 : 0
  };
}

function cleanHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&#243;/g, 'ó')
    .replace(/&#225;/g, 'á')
    .replace(/&#233;/g, 'é')
    .replace(/&#237;/g, 'í')
    .replace(/&#250;/g, 'ú')
    .replace(/&#241;/g, 'ñ')
    .replace(/&#170;/g, 'ª')
    .replace(/&#186;/g, 'º')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#xD;/g, ' ')
    .replace(/&#10;/g, ' ')
    .trim();
}

function countDocumentRowsWithLinks(html) {
  if (!html) return 0;
  const rows = [...html.matchAll(/<tr[^>]*class="(?:rowClass1|rowClass2)"[^>]*>([\s\S]*?)<\/tr>/g)];
  return rows.filter((row) => /GetDocumentByIdServlet/.test(row[1])).length;
}

function parseDocumentsFromHtml(html, licitacionId, case_number) {
  if (!html) return [];
  const rows = [...html.matchAll(/<tr[^>]*class="(?:rowClass1|rowClass2)"[^>]*>([\s\S]*?)<\/tr>/g)];
  const documents = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const tr = rows[idx][1];
    const dateMatch = tr.match(/<span[^>]*textSfecha1PadreGen[^>]*>([\s\S]*?)<\/span>/);
    const typeMatch = tr.match(/<span[^>]*textStipo1PadreGen[^>]*>([\s\S]*?)<\/span>/);
    const linkMatch = tr.match(/<a[^>]*href="([^"]+GetDocumentByIdServlet[^"]+)"/);

    if (typeMatch && linkMatch) {
      const rawTitle = typeMatch[1].trim();
      const cleanTitle = cleanHtmlEntities(rawTitle);
      const cleanUrl = linkMatch[1].replace(/&amp;/g, '&');
      const document_date = dateMatch ? cleanHtmlEntities(dateMatch[1]) : null;
      const { document_type, is_abnormally_low_bid_justification } = classifyDocument(cleanTitle);

      const docId = `${licitacionId}_doc_${idx + 1}`;

      documents.push({
        id: docId,
        contract_id: licitacionId,
        case_number: case_number || null,
        document_date,
        title: cleanTitle,
        url: cleanUrl,
        document_type,
        is_abnormally_low_bid_justification
      });
    }
  }

  return documents;
}

function fetchContractHtml(url, maxAttempts = 3, execFileSyncImpl = execFileSync, execSyncImpl = execSync) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const stdout = execFileSyncImpl('curl', [
        '-s', '--fail', url, '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        '-L', '--max-time', '15'
      ], {
        maxBuffer: 10 * 1024 * 1024
      });
      const html = stdout.toString('utf8');
      const explicitEmptySnapshot = /no\s+(?:hay|existen)\s+documentos/i.test(html);
      if (html.length >= 5000 || explicitEmptySnapshot) {
        return { html, error: null, attempts: attempt };
      }
      lastError = new Error(`respuesta HTML demasiado corta (${html.length} bytes)`);
    } catch (err) {
      lastError = err;
    }

    if (attempt < maxAttempts) {
      const delayMs = attempt * 1500;
      execSyncImpl(`sleep ${delayMs / 1000}`);
    }
  }

  return {
    html: null,
    error: lastError?.message || 'curl failed',
    attempts: maxAttempts
  };
}

function inspectDocumentForAbnormality(doc, execFileSyncImpl = execFileSync) {
  if (doc.is_abnormally_low_bid_justification) return doc;
  const normalized = (doc.title || '').toLowerCase();
  if (/(acta|actos p[uú]blicos|resoluci|decreto|informe)/i.test(normalized)) {
    const tmpPdf = path.resolve('/tmp', `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.pdf`);
    const tmpTxt = tmpPdf.replace('.pdf', '.txt');
    try {
      execFileSyncImpl('curl', ['-s', '--fail', doc.url, '-A', 'Mozilla/5.0', '-L', '-o', tmpPdf, '--max-time', '8'], { stdio: 'ignore' });
      execFileSyncImpl('pdftotext', [tmpPdf, tmpTxt], { stdio: 'ignore' });
      if (fs.existsSync(tmpTxt)) {
        const txt = fs.readFileSync(tmpTxt, 'utf-8');

        const hasJustification = /(anormalmente baja|justificaci[oó]n.*oferta.*anormal|viabilidad.*econ[oó]mica|art\.?\s*149\.?4)/i.test(txt);
        const hasAcceptance = /(admis[ioó]n.*oferta|justificaci[oó]n.*resulta adecuada|acuerda.*admitir|propuesta.*adjudicaci[oó]n)/i.test(txt);

        if (hasJustification && hasAcceptance) {
          const isActosPublicos = doc.title.includes('Actos públicos');
          return {
            ...doc,
            document_type: 'INFORME_ANORMALIDAD',
            is_abnormally_low_bid_justification: 1,
            title: isActosPublicos
              ? 'Acta de la Mesa: Justificación y admisión de oferta económica (Art. 149.4 LCSP)'
              : doc.title
          };
        }
      }
    } catch {
      // Ignore inspection errors
    } finally {
      for (const tempPath of [tmpPdf, tmpTxt]) {
        try {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch {}
      }
    }
  }
  return doc;
}

async function syncDocumentsForContract(db, contract, fetcher = fetchContractHtml) {
  if (!contract || !contract.url || !contract.url.startsWith('http')) {
    return { docs: [], networkError: false, emptyPage: false };
  }

  const { html, error, attempts } = fetcher(contract.url);
  if (!html) {
    // Do not advance documents_synced_at on a failed fetch: the contract
    // must remain eligible for the next incremental retry.
    return { docs: [], networkError: true, emptyPage: true, errorMsg: error, attempts };
  }

  const docs = parseDocumentsFromHtml(html, contract.id, contract.case_number);
  const documentRowsWithLinks = countDocumentRowsWithLinks(html);
  if (documentRowsWithLinks > docs.length) {
    return {
      docs: [],
      networkError: false,
      emptyPage: true,
      errorMsg: `Snapshot documental incompleto: ${documentRowsWithLinks} filas con enlace, ${docs.length} documentos parseados`,
      attempts
    };
  }
  const hasDocumentSectionMarker =
    html.includes('textStipo1PadreGen') ||
    html.includes('textSfecha1PadreGen') ||
    html.includes('GetDocumentByIdServlet') ||
    /no\s+(?:hay|existen)\s+documentos/i.test(html);
  const emptyPage = docs.length === 0 && (!hasDocumentSectionMarker || (html.length < 5000 && !/no\s+(?:hay|existen)\s+documentos/i.test(html)));
  if (emptyPage) {
    // A long HTML response without a recognizable PLACSP document section is
    // not considered a successful empty snapshot: it may be an error page or
    // a changed upstream HTML layout, and must not erase known documents.
    return { docs: [], networkError: false, emptyPage: true, errorMsg: 'HTML sin sección documental PLACSP reconocible', attempts };
  }

  const explicitEmptySnapshot = docs.length === 0 && /no\s+(?:hay|existen)\s+documentos/i.test(html);
  if (explicitEmptySnapshot) {
    const current = db.prepare('SELECT documents_empty_confirmation_count FROM contracts WHERE id = ?').get(contract.id);
    const confirmations = Number(current?.documents_empty_confirmation_count || 0) + 1;
    if (confirmations < 2) {
      db.prepare('UPDATE contracts SET documents_empty_confirmation_count = ? WHERE id = ?').run(confirmations, contract.id);
      return {
        docs: [],
        networkError: false,
        emptyPage: true,
        pendingEmptyConfirmation: true,
        errorMsg: 'Snapshot vacío pendiente de segunda confirmación',
        attempts
      };
    }
  } else {
    db.prepare('UPDATE contracts SET documents_empty_confirmation_count = 0 WHERE id = ?').run(contract.id);
  }

  // If no document was identified as abnormality justification by title alone,
  // inspect candidate documents (actas, board decisions)
  const hasAbnormalityDoc = docs.some(d => d.is_abnormally_low_bid_justification === 1);
  if (!hasAbnormalityDoc) {
    // Check in reverse chronological order (latest actas first)
    for (let i = docs.length - 1; i >= 0; i--) {
      const inspected = inspectDocumentForAbnormality(docs[i]);
      if (inspected.is_abnormally_low_bid_justification === 1) {
        docs[i] = inspected;
        break;
      }
    }
  }

  // The successful PLACSP page is the complete source for this contract.
  // Replace the previous snapshot atomically so a failed insert cannot leave
  // the database with a partial document set.
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM contract_documents WHERE contract_id = ?').run(contract.id);

    const insertStmt = db.prepare(`
      INSERT INTO contract_documents (
        id, contract_id, case_number, document_date, title, source_url, document_type, is_abnormally_low_bid_justification
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const doc of docs) {
      insertStmt.run(
        doc.id,
        doc.contract_id,
        doc.case_number,
        doc.document_date,
        doc.title,
        doc.url,
        doc.document_type,
        doc.is_abnormally_low_bid_justification
      );
    }

    // Only mark the contract as synchronized after a complete successful fetch.
    db.prepare("UPDATE contracts SET documents_synced_at = datetime('now'), documents_empty_confirmation_count = 0 WHERE id = ?").run(contract.id);
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }

  return { docs, networkError: false, emptyPage: false, attempts };
}

function resolveTargetContract(db, targetId) {
  const exact = db.prepare(
    'SELECT id, case_number, source_url AS url FROM contracts WHERE id = ?'
  ).get(targetId);
  if (exact) return exact;

  const candidates = db.prepare(
    'SELECT id, case_number, source_url AS url FROM contracts WHERE id LIKE ? OR case_number LIKE ?'
  ).all('%' + targetId + '%', '%' + targetId + '%');
  if (candidates.length > 1) {
    throw new Error('El término "' + targetId + '" coincide con ' + candidates.length + ' contratos; usa el ID interno exacto.');
  }
  return candidates[0] || null;
}

function assertDocumentSyncComplete({ allMode, networkErrors, suspiciousEmptyPages = 0 }) {
  if (allMode && networkErrors > 0) {
    throw new Error(`Document sync incomplete: ${networkErrors} contract(s) failed to download from PLACSP`);
  }
  if (allMode && suspiciousEmptyPages > 0) {
    throw new Error(`Document sync incomplete: ${suspiciousEmptyPages} contract(s) returned an invalid or incomplete document page from PLACSP`);
  }
}

function buildIncrementalContractsQuery(limit = null) {
  const limitSql = Number.isInteger(limit) && limit > 0 ? ` LIMIT ${limit}` : '';
  return `
      SELECT DISTINCT l.id, l.case_number, l.source_url AS url 
      FROM contracts l
      WHERE l.source_url IS NOT NULL AND l.source_url LIKE 'http%'
        AND (l.procedure IS NULL OR l.procedure NOT IN ('Contrato menor', 'Menor'))
        AND (
          l.documents_synced_at IS NULL
          OR (l.updated_at IS NOT NULL AND l.updated_at > l.documents_synced_at)
        )
      ORDER BY l.year DESC, coalesce(l.updated_at, l.publication_date) DESC
      ${limitSql}
    `;
}

async function main({ dbPath = DB_PATH, argv = process.argv, db: suppliedDb = null } = {}) {
  const db = suppliedDb || new DatabaseSync(dbPath);
  try {
    initDocumentsTable(db);

    const targetIdArg = argv.find(a => a.startsWith('--id='));
    const targetId = targetIdArg ? targetIdArg.split('=')[1].trim() : null;

    const allArg = argv.includes('--all');

    if (targetId) {
      console.log(`🔍 Sincronizando documentos para el contrato con ID o término: ${targetId}...`);
      let contract;
      try {
        contract = resolveTargetContract(db, targetId);
      } catch (err) {
        console.error(`❌ ${err.message}`);
        process.exitCode = 1;
        return;
      }
      if (!contract) {
        console.error(`❌ No se encontró contrato para "${targetId}"`);
        process.exitCode = 1;
        return;
      }
      const result = await syncDocumentsForContract(db, contract);
      if (result.networkError) {
        console.error(`❌ Error al sincronizar documentos: ${result.errorMsg || 'fallo de red'}`);
        process.exitCode = 1;
        return;
      }
      if (result.emptyPage) {
        console.error(`❌ PLACSP devolvió una respuesta vacía o sospechosamente corta: ${result.errorMsg || 'sin documentos'}`);
        process.exitCode = 1;
        return;
      }
      const { docs } = result;
      console.log(`✅ ${docs.length} documentos procesados para case_number: ${contract.case_number}`);
      docs.forEach(d => {
        console.log(`   • [${d.document_type}${d.is_abnormally_low_bid_justification ? ' 🟢 ANORMALIDAD' : ''}] ${d.title} (${d.document_date || 'Sin document_date'})`);
      });
      return;
    }

    const bajasArg = argv.includes('--bajas');
    const sinDocsArg = argv.includes('--sin-docs') || argv.includes('--sin-documentos');
    const limitArg = argv.find(a => a.startsWith('--limit='));
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
    const limitSql = limit ? ` LIMIT ${limit}` : '';

    let contractsQuery = '';
    if (allArg) {
      console.log('📦 Modo COMPLETO: Sincronizando documentos de todas las contracts públicas...');
      contractsQuery = `SELECT id, case_number, source_url AS url FROM contracts WHERE source_url IS NOT NULL AND source_url LIKE 'http%'${limitSql}`;
    } else if (sinDocsArg) {
      console.log('📦 Modo SIN DOCUMENTOS: Sincronizando expedientes (menores y no menores) que aún no tienen ningún documento...');
      contractsQuery = `
        SELECT DISTINCT l.id, l.case_number, l.source_url AS url 
        FROM contracts l
        WHERE l.source_url IS NOT NULL AND l.source_url LIKE 'http%'
          AND l.id NOT IN (SELECT DISTINCT contract_id FROM contract_documents)
        ORDER BY l.year DESC, coalesce(l.updated_at, l.publication_date) DESC
        ${limitSql}
      `;
    } else if (bajasArg) {
      console.log('📦 Modo BAJAS: Sincronizando contracts con alerta de Baja Acusada...');
      contractsQuery = `
        SELECT DISTINCT l.id, l.case_number, l.source_url AS url 
        FROM contracts l
        JOIN alert_contracts ac ON l.id = ac.contract_id
        JOIN alerts a ON ac.alert_id = a.id
        WHERE a.type = 'BAJA_ACUSADA' AND l.source_url IS NOT NULL AND l.source_url LIKE 'http%'
        ${limitSql}
      `;
    } else {
      console.log('📦 Modo INCREMENTAL: Sincronizando expedientes nuevos o modificados en PLACSP...');
      contractsQuery = buildIncrementalContractsQuery(limit);
    }

    const contracts = db.prepare(contractsQuery).all();
    console.log(`🎯 Contratos a procesar: ${contracts.length}`);

    let totalDocsFound = 0;
    let totalAbnormalityReports = 0;
    let processed = 0;
    let networkErrors = 0;
    let emptyPages = 0;
    let suspiciousEmptyPages = 0;
    let pendingEmptyPages = 0;
    const networkErrorSamples = [];
    const failedContracts = [];

    for (const c of contracts) {
      processed++;
      process.stdout.write(`\r[${processed}/${contracts.length}] Procesando ${c.case_number || c.id.slice(-8)}... `);
      const result = await syncDocumentsForContract(db, c);
      const { docs, networkError, emptyPage, pendingEmptyConfirmation, errorMsg, attempts } = result;
      totalDocsFound += docs.length;

      if (networkError) {
        networkErrors++;
        failedContracts.push({ id: c.id, case_number: c.case_number, url: c.url, error: errorMsg, attempts });
        if (networkErrorSamples.length < 5) {
          networkErrorSamples.push({ case_number: c.case_number, url: c.url, error: errorMsg, attempts });
        }
        // Print warning every 10 consecutive network errors
        if (networkErrors % 10 === 0) {
          console.log(`\n   ⚠️  ${networkErrors} fallos de red acumulados. Último: ${c.case_number} — ${errorMsg}`);
        }
      }

      if (emptyPage) emptyPages++;
      if (pendingEmptyConfirmation) pendingEmptyPages++;
      if (emptyPage && !pendingEmptyConfirmation) suspiciousEmptyPages++;

      const abnormalityCount = docs.filter(d => d.is_abnormally_low_bid_justification === 1).length;
      totalAbnormalityReports += abnormalityCount;
      if (abnormalityCount > 0) {
        console.log(`\n   🟢 Encontrado informe de anormalidad en case_number ${c.case_number}!`);
      }
    }

    console.log('\n\n═══════════════════════════════════════════════════════════════════');
    console.log(`✅ Sincronización documental completada:`);
    console.log(`   • Total documentos indexados: ${totalDocsFound}`);
    console.log(`   • Informes de justificación de anormalidad identificados: ${totalAbnormalityReports}`);
    console.log(`   • Fallos de red (curl timeout/error): ${networkErrors}`);
    console.log(`   • Páginas vacías/sospechosas: ${emptyPages}`);
    console.log(`   • Vacíos explícitos pendientes de segunda confirmación: ${pendingEmptyPages}`);
    console.log(`   • Contratos pendientes de reintento incremental: ${failedContracts.length}`);
    if (networkErrorSamples.length > 0) {
      console.log('\n   Primeros fallos de red:');
      for (const s of networkErrorSamples) {
        console.log(`     - ${s.case_number}: ${s.error} (intentos: ${s.attempts || 3})`);
        console.log(`       ${s.url}`);
      }
    }
    console.log('═══════════════════════════════════════════════════════════════════');

    assertDocumentSyncComplete({ allMode: allArg, networkErrors, suspiciousEmptyPages });
  } finally {
    if (!suppliedDb) db.close();
  }
}
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error in sync-documentos:', err);
    process.exitCode = 1;
  });
}

module.exports = {
  initDocumentsTable,
  classifyDocument,
  parseDocumentsFromHtml,
  countDocumentRowsWithLinks,
  syncDocumentsForContract,
  resolveTargetContract,
  fetchContractHtml,
  inspectDocumentForAbnormality,
  assertDocumentSyncComplete,
  buildIncrementalContractsQuery,
  main
};
