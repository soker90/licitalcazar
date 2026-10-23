import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const SYNC_PATH = path.resolve(process.cwd(), 'scripts/sync-modificaciones.js');
const { resolveModificationContract, extractModificationsFromZip, runInTransaction, parseNullableNumber } = require('./sync-modificaciones.js');

describe('sync-modificaciones CLI resource lifecycle', () => {
  it('keeps database work behind the CLI entry point when imported', () => {
    const source = fs.readFileSync(SYNC_PATH, 'utf8');
    expect(source).toContain('if (require.main === module)');
    expect(source).toContain('module.exports = { main, DB_PATH');
    expect(source).not.toMatch(/\nmain\(\)\.catch\(err =>/);
    expect(source).toContain('if (!suppliedDb) db.close();');
  });

  it('keeps an injected database owned by the caller after a precondition failure', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE contracting_authorities (id TEXT, placsp_id TEXT, dir3 TEXT, nif TEXT, name TEXT, historical_names_json TEXT, active INTEGER);');
    await expect(require('./sync-modificaciones.js').main({ db, argv: [] }))
      .rejects.toThrow(/No hay contracting_authorities actives/);
    expect(db.prepare('SELECT count(*) AS n FROM contracting_authorities').get().n).toBe(0);
    db.close();
  });
});
describe('sync-modificaciones numeric parsing', () => {
  it('uses strict numeric parsing for modification values', () => {
    expect(parseNullableNumber('0')).toBe(0);
    expect(parseNullableNumber('12.50')).toBe(12.5);
    expect(parseNullableNumber('12,50')).toBe(12.5);
    expect(parseNullableNumber('12.5abc')).toBeNull();
    expect(parseNullableNumber(null)).toBeNull();
    const source = fs.readFileSync(SYNC_PATH, 'utf8');
    expect(source).toContain('const durValor = durTag ? parseNullableNumber(durTag[2]) : null;');
    expect(source).toContain('const importeMod = parseNullableNumber(rawImporteMod);');
    expect(source).toContain('const importeFinal = parseNullableNumber(rawImporteFinal);');
  });
});

describe('sync-modificaciones contract matching', () => {
  it('matches a modification when case-number whitespace differs', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        case_number TEXT,
        contracting_authority_id TEXT,
        placsp_id TEXT
      );
      INSERT INTO contracts VALUES
        ('ctr-1', ' 1/2026   Servicios ', 'auth-1', 'placsp-123');
    `);

    expect(resolveModificationContract(db, {
      case_number: '1/2026 Servicios',
      contracting_authority_id: 'auth-1',
      contract_id: 'placsp-123',
    })).toBe('ctr-1');
  });

  it('does not mix authorities when the same normalized case exists twice', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        case_number TEXT,
        contracting_authority_id TEXT,
        placsp_id TEXT
      );
      INSERT INTO contracts VALUES
        ('ctr-1', '1/2026 Servicios', 'auth-1', 'placsp-1'),
        ('ctr-2', '1/2026   Servicios', 'auth-2', 'placsp-2');
    `);

    expect(resolveModificationContract(db, {
      case_number: '1/2026 Servicios',
      contracting_authority_id: 'auth-2',
      contract_id: 'unknown-source-id',
    })).toBe('ctr-2');
  });
  it('does not resolve a PLACSP source from another authority', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        case_number TEXT,
        contracting_authority_id TEXT,
        placsp_id TEXT
      );
      INSERT INTO contracts VALUES
        ('ctr-1', '1/2026 Servicios', 'auth-1', 'placsp-shared'),
        ('ctr-2', '1/2026 Servicios', 'auth-2', 'other-id');
    `);

    expect(resolveModificationContract(db, {
      case_number: '1/2026 Servicios',
      contracting_authority_id: 'auth-2',
      contract_id: 'placsp-shared',
    })).toBe('ctr-2');
  });

});

  it('rejects a modification with a missing identifier', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-modificaciones-'));
    const zipPath = path.join(dir, 'fixture.zip');
    fs.writeFileSync(zipPath, 'fixture');
    const xml = '<entry><id>placsp-1</id><cbc:ContractFolderID>1/2026 Servicios</cbc:ContractFolderID><cac-place-ext:LocatedContractingParty><cbc:ID schemeName="ID_PLATAFORMA">AUTH-1</cbc:ID></cac-place-ext:LocatedContractingParty><cac:ContractModification><cac:ContractModificationLegalMonetaryTotal><cbc:TaxExclusiveAmount>10</cbc:TaxExclusiveAmount></cac:ContractModificationLegalMonetaryTotal></cac:ContractModification></entry>';
    const spawnImpl = () => ({
      stdout: { on(event, handler) { if (event === 'data') queueMicrotask(() => handler(Buffer.from(xml))); return this; } },
      on(event, handler) { if (event === 'close') queueMicrotask(() => handler(0, null)); return this; },
    });

    await expect(extractModificationsFromZip(zipPath, {
      byPlacspId: new Map([['AUTH-1', { id: 'auth-1' }]]),
      byDir3: new Map(),
      byNif: new Map(),
      byName: new Map(),
    }, spawnImpl)).rejects.toThrow(/Identificador de modificación inválido: ausente/);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rejects a modification with a non-numeric identifier', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-modificaciones-'));
    const zipPath = path.join(dir, 'fixture.zip');
    fs.writeFileSync(zipPath, 'fixture');
    const xml = '<entry><id>placsp-1</id><cbc:ContractFolderID>1/2026 Servicios</cbc:ContractFolderID><cac-place-ext:LocatedContractingParty><cbc:ID schemeName="ID_PLATAFORMA">AUTH-1</cbc:ID></cac-place-ext:LocatedContractingParty><cac:ContractModification><cbc:ID>abc</cbc:ID></cac:ContractModification></entry>';
    const spawnImpl = () => ({
      stdout: { on(event, handler) { if (event === 'data') queueMicrotask(() => handler(Buffer.from(xml))); return this; } },
      on(event, handler) { if (event === 'close') queueMicrotask(() => handler(0, null)); return this; },
    });

    await expect(extractModificationsFromZip(zipPath, {
      byPlacspId: new Map([['AUTH-1', { id: 'auth-1' }]]),
      byDir3: new Map(),
      byNif: new Map(),
      byName: new Map(),
    }, spawnImpl)).rejects.toThrow(/Identificador de modificación inválido: abc/);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does not turn a nonnumeric duration into zero', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-modificaciones-'));
    const zipPath = path.join(dir, 'fixture.zip');
    fs.writeFileSync(zipPath, 'fixture');
    const xml = '<entry><id>placsp-1</id><cbc:ContractFolderID>1/2026 Servicios</cbc:ContractFolderID><cac-place-ext:LocatedContractingParty><cbc:ID schemeName="ID_PLATAFORMA">AUTH-1</cbc:ID></cac-place-ext:LocatedContractingParty><cac:ContractModification><cbc:ID>1</cbc:ID><cbc:ContractModificationDurationMeasure unitCode="ANN">x</cbc:ContractModificationDurationMeasure></cac:ContractModification></entry>';
    const spawnImpl = () => ({ stdout: { on(event, handler) { if (event === 'data') queueMicrotask(() => handler(Buffer.from(xml))); return this; } }, on(event, handler) { if (event === 'close') queueMicrotask(() => handler(0, null)); return this; } });
    const [result] = await extractModificationsFromZip(zipPath, { byPlacspId: new Map([['AUTH-1', { id: 'auth-1' }]]), byDir3: new Map(), byNif: new Map(), byName: new Map() }, spawnImpl);
    expect(result.duration_value).toBeNull();
    expect(result.duration_unit).toBe('ANN');
    expect(result.duration_months).toBeNull();
    expect(result.duration_days).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('represents missing numeric modification fields as null and keeps explicit zero', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-modificaciones-'));
    const zipPath = path.join(dir, 'fixture.zip');
    fs.writeFileSync(zipPath, 'fixture');

    const xml = '<entry><id>placsp-1</id><cbc:ContractFolderID>1/2026 Servicios</cbc:ContractFolderID><cac-place-ext:LocatedContractingParty><cbc:ID schemeName="ID_PLATAFORMA">AUTH-1</cbc:ID></cac-place-ext:LocatedContractingParty><cac:ContractModification><cbc:ID>1</cbc:ID><cac:ContractModificationLegalMonetaryTotal><cbc:TaxExclusiveAmount>0</cbc:TaxExclusiveAmount></cac:ContractModificationLegalMonetaryTotal></cac:ContractModification></entry>';
    const spawnImpl = () => ({
      stdout: { on(event, handler) { if (event === 'data') queueMicrotask(() => handler(Buffer.from(xml))); return this; } },
      on(event, handler) { if (event === 'close') queueMicrotask(() => handler(0, null)); return this; },
    });

    const [result] = await extractModificationsFromZip(zipPath, {
      byPlacspId: new Map([['AUTH-1', { id: 'auth-1' }]]),
      byDir3: new Map(),
      byNif: new Map(),
      byName: new Map(),
    }, spawnImpl);

    expect(result.modification_amount).toBe(0);
    expect(result.final_amount).toBeNull();
    expect(result.duration_value).toBeNull();
    expect(result.duration_months).toBeNull();
    expect(result.duration_days).toBeNull();

    fs.rmSync(dir, { recursive: true, force: true });
  });



describe('sync-modificaciones merged snapshot type', () => {
  it('derives modification_type from preserved stored values when the incoming snapshot omits amounts', () => {
    const source = require('node:fs').readFileSync(require.resolve('./sync-modificaciones.js'), 'utf8');
    expect(source).toMatch(/modification_type = case[\s\S]*coalesce\(excluded\.duration_days, modifications\.duration_days\)[\s\S]*coalesce\(excluded\.modification_amount, modifications\.modification_amount\)/);
  });
});

describe('sync-modificaciones persistence transaction', () => {
  it('rolls back all modifications from a ZIP when one insert fails', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE modifications (id TEXT PRIMARY KEY, value INTEGER NOT NULL);');

    expect(() => runInTransaction(db, () => {
      db.prepare('INSERT INTO modifications (id, value) VALUES (?, ?)').run('first', 1);
      db.prepare('INSERT INTO modifications (id, value) VALUES (?, ?)').run('first', 2);
    })).toThrow();

    expect(db.prepare('SELECT count(*) AS count FROM modifications').get().count).toBe(0);
    db.close();
  });
});

describe('sync-modificaciones feed extraction', () => {
  it('rejects when unzip exits with an error instead of treating the feed as empty', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-modificaciones-'));
    const invalidZip = path.join(dir, 'invalid.zip');
    fs.writeFileSync(invalidZip, 'not a zip archive');

    const spawnImpl = () => {
      const listeners = new Map();
      return {
        stdout: { on() {} },
        on(event, handler) {
          listeners.set(event, handler);
          if (event === 'close') queueMicrotask(() => handler(9, null));
          return this;
        },
      };
    };

    await expect(extractModificationsFromZip(invalidZip, {
      byPlacspId: new Map(),
      byDir3: new Map(),
      byNif: new Map(),
      byName: new Map(),
    }, spawnImpl)).rejects.toThrow(/No se pudo extraer invalid\.zip con unzip/);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
