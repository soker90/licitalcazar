import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const TEMP_DB = path.join(os.tmpdir(), `vacuum-import-${process.pid}-${Math.random().toString(36).slice(2)}.db`);

afterEach(() => {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    try {
      fs.unlinkSync(TEMP_DB + suffix);
    } catch {
      // A sidecar may not exist after a successful close.
    }
  }
});

describe('vacuum-db', () => {
  it('does not open or compact the application database when imported', () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, './vacuum-db.js'), 'utf8');
    expect(source).toContain('if (require.main === module)');
    expect(source).not.toMatch(/const db = new DatabaseSync\(DB_PATH\);\s*db\.exec/);
  });

  it('compacts an explicit database connection without changing its data', () => {
    const { vacuumDatabase } = require('./vacuum-db.js');
    const db = new DatabaseSync(TEMP_DB);
    try {
      db.exec('CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
      db.prepare('INSERT INTO sample(value) VALUES (?)').run('retained value');

      expect(() => vacuumDatabase(db)).not.toThrow();
      expect(db.prepare('SELECT value FROM sample').get().value).toBe('retained value');
    } finally {
      db.close();
    }
  });

  it('closes the CLI database handle even when VACUUM fails', () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, './vacuum-db.js'), 'utf8');
    const openIndex = source.indexOf('const db = new DatabaseSync(DB_PATH);');
    const tryIndex = source.indexOf('try {', openIndex);
    const vacuumIndex = source.indexOf('vacuumDatabase(db);', tryIndex);
    const finallyIndex = source.indexOf('} finally {', vacuumIndex);
    const closeIndex = source.indexOf('db.close();', finallyIndex);

    expect(openIndex).toBeGreaterThanOrEqual(0);
    expect(tryIndex).toBeGreaterThan(openIndex);
    expect(vacuumIndex).toBeGreaterThan(tryIndex);
    expect(finallyIndex).toBeGreaterThan(vacuumIndex);
    expect(closeIndex).toBeGreaterThan(finallyIndex);
  });
});
