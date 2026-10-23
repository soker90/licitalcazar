import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const {
  ensureSyncSchema,
  main,
  streamParseZip,
  ensureZipFilesForYear,
  runInTransaction,
  preserveSnapshotField,
  mergeLotAwardSnapshots,
  preserveMissingLotAwardData,
  reconcileSnapshotAwardCollections,
  parseNullableNumber,
  parseNullableInteger,
} = require('./sync.js');

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SYNC_PATH = path.resolve(import.meta.dirname, './sync.js');

describe('sync schema migration', () => {
  it('rolls back schema changes when a sync migration step fails', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE contracts (id TEXT PRIMARY KEY)');

    const originalExec = db.exec.bind(db);
    const failingDb = new Proxy(db, {
      get(target, property) {
        if (property === 'exec') {
          return (sql) => {
            if (sql.includes('ALTER TABLE contracts ADD COLUMN contracting_authority_id')) {
              throw new Error('forced sync schema failure');
            }
            return originalExec(sql);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    expect(() => ensureSyncSchema(failingDb)).toThrow('forced sync schema failure');
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'contracting_authorities'").get()).toBeUndefined();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'contract_lots'").get()).toBeUndefined();
    expect(db.prepare("PRAGMA table_info('contracts')").all().map((entry) => entry.name)).toEqual(['id']);
    db.close();
  });
});

describe('sync award collection reconciliation', () => {
  it('keeps omitted awardees when a partial snapshot updates another awardee in the same lot', () => {
    const previous = [
      { numeroLote: '1', awardIndex: 1, adjudicatario: 'Old A', importeSinIva: 100 },
      { numeroLote: '2', awardIndex: 1, adjudicatario: 'Old B', importeSinIva: 200 },
    ];
    const incoming = [
      { numeroLote: '1', awardIndex: 1, adjudicatario: 'New A', importeSinIva: 125 },
    ];

    expect(mergeLotAwardSnapshots(incoming, previous)).toEqual([
      { numeroLote: '1', awardIndex: 1, adjudicatario: 'Old A', importeSinIva: 100 },
      { numeroLote: '2', awardIndex: 1, adjudicatario: 'Old B', importeSinIva: 200 },
      { numeroLote: '1', awardIndex: 1, adjudicatario: 'New A', importeSinIva: 125 },
    ]);
  });

  it('preserves persisted lot award fields when the new lot structure omits that lot result', () => {
    const incoming = [
      { numeroLote: '1', importeAdjudicacion: 125, resultCode: '9', adjudicatario: 'New A' },
      { numeroLote: '2', importeAdjudicacion: null, resultCode: null, adjudicatario: null, estadoLote: 'Definido en pliegos' },
    ];
    const persisted = [
      { lot_number: '1', awarded_amount: 100, result_code: '9', awardee: 'Old A' },
      { lot_number: '2', awarded_amount: 200, awarded_amount_incl_vat: 242, result_code: '9', awardee: 'Old B', lot_status: 'Adjudicado', award_date: '2026-09-01', offer_count: 3 },
    ];

    expect(preserveMissingLotAwardData(incoming, persisted)).toEqual([
      incoming[0],
      {
        ...incoming[1],
        importeAdjudicacion: 200,
        importeAdjConIva: 242,
        adjudicatario: 'Old B',
        nifAdjudicatario: undefined,
        estadoLote: 'Adjudicado',
        fechaAdjudicacion: '2026-09-01',
        resultCode: '9',
        resultCodeListUri: undefined,
        numOfertas: 3,
      },
    ]);
  });

  it('retains a known lot and its amount when a partial structure omits that lot entirely', () => {
    const merged = preserveMissingLotAwardData(
      [{ numeroLote: '1', importeAdjudicacion: 125, resultCode: '9', adjudicatario: 'New A' }],
      [
        { lot_number: '1', awarded_amount: 100, result_code: '9', awardee: 'Old A' },
        { lot_number: '2', lot_name: 'Lote B', amount_excl_vat: 200, budget_excl_vat: 200, awarded_amount: 200, result_code: '9', awardee: 'Empresa B', lot_status: 'Adjudicado' },
      ]
    );

    expect(merged).toHaveLength(2);
    expect(merged.map((lot) => [lot.numeroLote, lot.importeAdjudicacion])).toEqual([
      ['1', 125],
      ['2', 200],
    ]);
    expect(merged.reduce((total, lot) => total + lot.importeAdjudicacion, 0)).toBe(325);
  });

  it('clears all old lot awards for an explicit contract-level no-award result', () => {
    expect(mergeLotAwardSnapshots(
      [{ numeroLote: '1', resultState: 'WITHDRAWN' }],
      [{ numeroLote: '1', resultState: 'AWARDED' }, { numeroLote: '2', resultState: 'AWARDED' }],
      true
    )).toEqual([]);
  });

  it('clears stale lot awards when a newer contract-level result cancels or deserts the contract', () => {
    const newerSnapshot = {
      contract_awards: [{ resultState: 'WITHDRAWN' }],
      lot_awards: [],
    };
    const olderSnapshot = {
      contract_awards: [{ resultState: 'AWARDED' }],
      lot_awards: [{ lotNumber: '1', resultState: 'AWARDED', awardedAmount: 1250 }],
    };

    const merged = reconcileSnapshotAwardCollections(newerSnapshot, olderSnapshot, true);

    expect(merged.contract_awards).toEqual([{ resultState: 'WITHDRAWN' }]);
    expect(merged.lot_awards).toEqual([]);
    expect(merged._clearLotAwards).toBe(true);
  });

  it('preserves previous lot awards when the newer snapshot simply omits tender results', () => {
    const newerSnapshot = { contract_awards: [], lot_awards: [] };
    const olderSnapshot = {
      contract_awards: [{ resultState: 'AWARDED' }],
      lot_awards: [{ lotNumber: '1', resultState: 'AWARDED', awardedAmount: 1250 }],
    };

    const merged = reconcileSnapshotAwardCollections(newerSnapshot, olderSnapshot, false);

    expect(merged.contract_awards).toEqual([{ resultState: 'AWARDED' }]);
    expect(merged.lot_awards).toEqual([{ lotNumber: '1', resultState: 'AWARDED', awardedAmount: 1250 }]);
    expect(merged._clearLotAwards).toBeUndefined();
  });
});

describe('sync awarded amount integrity', () => {
  it('does not infer an awarded amount from the base tender budget', () => {
    const source = fs.readFileSync(SYNC_PATH, 'utf8');
    expect(source).not.toContain("importe_adjudicacion = importe_sin_iva;");
    expect(source).toContain('La ausencia del importe de adjudicación no permite inferirlo del PBL');
  });
});

describe('sync contract identity', () => {
  it('normalizes absent snapshot fields to SQL NULL instead of undefined', () => {
    expect(preserveSnapshotField(undefined, undefined)).toBeNull();
    expect(preserveSnapshotField(undefined, null)).toBeNull();
    expect(preserveSnapshotField(null, 'stored')).toBe('stored');
    expect(preserveSnapshotField('incoming', null, true)).toBe('incoming');
  });

  it('binds missing snapshot fields safely and preserves stored values with COALESCE', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE contracts (value TEXT)');
    db.prepare('INSERT INTO contracts(value) VALUES (?)').run('stored');
    const update = db.prepare('UPDATE contracts SET value = coalesce(?, value)');
    expect(() => update.run(preserveSnapshotField(undefined, undefined))).not.toThrow();
    expect(db.prepare('SELECT value FROM contracts').get().value).toBe('stored');
    db.close();
  });

  it('fills only missing fields from older snapshots', () => {
    const source = fs.readFileSync(SYNC_PATH, 'utf8');
    expect(source).toContain('function preserveSnapshotField(incoming, current, allowIncomingSnapshot = true)');
    expect(source).toContain('return value === undefined ? null : value;');
    expect(source).toContain('current != null ? current : incoming');
  });

  it('allows newer snapshots to replace existing published fields', () => {
    const source = fs.readFileSync(SYNC_PATH, 'utf8');
    expect(source).toContain('const value = allowIncomingSnapshot');
    expect(source).toContain('(incoming != null ? incoming : current)');
    expect(source).toContain('return value === undefined ? null : value;');
  });

  it('replaces award amount classification only from newer snapshots', () => {
    const source = fs.readFileSync(SYNC_PATH, 'utf8');
    expect(source).toContain('allowIncomingSnapshot ? c.award_amount_type : existing.award_amount_type');
  });

  it('does not reference award_amount_type before its declaration', () => {
    const source = fs.readFileSync(SYNC_PATH, 'utf8');
    const declarationIndex = source.indexOf('  let award_amount_type = classifyAwardAmountType(');
    const preDeclarationAssignment = source.indexOf("award_amount_type = 'total';");

    expect(declarationIndex).toBeGreaterThanOrEqual(0);
    expect(preDeclarationAssignment).toBe(-1);
  });

  it('updates all published mutable contract fields incrementally', () => {
    const source = fs.readFileSync(SYNC_PATH, 'utf8');

    for (const field of [
      'contracting_authority_name',
      'contracting_authority_nif',
      'contracting_authority_dir3',
      'contracting_authority_city',
      'department',
      'location',
      'nuts',
      'duration',
      'duration_unit',
      'eu_funding',
      'urgency',
      'dataset',
      'scope',
    ]) {
      expect(source).toContain(`${field} = coalesce(?, ${field})`);
    }
  });

  it('normalizes expediente and authority before grouping incoming and existing contracts', () => {
    const source = fs.readFileSync(SYNC_PATH, 'utf8');

    expect(source).toContain("const key = normalizeIdentityPart(c.expediente) + '|' + normalizeIdentityPart(c.contracting_authority_id);");
    expect(source).toContain("existingByExp.set(`${normalizeIdentityPart(r.case_number)}|${normalizeIdentityPart(r.contracting_authority_id)}`, r);");
  });
});


describe('sync numeric parsing', () => {
  it('preserves explicit zero and distinguishes it from missing numeric values', () => {
    expect(parseNullableNumber('0')).toBe(0);
    expect(parseNullableNumber('0.00')).toBe(0);
    expect(parseNullableNumber('12,50')).toBe(12.5);
    expect(parseNullableNumber('12.5abc')).toBeNull();
    expect(parseNullableNumber(null)).toBeNull();
    expect(parseNullableNumber('')).toBeNull();

    expect(parseNullableInteger('0')).toBe(0);
    expect(parseNullableInteger('12')).toBe(12);
    expect(parseNullableInteger('12.0')).toBe(12);
    expect(parseNullableInteger('12,0')).toBe(12);
    expect(parseNullableInteger('12abc')).toBeNull();
    expect(parseNullableInteger(null)).toBeNull();
    expect(parseNullableInteger('')).toBeNull();
  });

  it('uses nullable numeric parsing for lot estimated values and offer counts', () => {
    const source = fs.readFileSync(SYNC_PATH, 'utf8');
    expect(source).toContain('const lotValorEstimado = parseNullableNumber(');
    expect(source).toContain('const lotNumOfertas = parseNullableInteger(');
  });
});


describe('sync feed extraction', () => {
  it('rejects when unzip exits with an error instead of treating the feed as empty', async () => {
    const dir = fs.mkdtempSync(path.join(import.meta.dirname, 'sync-zip-'));
    const invalidZip = path.join(dir, 'invalid.zip');
    fs.writeFileSync(invalidZip, 'not a zip archive');

    const spawnImpl = () => {
      const listeners = new Map();
      return {
        stdout: { on() {} },
        stderr: { on() {} },
        on(event, handler) {
          listeners.set(event, handler);
          if (event === 'close') queueMicrotask(() => handler(9, null));
          return this;
        },
      };
    };

    await expect(streamParseZip(invalidZip, 'licitaciones', {
      byPlacspId: new Map(),
      byDir3: new Map(),
      byNif: new Map(),
      searchNames: [],
    }, spawnImpl)).rejects.toThrow(/No se pudo extraer invalid\.zip con unzip/);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});


describe('PLACSP package download execution safety', () => {
  it('passes package URLs as curl arguments instead of interpolating them into a shell command', () => {
    const rawDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'sync-download-'));
    const calls = [];
    const execFileSyncImpl = (command, args) => {
      calls.push({ command, args });
      fs.writeFileSync(args[args.indexOf('-o') + 1], 'known-good-package');
    };

    ensureZipFilesForYear('2026', { download: true, execFileSyncImpl, rawDir });

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.command).toBe('curl');
      expect(call.args).toContain('-fL');
      expect(call.args).toContain('-o');
      expect(call.args).not.toContain('-k');
      expect(call.args.some((arg) => arg.includes('$(touch'))).toBe(false);
    }
    expect(calls[0].args).toContain('https://contrataciondelestado.es/sindicacion/sindicacion_1143/contratosMenoresPerfilesContratantes_2026.zip');
    expect(calls[1].args).toContain('https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3_2026.zip');
    fs.rmSync(rawDir, { recursive: true, force: true });
  });
});

describe('PLACSP package downloads', () => {
  it('--download refreshes an existing fresh cache', () => {
    const rawDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'sync-download-'));
    const target = path.join(rawDir, 'contratosMenores2026.zip');
    fs.writeFileSync(target, 'stale-cache');

    const calls = [];
    const execFileSyncImpl = (command, args) => {
      calls.push({ command, args });
      const outputIndex = args.indexOf('-o');
      fs.writeFileSync(args[outputIndex + 1], 'fresh-cache');
    };

    ensureZipFilesForYear('2026', {
      download: true,
      execFileSyncImpl,
      rawDir,
    });

    expect(calls).toHaveLength(2);
    expect(fs.readFileSync(target, 'utf8')).toBe('fresh-cache');
  });


  it('fails and removes the partial file when the official download fails', () => {
    const rawDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'sync-download-'));
    const execFileSyncImpl = () => {
      fs.writeFileSync(path.join(rawDir, `contratosMenores2026.zip.download-${process.pid}`), 'partial');
      throw new Error('curl exited with code 22');
    };
    expect(() => ensureZipFilesForYear('2026', { download: true, execFileSyncImpl, rawDir }))
      .toThrow(/No se pudo descargar contratosMenores2026\.zip/);
    expect(fs.existsSync(path.join(rawDir, 'contratosMenores2026.zip'))).toBe(false);
    expect(fs.existsSync(path.join(rawDir, `licitaciones2026.zip.download-${process.pid}`))).toBe(false);
    fs.rmSync(rawDir, { recursive: true, force: true });
  });

  it('preserves the existing cache when a refresh fails', () => {
    const rawDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'sync-download-'));
    const target = path.join(rawDir, 'licitaciones2026.zip');
    fs.writeFileSync(target, 'known-good-cache');
    expect(() => ensureZipFilesForYear('2026', {
      download: true,
      execFileSyncImpl: (command, args) => {
        const outputIndex = args.indexOf('-o');
        if (args[outputIndex + 1].includes('licitaciones2026.zip')) {
          fs.writeFileSync(args[outputIndex + 1], 'partial');
          throw new Error('curl exited with code 22');
        }
        fs.writeFileSync(args[outputIndex + 1], 'fresh-cache');
      },
      rawDir,
    })).toThrow(/No se pudo descargar licitaciones2026\.zip/);
    expect(fs.readFileSync(target, 'utf8')).toBe('known-good-cache');
    expect(fs.existsSync(path.join(rawDir, `contratosMenores2026.zip.download-${process.pid}`))).toBe(false);
    fs.rmSync(rawDir, { recursive: true, force: true });
  });
});



describe('sync database lifecycle', () => {
  it('closes the SQLite connection when startup fails', async () => {
    const db = new DatabaseSync(':memory:');
    const originalExec = db.exec.bind(db);
    let closed = false;
    const failingDb = new Proxy(db, {
      get(target, property) {
        if (property === 'exec') {
          return (sql) => {
            if (sql === 'BEGIN IMMEDIATE') throw new Error('forced startup failure');
            return originalExec(sql);
          };
        }
        if (property === 'close') {
          return () => {
            closed = true;
            return target.close();
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    await expect(main({ db: failingDb, argv: [], closeDb: true })).rejects.toThrow('forced startup failure');
    expect(closed).toBe(true);
  });
});

describe('sync persistence transaction', () => {
  it('rolls back all writes when a persistence operation fails', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE contracts (id TEXT PRIMARY KEY, value INTEGER NOT NULL);');

    expect(() => runInTransaction(db, () => {
      db.prepare('INSERT INTO contracts (id, value) VALUES (?, ?)').run('first', 1);
      db.prepare('INSERT INTO contracts (id, value) VALUES (?, ?)').run('second', 2);
      throw new Error('simulated persistence failure');
    })).toThrow('simulated persistence failure');

    expect(db.prepare('SELECT count(*) AS count FROM contracts').get().count).toBe(0);
    db.close();
  });

  it('commits writes when the persistence operation succeeds', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE contracts (id TEXT PRIMARY KEY, value INTEGER NOT NULL);');

    runInTransaction(db, () => {
      db.prepare('INSERT INTO contracts (id, value) VALUES (?, ?)').run('first', 1);
    });

    expect(db.prepare('SELECT count(*) AS count FROM contracts').get().count).toBe(1);
    db.close();
  });
});
