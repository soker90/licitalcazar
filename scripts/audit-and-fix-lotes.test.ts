import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { cleanupAfterFailure } = require('./audit-and-fix-lotes.js');

const tempDirs = [];

function createDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-lotes-'));
  tempDirs.push(dir);
  const dbPath = path.join(dir, 'test.db');
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE entries (id INTEGER PRIMARY KEY, value TEXT);');
  return { db, dbPath };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('cleanupAfterFailure', () => {
  it('rolls back an active transaction and closes the connection', () => {
    const { db, dbPath } = createDatabase();
    db.exec('BEGIN TRANSACTION;');
    db.prepare('INSERT INTO entries (value) VALUES (?)').run('must roll back');

    cleanupAfterFailure(db, true);

    expect(() => db.prepare('SELECT 1').get()).toThrow();
    const reopened = new DatabaseSync(dbPath);
    try {
      expect(reopened.prepare('SELECT count(*) AS count FROM entries').get().count).toBe(0);
    } finally {
      reopened.close();
    }
  });

  it('closes the connection without attempting a rollback when no transaction started', () => {
    const { db } = createDatabase();

    expect(() => cleanupAfterFailure(db, false)).not.toThrow();
    expect(() => db.prepare('SELECT 1').get()).toThrow();
  });

  it('preserves the original error path if rollback is attempted without an active transaction', () => {
    const { db } = createDatabase();

    expect(() => cleanupAfterFailure(db, true)).not.toThrow();
    expect(() => db.prepare('SELECT 1').get()).toThrow();
  });
});


describe('verifyBackupIntegrity database lifecycle', () => {
  function createDatabasePair(tableName = 'contract_lots') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-lotes-backup-'));
    tempDirs.push(dir);
    const originalPath = path.join(dir, 'original.db');
    const backupPath = path.join(dir, 'backup.db');

    const original = new DatabaseSync(originalPath);
    original.exec(`CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY, value TEXT);`);
    original.prepare(`INSERT INTO ${tableName} (value) VALUES (?)`).run('test row');
    original.close();

    fs.copyFileSync(originalPath, backupPath);
    return { originalPath, backupPath };
  }

  it('validates a healthy backup and closes both connections', () => {
    const { verifyBackupIntegrity } = require('./audit-and-fix-lotes.js');
    const { originalPath, backupPath } = createDatabasePair();
    const closeSpy = vi.spyOn(DatabaseSync.prototype, 'close');

    try {
      expect(() => verifyBackupIntegrity(originalPath, backupPath)).not.toThrow();
      expect(closeSpy).toHaveBeenCalledTimes(2);
    } finally {
      closeSpy.mockRestore();
    }
  });

  it('closes both connections when the original database query fails', () => {
    const { verifyBackupIntegrity } = require('./audit-and-fix-lotes.js');
    const { originalPath, backupPath } = createDatabasePair('another_table');
    const closeSpy = vi.spyOn(DatabaseSync.prototype, 'close');

    try {
      expect(() => verifyBackupIntegrity(originalPath, backupPath))
        .toThrow(/contract_lots/);
      expect(closeSpy).toHaveBeenCalledTimes(2);
    } finally {
      closeSpy.mockRestore();
    }
  });
});
