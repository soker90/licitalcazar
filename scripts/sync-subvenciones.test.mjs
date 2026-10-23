import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assertSuccessfulSync } = require('./sync-subvenciones.js');


describe('sync-subvenciones pagination completeness', () => {
  it('rejects an empty page before the reported total instead of accepting partial grants', async () => {
    const { syncNif } = require('./sync-subvenciones.js');
    let writes = 0;

    const result = await syncNif(
      {
        prepare() {
          return { run() { writes++; } };
        },
      },
      'B12345678',
      'Empresa',
      [],
      {
        fetchJsonImpl: async (url) => {
          const page = Number(new URL(url).searchParams.get('page'));
          return page === 0
            ? { totalElements: 2, content: [{ id: 1 }] }
            : { totalElements: 2, content: [] };
        },
      }
    );

    expect(result.status).toBe('error_concessions');
    expect(result.error).toMatch(/pagination incomplete: retrieved 1 of 2/);
    expect(writes).toBe(0);
  });

  it('rejects concession records without an ID before inserting any grants', async () => {
    const { syncNif } = require('./sync-subvenciones.js');
    let writes = 0;

    const result = await syncNif(
      {
        prepare() {
          return { run() { writes++; } };
        },
      },
      'B12345678',
      'Empresa',
      [],
      {
        fetchJsonImpl: async () => ({ totalElements: 1, content: [{ importe: 125 }] }),
      }
    );

    expect(result.status).toBe('error_concessions');
    expect(result.error).toMatch(/1 concession\(s\) without an ID/);
    expect(writes).toBe(0);
  });

  it('treats an empty API response as an error, not as proof of no grants', async () => {
    const { syncNif } = require('./sync-subvenciones.js');
    const result = await syncNif(
      { prepare() { return { run() {} }; } },
      'B12345678',
      'Empresa',
      [],
      { fetchJsonImpl: async () => null }
    );

    expect(result.status).toBe('error_concessions');
    expect(result.error).toMatch(/invalid response for page 0/);
  });

  it('continues after a short page when BDNS reports more total results', async () => {
    const { syncNif } = require('./sync-subvenciones.js');
    const requests = [];

    const result = await syncNif(
      {
        prepare() {
          return { run() {} };
        },
      },
      'B12345678',
      'Empresa',
      [],
      {
        fetchJsonImpl: async (url) => {
          requests.push(url);
          const page = Number(new URL(url).searchParams.get('page'));
          if (page === 0) {
            return {
              totalElements: 1500,
              content: Array.from({ length: 100 }, (_, index) => ({ id: index + 1 })),
            };
          }
          return {
            totalElements: 1500,
            content: Array.from({ length: 1400 }, (_, index) => ({ id: index + 101 })),
          };
        },
      }
    );

    expect(requests).toHaveLength(2);
    expect(result.grantsCount).toBe(1500);
  });
});

describe('sync-subvenciones retry policy', () => {
  it('retries only failed NIFs and keeps successful results', async () => {
    const { syncNifsWithRetries } = require('./sync-subvenciones.js');
    const attempts = new Map();

    const result = await syncNifsWithRetries(
      {},
      [
        { awardee_nif: 'B12345678', awardee: 'Primera' },
        { awardee_nif: 'B87654321', awardee: 'Segunda' },
      ],
      [],
      {
        maxAttempts: 3,
        syncNifImpl: async (_db, nif) => {
          attempts.set(nif, (attempts.get(nif) || 0) + 1);
          if (nif === 'B12345678') {
            return { nif, status: 'synced', grantsCount: 2, alcazarCount: 1 };
          }
          if (attempts.get(nif) < 3) {
            return { nif, status: 'error_concessions', error: 'HTTP 503' };
          }
          return { nif, status: 'synced', grantsCount: 1, alcazarCount: 0 };
        },
        sleepImpl: async () => {},
      }
    );

    expect(attempts.get('B12345678')).toBe(1);
    expect(attempts.get('B87654321')).toBe(3);
    expect(result.failures).toHaveLength(0);
    expect(result.results.map(item => item.grantsCount)).toEqual([2, 1]);
  });

  it('keeps successful NIFs when another NIF fails all attempts', async () => {
    const { syncNifsWithRetries } = require('./sync-subvenciones.js');
    const attempts = new Map();

    const result = await syncNifsWithRetries(
      {},
      [
        { awardee_nif: 'B12345678', awardee: 'Primera' },
        { awardee_nif: 'B87654321', awardee: 'Segunda' },
      ],
      [],
      {
        maxAttempts: 3,
        syncNifImpl: async (_db, nif) => {
          attempts.set(nif, (attempts.get(nif) || 0) + 1);
          if (nif === 'B12345678') {
            return { nif, status: 'synced', grantsCount: 2, alcazarCount: 0 };
          }
          return { nif, status: 'error_concessions', error: 'HTTP 503' };
        },
        sleepImpl: async () => {},
      }
    );

    expect(result.results[0].status).toBe('synced');
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].nif).toBe('B87654321');
    expect(attempts.get('B87654321')).toBe(3);
  });
});

describe('sync-subvenciones result validation', () => {
  it('rejects a sync with any failed NIF request', () => {
    expect(() => assertSuccessfulSync([
      { nif: 'B12345678', status: 'synced', grantsCount: 2 },
      { nif: 'B87654321', status: 'error_concessions', error: 'HTTP error 503: Service Unavailable' },
    ])).toThrow(/BDNS sync incomplete: 1 NIF\(s\) failed/);
  });

  it('accepts successful, empty and skipped NIF results', () => {
    expect(() => assertSuccessfulSync([
      { nif: 'B12345678', status: 'synced', grantsCount: 2 },
      { nif: 'B87654321', status: 'no_grants', grantsCount: 0 },
      { nif: 'pf-12345678', status: 'skipped_invalid_nif' },
    ])).not.toThrow();
  });

  it('fails the CLI run when any NIF remains unsuccessful after retries', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'scripts/sync-subvenciones.js'),
      'utf8',
    );

    const retryCall = source.indexOf('const { results, failures } = await syncNifsWithRetries(db, nifList, targetPatterns)');
    const validationCall = source.indexOf('assertSuccessfulSync(results);');
    expect(retryCall).toBeGreaterThanOrEqual(0);
    expect(validationCall).toBeGreaterThan(retryCall);
  });
});


describe('sync-subvenciones partial lot_awards coverage', () => {
  it('usa el resultado estructurado por lote y conserva fallback legacy solo cuando procede', () => {
    const { buildContractorRankingQuery } = require('./sync-subvenciones.js');
    const query = buildContractorRankingQuery(true);

    expect(query).toContain('award.contract_id = ll.contract_id');
    expect(query).toContain('award.lot_number = ll.lot_number');
    expect(query).toContain("lower(coalesce(award.result_state, '')) NOT LIKE '%cancel%'");
    expect(query).toContain("lower(coalesce(award.result_state, '')) LIKE '%cancel%'");
    expect(query).toContain("lower(coalesce(award.result_state, '')) NOT LIKE '%provisional%'");
    expect(query).toContain("lower(coalesce(legacy_lot.lot_status, '')) NOT LIKE '%cancel%'");
    expect(query).not.toContain('lotAwardsCoverContract');
  });

  it('excludes terminal legacy and structured lots while preserving uncovered and provisional fallbacks', () => {
    const { DatabaseSync } = require('node:sqlite');
    const { buildContractorRankingQuery } = require('./sync-subvenciones.js');
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contracts (
          id TEXT, awardee_nif TEXT, awardee TEXT, award_amount_type TEXT, awarded_amount REAL
        );
        CREATE TABLE contract_lots (
          id TEXT, contract_id TEXT, lot_number TEXT, awardee_nif TEXT,
          awardee TEXT, awarded_amount REAL, lot_status TEXT
        );
        CREATE TABLE lot_awards (
          id TEXT, contract_id TEXT, lot_number TEXT, awardee_nif TEXT,
          awardee TEXT, awarded_amount REAL, result_state TEXT
        );
        INSERT INTO contracts VALUES ('C1', NULL, 'Varios adjudicatarios', 'total', NULL);
      `);

      const insertLot = db.prepare('INSERT INTO contract_lots VALUES (?, ?, ?, ?, ?, ?, ?)');
      const insertAward = db.prepare('INSERT INTO lot_awards VALUES (?, ?, ?, ?, ?, ?, ?)');

      insertLot.run('legacy-1', 'C1', '1', 'B00000001', 'Empresa legacy 1', 100, 'Adjudicado');
      insertLot.run('legacy-2', 'C1', '2', 'B00000002', 'Empresa legacy 2', 200, 'Adjudicado');
      insertLot.run('legacy-3', 'C1', '3', 'B00000003', 'Empresa cancelada', 300, 'Cancelado');
      insertLot.run('legacy-4', 'C1', '4', 'B00000004', 'Empresa provisional', 400, 'Adjudicado');
      insertLot.run('legacy-5', 'C1', '5', 'B00000005', 'Empresa retirada', 500, 'Adjudicado');
      insertLot.run('legacy-6', 'C1', '6', 'B00000006', 'Empresa resultado cancelado', 600, 'Adjudicado');
      insertLot.run('legacy-7', 'C1', '7', 'B00000007', 'Empresa licitador rechazado', 700, 'Adjudicado');

      insertAward.run('award-1', 'C1', '1', 'B11111111', 'Empresa estructurada', 110, 'AWARDED');
      insertAward.run('award-3', 'C1', '3', 'B33333333', 'Empresa estructurada cancelada', 300, 'AWARDED');
      insertAward.run('award-4', 'C1', '4', null, null, null, 'DESERTED_PROVISIONALLY');
      insertAward.run('award-5', 'C1', '5', 'B55555555', 'Empresa retirada', 500, 'WITHDRAWN');
      insertAward.run('award-6', 'C1', '6', null, null, null, 'CANCELLED');
      insertAward.run('award-7', 'C1', '7', null, null, null, 'REJECTED');

      const rows = db.prepare(buildContractorRankingQuery(true)).all();
      const volumeByNif = new Map(rows.map((row) => [row.awardee_nif, row.volumen]));

      expect(volumeByNif.get('B11111111')).toBe(110);
      expect(volumeByNif.get('B00000002')).toBe(200);
      expect(volumeByNif.get('B00000004')).toBe(400);
      expect(volumeByNif.has('B00000001')).toBe(false);
      expect(volumeByNif.has('B00000003')).toBe(false);
      expect(volumeByNif.has('B33333333')).toBe(false);
      expect(volumeByNif.has('B00000005')).toBe(false);
      expect(volumeByNif.has('B55555555')).toBe(false);
      expect(volumeByNif.has('B00000006')).toBe(false);
      expect(volumeByNif.get('B00000007')).toBe(700);
    } finally {
      db.close();
    }
  });
});


describe('sync-subvenciones contractor ranking', () => {
  it('considera adjudicatarios reales y filtra estados terminales en todas las fuentes', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.resolve(process.cwd(), 'scripts/sync-subvenciones.js'), 'utf8');
    const { buildContractorRankingQuery } = require('./sync-subvenciones.js');
    const query = buildContractorRankingQuery(true);

    expect(source).toContain("name = 'lot_awards'");
    expect(source).toContain('FROM lot_awards award');
    expect(source).toContain('allowLegacyLotAwardFallbackSql(\'ll\')');
    expect(source).toContain('excludeAwardWhenLegacyLotTerminalSql(\'award\')');
    expect(source).toContain('FROM contract_lots ll');
    expect(query).toContain('award.lot_number = ll.lot_number');
    expect(query).toContain("lower(coalesce(ll.lot_status, '')) NOT LIKE '%cancel%'");
    expect(query).toContain("lower(coalesce(legacy_lot.lot_status, '')) NOT LIKE '%cancel%'");
    expect(query).not.toContain('count(DISTINCT award.lot_number)');
    expect(query).not.toContain('count(DISTINCT lot.lot_number)');
    expect(source).toContain('parent_lot.contract_id = contracts.id');
    expect(source).not.toContain("l.awardee = 'Varios adjudicatarios'");
  });

  it('no usa el PBL para seleccionar los mayores contratistas por volumen', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'scripts/sync-subvenciones.js'),
      'utf8',
    );

    expect(source).toContain(
      "sum(CASE WHEN award_amount_type IS NULL OR award_amount_type IN ('total', 'desconocido') THEN coalesce(awarded_amount, 0) ELSE 0 END) as volumen",
    );
    expect(source).not.toContain(
      "sum(CASE WHEN award_amount_type IS NULL OR award_amount_type = 'total' THEN coalesce(awarded_amount, amount_excl_vat, 0) ELSE 0 END) as volumen",
    );
  });

  it('includes known award volumes when the aggregated parent amount type is unknown', () => {
    const { DatabaseSync } = require('node:sqlite');
    const { buildContractorRankingQuery } = require('./sync-subvenciones.js');
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contracts (
          id TEXT, awardee_nif TEXT, awardee TEXT, award_amount_type TEXT, awarded_amount REAL
        );
        CREATE TABLE contract_lots (
          id TEXT, contract_id TEXT, lot_number TEXT, awardee_nif TEXT,
          awardee TEXT, awarded_amount REAL, lot_status TEXT
        );
        INSERT INTO contracts VALUES
          ('unknown-parent', 'B88888888', 'Empresa tipo desconocido', 'desconocido', 450),
          ('unitary-parent', 'B77777777', 'Empresa precio unitario', 'unitario', 900);
      `);

      const rows = db.prepare(buildContractorRankingQuery(false)).all();
      const volumeByNif = new Map(rows.map((row) => [row.awardee_nif, row.volumen]));

      expect(volumeByNif.get('B88888888')).toBe(450);
      expect(volumeByNif.get('B77777777')).toBe(0);
    } finally {
      db.close();
    }
  });
});



describe('sync-subvenciones database lifecycle', () => {
  it('closes the SQLite connection when initialization fails', async () => {
    const { DatabaseSync } = require('node:sqlite');
    const { main } = require('./sync-subvenciones.js');
    const db = new DatabaseSync(':memory:');
    const originalExec = db.exec.bind(db);
    let closed = false;
    const failingDb = new Proxy(db, {
      get(target, property) {
        if (property === 'exec') {
          return (sql) => {
            if (sql.includes('CREATE TABLE IF NOT EXISTS grants')) throw new Error('forced startup failure');
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

describe('privacy of BDNS synchronization diagnostics', () => {
  it('pseudonymizes personal NIFs but keeps corporate CIFs identifiable', () => {
    process.env.NODE_ENV = 'test';
    const { getNifLogLabel, getAwardeeLogLabel } = require('./sync-subvenciones.js');
    expect(getNifLogLabel('12345678Z')).toMatch(/^pf-[a-f0-9]{12}$/);
    expect(getNifLogLabel('B12345678')).toBe('B12345678');
    expect(getAwardeeLogLabel('12345678Z', 'Nombre Apellido')).toBe('Adjudicatario oculto');
    expect(getAwardeeLogLabel('B12345678', 'Empresa Ejemplo SL')).toBe('Empresa Ejemplo SL');
    expect(getAwardeeLogLabel(null, 'Nombre Apellido')).toBe('Adjudicatario oculto');
  });

  it('does not return a clear personal NIF when a BDNS request fails', async () => {
    process.env.NODE_ENV = 'test';
    const { syncNif } = require('./sync-subvenciones.js');
    const nif = '12345678Z';
    const result = await syncNif({}, nif, '', [], {
      fetchJsonImpl: async () => {
        throw new Error('network unavailable');
      },
    });

    expect(result.status).toBe('error_concessions');
    expect(result.nif).toMatch(/^pf-[a-f0-9]{12}$/);
    expect(result.nif).not.toBe(nif);
  });
});


describe('sync-subvenciones beneficiary identity updates', () => {
  it('refreshes beneficiary_nif when an existing BDNS concession is returned for a corrected NIF', async () => {
    const { DatabaseSync } = require('node:sqlite');
    const { initDb, syncNif } = require('./sync-subvenciones.js');
    const db = new DatabaseSync(':memory:');

    try {
      initDb(db);
      const response = {
        totalElements: 1,
        content: [{ id: 123, beneficiario: 'Empresa de prueba', importe: 250 }],
      };

      await syncNif(db, 'B12345678', 'Empresa de prueba', [], {
        fetchJsonImpl: async () => response,
      });
      await syncNif(db, 'B87654321', 'Empresa de prueba', [], {
        fetchJsonImpl: async () => response,
      });

      expect(db.prepare('SELECT beneficiary_nif FROM grants WHERE bdns_id = ?').get(123).beneficiary_nif)
        .toBe('B87654321');
      expect(db.prepare('SELECT count(*) AS count FROM grants').get().count).toBe(1);
    } finally {
      db.close();
    }
  });
});


describe('sync-subvenciones persistence atomicity', () => {
  it('rolls back a beneficiary batch when one concession cannot be inserted', async () => {
    const { DatabaseSync } = require('node:sqlite');
    const { initDb, syncNif } = require('./sync-subvenciones.js');
    const db = new DatabaseSync(':memory:');

    try {
      initDb(db);
      db.exec(`
        CREATE TRIGGER reject_second_grant
        BEFORE INSERT ON grants
        WHEN NEW.bdns_id = 2
        BEGIN
          SELECT RAISE(ABORT, 'simulated insert failure');
        END;
      `);

      const result = await syncNif(db, 'B12345678', 'Empresa', [], {
        fetchJsonImpl: async () => ({
          totalElements: 2,
          content: [{ id: 1, importe: 100 }, { id: 2, importe: 200 }],
        }),
      });

      expect(result.status).toBe('error_persistence');
      expect(result.error).toMatch(/simulated insert failure/);
      expect(db.prepare('SELECT bdns_id FROM grants').all()).toEqual([]);
    } finally {
      db.close();
    }
  });
});
