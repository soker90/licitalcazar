import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { initDocumentsTable, syncDocumentsForContract, resolveTargetContract, fetchContractHtml, inspectDocumentForAbnormality, buildIncrementalContractsQuery } = require('./sync-documentos.js');

describe('sync-documentos CLI resource lifecycle', () => {
  it('keeps database work behind the CLI entry point and closes owned connections', () => {
    const source = require('node:fs').readFileSync(require.resolve('./sync-documentos.js'), 'utf8');
    expect(source).toContain('if (require.main === module)');
    expect(source).toContain('if (!suppliedDb) db.close();');
    expect(source).toContain('module.exports = {');
    expect(source).not.toMatch(/\nmain\(\)\.catch\(err =>/);
  });

  it('closes an owned SQLite database when initialization fails', async () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { main } = require('./sync-documentos.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-documentos-db-'));
    const dbPath = path.join(dir, 'fixture.db');
    const db = new DatabaseSync(dbPath);
    db.exec('CREATE TABLE contracts (id TEXT PRIMARY KEY)');
    db.close();
    try {
      await expect(main({ dbPath, argv: [] })).rejects.toThrow();
      const reopened = new DatabaseSync(dbPath);
      expect(reopened.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contracts'").get().name).toBe('contracts');
      reopened.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not close a caller-owned connection when initialization fails', async () => {
    const { main } = require('./sync-documentos.js');
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE contracts (id TEXT PRIMARY KEY)');
    await expect(main({ db, argv: [] })).rejects.toThrow();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contracts'").get().name).toBe('contracts');
    db.close();
  });
});
describe('sync-documentos CLI resource lifecycle', () => {
  it('keeps execution behind the CLI entry point and closes owned connections', () => {
    const source = require('node:fs').readFileSync(require.resolve('./sync-documentos.js'), 'utf8');
    expect(source).toContain('if (require.main === module)');
    expect(source).toContain('if (!suppliedDb) db.close();');
    expect(source).not.toMatch(/\nmain\(\)\.catch\(err =>/);
  });

  it('closes an owned database when initialization fails', async () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { main } = require('./sync-documentos.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-documentos-db-'));
    const dbPath = path.join(dir, 'fixture.db');
    const db = new DatabaseSync(dbPath);
    db.exec('CREATE TABLE contracts (id TEXT PRIMARY KEY)');
    db.close();
    try {
      await expect(main({ dbPath, argv: [] })).rejects.toThrow();
      const reopened = new DatabaseSync(dbPath);
      expect(reopened.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contracts'").get().name).toBe('contracts');
      reopened.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not close a caller-owned connection when initialization fails', async () => {
    const { main } = require('./sync-documentos.js');
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE contracts (id TEXT PRIMARY KEY)');
    await expect(main({ db, argv: [] })).rejects.toThrow();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contracts'").get().name).toBe('contracts');
    db.close();
  });
});
describe('sync-documentos schema initialization', () => {
  it('rolls back the document schema when a contract-column migration fails', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE contracts (id TEXT PRIMARY KEY)');

    const originalExec = db.exec.bind(db);
    const failingDb = new Proxy(db, {
      get(target, property) {
        if (property === 'exec') {
          return (sql) => {
            if (sql.includes('ALTER TABLE contracts ADD COLUMN updated_at')) {
              throw new Error('forced schema failure');
            }
            return originalExec(sql);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    expect(() => initDocumentsTable(failingDb)).toThrow('forced schema failure');
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'contract_documents'").get()).toBeUndefined();
    expect(db.prepare("PRAGMA table_info('contracts')").all().map((entry) => entry.name)).toEqual(['id']);
    db.close();
  });
});


describe('fetchContractHtml retries', () => {
  it('retries after a failed request and invokes the retry delay command', () => {
    const calls = [];
    const result = fetchContractHtml(
      'https://example.test/licitacion',
      2,
      () => {
        calls.push('request');
        if (calls.length === 1) throw new Error('temporary network failure');
        return Buffer.from('<html>xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</html>');
      },
      (command) => calls.push(command)
    );

    expect(result.error).toBeNull();
    expect(result.attempts).toBe(2);
    expect(calls).toEqual(['request', 'sleep 1.5', 'request']);
  });
  
  it('accepts a short response that explicitly confirms there are no documents', () => {
    const result = fetchContractHtml(
      'https://example.test/licitacion',
      1,
      () => Buffer.from('<html><body>No hay documentos</body></html>'),
      () => { throw new Error('no retry should be needed'); },
    );

    expect(result).toEqual({
      html: '<html><body>No hay documentos</body></html>',
      error: null,
      attempts: 1,
    });
  });

  it('continues rejecting short responses without an explicit empty marker', () => {
    const result = fetchContractHtml(
      'https://example.test/licitacion',
      1,
      () => Buffer.from('<html><body>Error temporal</body></html>'),
      () => { throw new Error('no retry should be needed'); },
    );

    expect(result.html).toBeNull();
    expect(result.error).toMatch(/respuesta HTML demasiado corta/);
    expect(result.attempts).toBe(1);
  });
});

describe('sync-documentos incremental contract selection', () => {
  it('uses the canonical procedure column and includes unknown procedures but excludes known minors', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        case_number TEXT,
        source_url TEXT,
        procedure TEXT,
        year INTEGER,
        publication_date TEXT
      );
    `);
    initDocumentsTable(db);
    const insert = db.prepare('INSERT INTO contracts (id, case_number, source_url, procedure, year, publication_date) VALUES (?, ?, ?, ?, ?, ?)');
    insert.run('unknown-procedure', 'EXP-NULL', 'https://example.test/null', null, 2026, '2026-01-03');
    insert.run('known-minor', 'EXP-MINOR', 'https://example.test/minor', 'Contrato menor', 2026, '2026-01-02');
    insert.run('open-procedure', 'EXP-OPEN', 'https://example.test/open', 'Abierto', 2026, '2026-01-01');

    const rows = db.prepare(buildIncrementalContractsQuery()).all();
    expect(rows.map((row) => row.id)).toEqual(['unknown-procedure', 'open-procedure']);
    db.close();
  });
});

describe('sync-documentos snapshot semantics', () => {
  let db;
  const contract = {
    id: 'contract-1',
    expediente: 'EXP-1',
    url: 'https://example.test/licitacion'
  };

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        case_number TEXT,
        source_url TEXT,
        updated_at TEXT,
        documents_synced_at TEXT
      );
    `);
    initDocumentsTable(db);
    db.prepare(
      'INSERT INTO contracts (id, case_number, source_url, updated_at, documents_synced_at) VALUES (?, ?, ?, ?, ?)'
    ).run(contract.id, contract.expediente, contract.url, '2026-09-22 10:00:00', '2026-09-22 09:00:00');
  });

  it('replaces the previous snapshot after a successful fetch', async () => {
    db.prepare(
      'INSERT INTO contract_documents (id, contract_id, case_number, title, source_url) VALUES (?, ?, ?, ?, ?)'
    ).run('old-doc', contract.id, contract.expediente, 'Documento antiguo', 'https://example.test/old');

    const html = `
      <html><body>
        <div>xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</div>
        <table><tr class="rowClass1">
          <td><span class="textSfecha1PadreGen">22/09/2026</span></td>
          <td><span class="textStipo1PadreGen">Pliego de cláusulas</span></td>
          <td><a href="https://example.test/GetDocumentByIdServlet?id=123">Ver</a></td>
        </tr></table>
      </body></html>
    `;

    const result = await syncDocumentsForContract(
      db,
      contract,
      () => ({ html, error: null, attempts: 1 })
    );

    const docs = db.prepare(
      'SELECT id, title FROM contract_documents WHERE contract_id = ? ORDER BY id'
    ).all(contract.id);
    const watermark = db.prepare(
      'SELECT documents_synced_at FROM contracts WHERE id = ?'
    ).get(contract.id);

    expect(result.networkError).toBe(false);
    expect(result.docs).toHaveLength(1);
    expect(docs).toEqual([{ id: 'contract-1_doc_1', title: 'Pliego de cláusulas' }]);
    expect(watermark.documents_synced_at).not.toBeNull();
  });

  it('keeps the previous snapshot and watermark when the fetch fails', async () => {
    db.prepare(
      'INSERT INTO contract_documents (id, contract_id, case_number, title, source_url) VALUES (?, ?, ?, ?, ?)'
    ).run('old-doc', contract.id, contract.expediente, 'Documento antiguo', 'https://example.test/old');

    const result = await syncDocumentsForContract(
      db,
      contract,
      () => ({ html: null, error: 'timeout', attempts: 3 })
    );

    const docs = db.prepare(
      'SELECT id, title FROM contract_documents WHERE contract_id = ?'
    ).all(contract.id);
    const watermark = db.prepare(
      'SELECT documents_synced_at FROM contracts WHERE id = ?'
    ).get(contract.id);

    expect(result.networkError).toBe(true);
    expect(docs).toEqual([{ id: 'old-doc', title: 'Documento antiguo' }]);
    expect(watermark.documents_synced_at).toBe('2026-09-22 09:00:00');
  });

  it('keeps the previous snapshot when document links are present but some rows cannot be parsed', async () => {
    db.prepare(
      'INSERT INTO contract_documents (id, contract_id, case_number, title, source_url) VALUES (?, ?, ?, ?, ?)'
    ).run('old-doc', contract.id, contract.expediente, 'Documento antiguo', 'https://example.test/old');

    const html = `
      <html><body>
        ${'x'.repeat(6000)}
        <table>
          <tr class="rowClass1">
            <td><span class="textSfecha1PadreGen">22/09/2026</span></td>
            <td><span class="textStipo1PadreGen">Pliego de cláusulas</span></td>
            <td><a href="https://example.test/GetDocumentByIdServlet?id=123">Ver</a></td>
          </tr>
          <tr class="rowClass2">
            <td><span class="textSfecha1PadreGen">21/09/2026</span></td>
            <td>Fila documental sin tipo reconocible</td>
            <td><a href="https://example.test/GetDocumentByIdServlet?id=456">Ver</a></td>
          </tr>
        </table>
      </body></html>
    `;

    const result = await syncDocumentsForContract(
      db,
      contract,
      () => ({ html, error: null, attempts: 1 })
    );

    const docs = db.prepare(
      'SELECT id, title FROM contract_documents WHERE contract_id = ?'
    ).all(contract.id);
    const watermark = db.prepare(
      'SELECT documents_synced_at FROM contracts WHERE id = ?'
    ).get(contract.id);

    expect(result.emptyPage).toBe(true);
    expect(result.docs).toHaveLength(0);
    expect(result.errorMsg).toMatch(/Snapshot documental incompleto/);
    expect(docs).toEqual([{ id: 'old-doc', title: 'Documento antiguo' }]);
    expect(watermark.documents_synced_at).toBe('2026-09-22 09:00:00');
  });

  it('keeps the previous snapshot when a long response has no recognizable document section', async () => {
    db.prepare(
      'INSERT INTO contract_documents (id, contract_id, case_number, title, source_url) VALUES (?, ?, ?, ?, ?)'
    ).run('old-doc', contract.id, contract.expediente, 'Documento antiguo', 'https://example.test/old');

    const html = '<html><body>' + 'x'.repeat(12000) + '</body></html>';

    const result = await syncDocumentsForContract(
      db,
      contract,
      () => ({ html, error: null, attempts: 1 })
    );

    const docs = db.prepare(
      'SELECT id, title FROM contract_documents WHERE contract_id = ?'
    ).all(contract.id);
    const watermark = db.prepare(
      'SELECT documents_synced_at FROM contracts WHERE id = ?'
    ).get(contract.id);

    expect(result.networkError).toBe(false);
    expect(result.emptyPage).toBe(true);
    expect(result.docs).toHaveLength(0);
    expect(docs).toEqual([{ id: 'old-doc', title: 'Documento antiguo' }]);
    expect(watermark.documents_synced_at).toBe('2026-09-22 09:00:00');
  });

  it('requires two consecutive explicit empty snapshots before clearing documents', async () => {
    db.prepare(
      'INSERT INTO contract_documents (id, contract_id, case_number, title, source_url) VALUES (?, ?, ?, ?, ?)'
    ).run('old-doc', contract.id, contract.expediente, 'Documento antiguo', 'https://example.test/old');

    const html = '<html><body>No hay documentos</body></html>';

    const first = await syncDocumentsForContract(
      db,
      contract,
      () => ({ html, error: null, attempts: 1 })
    );

    let docs = db.prepare(
      'SELECT id, title FROM contract_documents WHERE contract_id = ?'
    ).all(contract.id);
    let state = db.prepare(
      'SELECT documents_empty_confirmation_count, documents_synced_at FROM contracts WHERE id = ?'
    ).get(contract.id);

    expect(first.emptyPage).toBe(true);
    expect(first.pendingEmptyConfirmation).toBe(true);
    expect(docs).toEqual([{ id: 'old-doc', title: 'Documento antiguo' }]);
    expect(state.documents_empty_confirmation_count).toBe(1);
    expect(state.documents_synced_at).toBe('2026-09-22 09:00:00');

    const second = await syncDocumentsForContract(
      db,
      contract,
      () => ({ html, error: null, attempts: 1 })
    );

    docs = db.prepare(
      'SELECT id, title FROM contract_documents WHERE contract_id = ?'
    ).all(contract.id);
    state = db.prepare(
      'SELECT documents_empty_confirmation_count, documents_synced_at FROM contracts WHERE id = ?'
    ).get(contract.id);

    expect(second.emptyPage).toBe(false);
    expect(second.pendingEmptyConfirmation).toBeUndefined();
    expect(second.docs).toHaveLength(0);
    expect(docs).toEqual([]);
    expect(state.documents_empty_confirmation_count).toBe(0);
    expect(state.documents_synced_at).not.toBeNull();
  });
});
describe('sync-documentos target resolution', () => {
  it('prefers an exact internal ID', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        case_number TEXT,
        source_url TEXT
      );
    `);
    db.prepare('INSERT INTO contracts (id, case_number, source_url) VALUES (?, ?, ?)').run('ctr-123', 'EXP-1', 'https://example.test/1');
    db.prepare('INSERT INTO contracts (id, case_number, source_url) VALUES (?, ?, ?)').run('ctr-123-extra', 'EXP-2', 'https://example.test/2');

    expect(resolveTargetContract(db, 'ctr-123').id).toBe('ctr-123');
    db.close();
  });

  it('rejects an ambiguous ID or case-number search', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        case_number TEXT,
        source_url TEXT
      );
    `);
    db.prepare('INSERT INTO contracts (id, case_number, source_url) VALUES (?, ?, ?)').run('ctr-a', 'EXP-2026', 'https://example.test/a');
    db.prepare('INSERT INTO contracts (id, case_number, source_url) VALUES (?, ?, ?)').run('ctr-b', 'EXP-2026', 'https://example.test/b');

    expect(() => resolveTargetContract(db, 'EXP-2026')).toThrow(/coincide con 2 contratos/);
    db.close();
  });
});


describe('sync-documentos PDF execution safety', () => {
  it('passes PDF paths as pdftotext arguments instead of interpolating them into a shell command', () => {
    const calls = [];
    const doc = {
      id: 'doc-1',
      title: 'Acta de la Mesa',
      url: 'https://example.test/document.pdf',
      is_abnormally_low_bid_justification: 0
    };

    const originalNow = Date.now;
    const originalRandom = Math.random;
    Date.now = () => 1234567890;
    Math.random = () => 0.1234;
    try {
      const result = inspectDocumentForAbnormality(doc, (command, args) => {
        calls.push({ command, args });
        expect(command).toBe('curl');
        expect(args).not.toContain('-k');
        if (args.includes('-o')) {
          const output = args[args.indexOf('-o') + 1];
          if (output.endsWith('.pdf')) {
            expect(output).toContain('document-');
          }
        }
        return Buffer.from('%PDF-1.4');
      });

      expect(result).toEqual(doc);
      expect(calls[0].command).toBe('curl');
    } finally {
      Date.now = originalNow;
      Math.random = originalRandom;
    }
  });

  it('uses execFile for pdftotext paths', () => {
    const calls = [];
    const doc = {
      id: 'doc-1',
      title: 'Acta de la Mesa',
      url: 'https://example.test/document.pdf',
      is_abnormally_low_bid_justification: 0
    };

    const result = inspectDocumentForAbnormality(doc, (command, args) => {
      calls.push({ command, args });
      if (command === 'curl') return Buffer.from('%PDF-1.4');
      throw new Error('forced pdftotext failure');
    });

    expect(result).toEqual(doc);
    expect(calls.some(({ command }) => command === 'pdftotext')).toBe(true);
    const pdfCall = calls.find(({ command }) => command === 'pdftotext');
    expect(pdfCall.args).toHaveLength(2);
    expect(pdfCall.args.every((arg) => typeof arg === 'string')).toBe(true);
  });  it('uses execFile for pdftotext paths', () => {
    const calls = [];
    const doc = {
      id: 'doc-1',
      title: 'Acta de la Mesa',
      url: 'https://example.test/document.pdf',
      is_abnormally_low_bid_justification: 0
    };

    const result = inspectDocumentForAbnormality(doc, (command, args) => {
      calls.push({ command, args });
      if (command === 'curl') return Buffer.from('%PDF-1.4');
      throw new Error('forced pdftotext failure');
    });

    expect(result).toEqual(doc);
    expect(calls.some(({ command }) => command === 'pdftotext')).toBe(true);
    const pdfCall = calls.find(({ command }) => command === 'pdftotext');
    expect(pdfCall.args).toHaveLength(2);
    expect(pdfCall.args.every((arg) => typeof arg === 'string')).toBe(true);
  });

  it('cleans temporary PDF files when document inspection fails', () => {
    const doc = {
      id: 'doc-1',
      title: 'Acta de la Mesa',
      url: 'https://example.test/document.pdf',
      is_abnormally_low_bid_justification: 0
    };

    const originalNow = Date.now;
    const originalRandom = Math.random;
    Date.now = () => 1234567890;
    Math.random = () => 0.1234;

    const tmpPdf = '/tmp/doc_1234567890_4fzy.pdf';
    const tmpTxt = '/tmp/doc_1234567890_4fzy.txt';

    try {
      const result = inspectDocumentForAbnormality(doc, (command, args) => {
        if (command === 'curl') {
          const output = args[args.indexOf('-o') + 1];
          require('node:fs').writeFileSync(output, '%PDF-1.4');
          return Buffer.from('');
        }
        throw new Error('forced pdftotext failure');
      });

      expect(result).toEqual(doc);
      expect(require('node:fs').existsSync(tmpPdf)).toBe(false);
      expect(require('node:fs').existsSync(tmpTxt)).toBe(false);
    } finally {
      Date.now = originalNow;
      Math.random = originalRandom;
      for (const tempPath of [tmpPdf, tmpTxt]) {
        try { require('node:fs').unlinkSync(tempPath); } catch {}
      }
    }
  });
});

describe('sync-documentos URL execution safety', () => {
  it('passes contract URLs as curl arguments instead of interpolating them into a shell command', () => {
    const calls = [];
    const maliciousUrl = 'https://example.test/licitacion?next=$(touch /tmp/should-not-run)';
    const html = '<html>' + 'x'.repeat(6000) + '</html>';

    const result = fetchContractHtml(maliciousUrl, 1, (command, args) => {
      calls.push({ command, args });
      return Buffer.from(html);
    });

    expect(result.html).toBe(html);
    expect(calls).toEqual([
      {
        command: 'curl',
        args: ['-s', '--fail', maliciousUrl, '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', '-L', '--max-time', '15'],
      },
    ]);
  });

  it('treats an HTTP curl failure as a failed fetch', () => {
    const result = fetchContractHtml('https://example.test/error', 1, (command, args) => {
      expect(command).toBe('curl');
      expect(args).toContain('--fail');
      expect(args).not.toContain('-k');
      throw new Error('curl: (22) The requested URL returned error: 500');
    });

    expect(result.html).toBeNull();
    expect(result.attempts).toBe(1);
    expect(result.error).toMatch(/curl.*500/);
  });
});
