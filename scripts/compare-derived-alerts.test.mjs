import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { alertRecords } = require('./compare-derived-alerts.js');

function makeDb(contractId, authorityId = 'authority-1', caseNumber = '15/2024 Servicios') {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE contracts (
      id TEXT PRIMARY KEY,
      case_number TEXT,
      contracting_authority_id TEXT
    );
    CREATE TABLE alerts (
      id TEXT PRIMARY KEY,
      category TEXT,
      type TEXT,
      severity TEXT,
      level TEXT,
      scale_score REAL,
      confidence REAL,
      title TEXT,
      description TEXT,
      target_data TEXT,
      source TEXT,
      source_url TEXT,
      extracted_at TEXT,
      applied_rule TEXT,
      methodology_version TEXT,
      limitations TEXT,
      alternative_explanation TEXT,
      requires_human_review INTEGER,
      evidence TEXT,
      factors_json TEXT,
      continuity_pattern TEXT,
      explanations_json TEXT,
      documents_json TEXT,
      created_at TEXT
    );
    CREATE TABLE alert_contracts (alert_id TEXT, contract_id TEXT);
  `);
  db.prepare('INSERT INTO contracts(id, case_number, contracting_authority_id) VALUES (?, ?, ?)')
    .run(contractId, caseNumber, authorityId);
  db.prepare('INSERT INTO alerts(id, type, created_at) VALUES (?, ?, ?)')
    .run('alert-' + contractId, 'riesgo-adjudicacion', '2026-10-09');
  db.prepare('INSERT INTO alert_contracts(alert_id, contract_id) VALUES (?, ?)')
    .run('alert-' + contractId, contractId);
  return db;
}

describe('compare-derived-alerts semantic identity', () => {
  it('matches the same contract when its internal ID changes between snapshots', () => {
    const reference = makeDb('legacy-contract');
    const rebuild = makeDb('canonical-contract');

    try {
      const referenceRecord = alertRecords(reference)[0];
      const rebuildRecord = alertRecords(rebuild)[0];

      expect(referenceRecord.key).toBe(rebuildRecord.key);
      expect(referenceRecord.contratoIds).toEqual(['legacy-contract']);
      expect(rebuildRecord.contratoIds).toEqual(['canonical-contract']);
    } finally {
      reference.close();
      rebuild.close();
    }
  });

  it('does not match empty expediente values as a logical identity', () => {
    const first = makeDb('contract-a', 'authority-1', '');
    const second = makeDb('contract-b', 'authority-1', '');

    try {
      expect(alertRecords(first)[0].key).not.toBe(alertRecords(second)[0].key);
    } finally {
      first.close();
      second.close();
    }
  });

  it('does not conflate the same case number from different contracting authorities', () => {
    const first = makeDb('contract-a', 'authority-1');
    const second = makeDb('contract-b', 'authority-2');

    try {
      expect(alertRecords(first)[0].key).not.toBe(alertRecords(second)[0].key);
    } finally {
      first.close();
      second.close();
    }
  });
});
