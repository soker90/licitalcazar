import { describe, expect, it, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const SCRIPT_PATH = path.resolve(process.cwd(), 'scripts/diagnose-lost-lotes.js');

describe('diagnose-lost-lotes', () => {
  it('normalizes a numeric .0 suffix in snapshot IDs', () => {
    const source = fs.readFileSync(SCRIPT_PATH, 'utf8');

    expect(source).toMatch(/replace\(\/\\\.0\$\/, ''\)/);
    expect(source).not.toContain('replace(/\\\\.0$/, \'\')');
  });
});
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('database connection cleanup', () => {
  it('does not open production databases when imported', () => {
    expect(() => require('./diagnose-lost-lotes.js')).not.toThrow();
  });

  it('closes the first snapshot when opening the second database fails', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnose-lotes-open-'));
    tempDirs.push(dir);
    const beforePath = path.join(dir, 'before.db');
    const db = new DatabaseSync(beforePath);
    db.exec('CREATE TABLE contracts (id TEXT, case_number TEXT); CREATE TABLE contract_lots (contract_id TEXT, lot_number INTEGER);');
    db.close();

    const { openDb } = require('./diagnose-lost-lotes.js');
    const first = openDb(beforePath);
    expect(() => openDb(path.join(dir, 'missing.db'))).toThrow(/No existe la BD/);
    first.close();
    expect(() => fs.renameSync(beforePath, beforePath + '.renamed')).not.toThrow();
  });

  it('closes both connections after the current snapshot query fails', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnose-lotes-query-'));
    tempDirs.push(dir);
    const beforePath = path.join(dir, 'before.db');
    const currentPath = path.join(dir, 'current.db');

    const before = new DatabaseSync(beforePath);
    before.exec('CREATE TABLE contracts (id TEXT, case_number TEXT); CREATE TABLE contract_lots (contract_id TEXT, lot_number INTEGER);');
    before.close();

    const current = new DatabaseSync(currentPath);
    current.exec('CREATE TABLE unrelated (id TEXT);');
    current.close();

    const closeSpy = vi.spyOn(DatabaseSync.prototype, 'close');
    try {
      const { main } = require('./diagnose-lost-lotes.js');
      expect(() => main({ beforePath, currentPath })).toThrow(/no such table: contracts/);
      expect(closeSpy).toHaveBeenCalledTimes(2);
    } finally {
      closeSpy.mockRestore();
    }
  });
});
