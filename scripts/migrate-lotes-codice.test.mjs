import { afterEach, describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { collectLotAwards, processZipFile, LOTES_CACHE_VERSION, applyLotDataToDb } = require('./migrate-lotes-codice.js');
const { DatabaseSync } = require('node:sqlite');

describe('migrate-lotes-codice multiadjudication', () => {
  it('preserves multiple TenderResult for the same lot without duplicating feed versions', () => {
    const awards = new Map();
    const results = [
      { numeroLote: '1', adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: 100, importeConIva: 121, fechaAdjudicacion: '2026-01-01', resultCode: '8', resultCodeListUri: 'u' },
      { numeroLote: '1', adjudicatario: 'MENGANITO', nifAdjudicatario: 'B2', importeSinIva: 120, importeConIva: 145.2, fechaAdjudicacion: '2026-01-01', resultCode: '8', resultCodeListUri: 'u' },
      { numeroLote: '1', adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: 100, importeConIva: 121, fechaAdjudicacion: '2026-01-01', resultCode: '8', resultCodeListUri: 'u' },
    ];

    collectLotAwards(awards, results);

    expect(awards).toHaveLength(2);
    expect([...awards.values()].map(a => a.adjudicatario)).toEqual(['ACME', 'MENGANITO']);
  });
});


describe('migrate-lotes-codice integración de adjudicaciones', () => {
  it('integra las adjudicaciones TenderResult en la colección persistible por lote', async () => {
    const fs = await import('node:fs/promises');
    const source = await fs.readFile(new URL('./migrate-lotes-codice.js', import.meta.url), 'utf8');
    expect(source).toContain('collectLotAwards(expRecord.lotAwards, entry.tenderResults);');
  });
});


const tempDirs = [];
function makeZipPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'licitalcazar-lotes-'));
  tempDirs.push(dir);
  const zipPath = path.join(dir, 'input.zip');
  fs.writeFileSync(zipPath, 'fake zip');
  return zipPath;
}

function fakeChild({ code = 0, chunks = [], error = null }) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  queueMicrotask(() => {
    for (const chunk of chunks) child.stdout.emit('data', Buffer.from(chunk));
    if (error) child.emit('error', error);
    else child.emit('close', code, null);
  });
  return child;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('migrate-lotes-codice ZIP extraction', () => {
  it('rejects a non-zero unzip exit even if it emitted partial valid XML', async () => {
    const zipPath = makeZipPath();
    const entry = '<entry><id>source-1</id><cbc:ContractFolderID>15/2024</cbc:ContractFolderID><cbc:CompanyID>B12345678</cbc:CompanyID></entry>';

    await expect(processZipFile(
      zipPath,
      ['B12345678'],
      () => fakeChild({ code: 2, chunks: [entry] }),
    )).rejects.toThrow(/unzip falló.*código 2/);
  });

  it('rejects spawn errors instead of treating them as an empty successful archive', async () => {
    const zipPath = makeZipPath();

    await expect(processZipFile(
      zipPath,
      ['B12345678'],
      () => fakeChild({ error: new Error('spawn failed') }),
    )).rejects.toThrow('spawn failed');
  });

  it('bumps the cache version so caches from silent partial extractions are rebuilt', () => {
    expect(LOTES_CACHE_VERSION).toBe(5);
  });
});


function makeLotMigrationDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE contracts (
      id TEXT PRIMARY KEY,
      case_number TEXT,
      object_description TEXT,
      procedure TEXT,
      is_lotized INTEGER DEFAULT 0,
      lot_count INTEGER DEFAULT 1,
      lots_source TEXT
    );
    CREATE TABLE contract_lots (
      id TEXT PRIMARY KEY, contract_id TEXT, case_number TEXT, lot_number TEXT, lot_name TEXT,
      amount_excl_vat REAL, amount_incl_vat REAL, estimated_value REAL, awardee TEXT, awardee_nif TEXT,
      lot_status TEXT, award_date TEXT, cpv TEXT, budget_excl_vat REAL, budget_incl_vat REAL,
      awarded_amount REAL, awarded_amount_incl_vat REAL, offer_count INTEGER,
      result_code TEXT, result_code_list_uri TEXT
    );
    CREATE TABLE lot_awards (
      id TEXT PRIMARY KEY, contract_id TEXT, case_number TEXT, lot_number TEXT, award_index INTEGER,
      awardee TEXT, awardee_nif TEXT, awarded_amount REAL, awarded_amount_incl_vat REAL,
      offer_count INTEGER, award_date TEXT, result_code TEXT, result_code_list_uri TEXT,
      result_state TEXT, description TEXT
    );
    INSERT INTO contracts (id, case_number, object_description, procedure, is_lotized, lot_count, lots_source)
    VALUES ('ctr-1', '1/2026 Servicios', 'Servicio por lotes', 'Abierto', 0, 1, NULL);
    INSERT INTO lot_awards (id, contract_id, case_number, lot_number, award_index, awardee, result_code)
    VALUES ('old-award', 'ctr-1', '1/2026 Servicios', '1', 1, 'Adjudicatario antiguo', 'old-code');
  `);
  return db;
}

function makeLotSnapshot() {
  const makeLot = (numeroLote) => ({
    numeroLote,
    nombreLote: `Lote ${numeroLote}`,
    importeSinIva: 100 * Number(numeroLote),
    importeConIva: 121 * Number(numeroLote),
    valorEstimado: 150 * Number(numeroLote),
    adjudicatario: 'Empresa nueva',
    nifAdjudicatario: 'B12345678',
    estadoLote: 'Adjudicado',
    importeAdjudicacion: 100 * Number(numeroLote),
    importeAdjConIva: 121 * Number(numeroLote),
    fechaAdjudicacion: '2026-01-01',
    cpv: '45000000',
    numOfertas: 2,
    resultCode: '2.04',
    resultCodeListUri: 'https://example.test/codice/2.04',
  });
  const lots = new Map([['1', makeLot('1')], ['2', makeLot('2')]]);
  const lotAwards = new Map([['award-1', {
    numeroLote: '1',
    adjudicatario: 'Empresa nueva',
    nifAdjudicatario: 'B12345678',
    importeSinIva: 100,
    importeConIva: 121,
    numOfertas: 2,
    fechaAdjudicacion: '2026-01-01',
    resultCode: '2.04',
    resultCodeListUri: 'https://example.test/codice/2.04',
    resultState: 'Adjudicado',
    descripcion: 'Adjudicación nueva',
  }]]);
  return new Map([['1/2026 Servicios', { origin: 'CODICE_ESTRUCTURADO', lots, lotAwards }]]);
}

describe('migrate-lotes-codice database transaction', () => {
  it('updates contract lots and awards together on success', () => {
    const db = makeLotMigrationDb();
    try {
      const contracts = db.prepare('SELECT id, case_number AS expediente, object_description AS objeto, procedure FROM contracts').all();
      const result = applyLotDataToDb(db, contracts, makeLotSnapshot());

      expect(result).toEqual({ updatedMultilot: 1, totalLotesInserted: 2 });
      expect(db.prepare('SELECT is_lotized, lot_count, lots_source FROM contracts WHERE id = ?').get('ctr-1'))
        .toEqual({ is_lotized: 1, lot_count: 2, lots_source: 'CODICE_ESTRUCTURADO' });
      expect(db.prepare('SELECT count(*) AS count FROM contract_lots WHERE contract_id = ?').get('ctr-1').count).toBe(2);
      expect(db.prepare('SELECT awardee, result_code FROM lot_awards WHERE contract_id = ?').get('ctr-1'))
        .toEqual({ awardee: 'Empresa nueva', result_code: '2.04' });
    } finally {
      db.close();
    }
  });

  it.each(['Anulada', 'Cancelled', 'Canceled', 'Annulled', 'Withdrawn'])('does not persist awarded amounts or winners for terminal lot status %s', (terminalStatus) => {
    const db = makeLotMigrationDb();
    try {
      const contracts = db.prepare('SELECT id, case_number AS expediente, object_description AS objeto, procedure FROM contracts').all();
      const snapshot = makeLotSnapshot();
      const record = snapshot.get('1/2026 Servicios');
      record.lots.set('2', {
        ...record.lots.get('2'),
        estadoLote: terminalStatus,
        adjudicatario: 'Empresa retirada',
        nifAdjudicatario: 'B12345678',
        importeAdjudicacion: 500,
        importeAdjConIva: 605,
      });

      applyLotDataToDb(db, contracts, snapshot);

      expect(db.prepare(`SELECT lot_status, awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat
        FROM contract_lots WHERE contract_id = ? AND lot_number = '2'`).get('ctr-1')).toEqual({
        lot_status: terminalStatus,
        awardee: null,
        awardee_nif: null,
        awarded_amount: null,
        awarded_amount_incl_vat: null,
      });
    } finally {
      db.close();
    }
  });

  it('rolls back parent updates and award replacement if a lot insert fails', () => {
    const db = makeLotMigrationDb();
    db.exec(`
      CREATE TRIGGER reject_lot_insert
      BEFORE INSERT ON contract_lots
      BEGIN
        SELECT RAISE(ABORT, 'forced lot insert failure');
      END;
    `);

    try {
      const contracts = db.prepare('SELECT id, case_number AS expediente, object_description AS objeto, procedure FROM contracts').all();
      expect(() => applyLotDataToDb(db, contracts, makeLotSnapshot())).toThrow(/forced lot insert failure/);

      expect(db.prepare('SELECT is_lotized, lot_count, lots_source FROM contracts WHERE id = ?').get('ctr-1'))
        .toEqual({ is_lotized: 0, lot_count: 1, lots_source: null });
      expect(db.prepare('SELECT id, awardee, result_code FROM lot_awards WHERE contract_id = ?').all('ctr-1'))
        .toEqual([{ id: 'old-award', awardee: 'Adjudicatario antiguo', result_code: 'old-code' }]);
      expect(db.prepare('SELECT count(*) AS count FROM contract_lots WHERE contract_id = ?').get('ctr-1').count).toBe(0);
    } finally {
      db.close();
    }
  });
});
