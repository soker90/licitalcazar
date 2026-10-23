import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sanitizeTerminalLotAwardFields } = require('./audit-and-fix-lotes.js');

const source = fs.readFileSync(new URL('./audit-and-fix-lotes.js', import.meta.url), 'utf8');

describe('audit-and-fix-lotes parent award summary', () => {
  it('excludes terminal no-award lot states before recalculating parent totals', () => {
    const start = source.indexOf('const lotSummary = db.prepare(`');
    const end = source.indexOf('`).get(licId);', start);
    const query = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(query).toContain('eligibleLegacyLotAwardAmountSql');
    expect(query).not.toContain("NOT LIKE '%cancelad%'");
  });
});

describe('audit-and-fix-lotes terminal amount inference', () => {
  it('does not reinterpret a terminal lot residual award as its budget', () => {
    expect(source).toContain('const isTerminalNoAward = !isEligibleAwardLotStatus(estado);');
    expect(source).toContain('else if (!isTerminalNoAward || !r.awardee)');
    expect(source).toContain('ambiguous residual data: do not reinterpret it as either award or PBL.');
  });
});

describe('audit-and-fix-lotes terminal award cleanup', () => {
  it.each(['Cancelled', 'Canceled', 'Annulled', 'Anulada', 'Desierto', 'Withdrawn'])(
    'clears residual award fields for terminal status %s',
    (status) => {
      const result = sanitizeTerminalLotAwardFields(status, {
        importeAdjudicacion: 6000,
        importeAdjConIva: 7260,
        adjudicatario: 'Empresa residual',
        nifAdjudicatario: 'B00000031',
      });

      expect(result).toEqual({
        importeAdjudicacion: null,
        importeAdjConIva: null,
        adjudicatario: null,
        nifAdjudicatario: null,
      });
    },
  );

  it('preserves award fields for an eligible awarded lot', () => {
    const fields = {
      importeAdjudicacion: 6000,
      importeAdjConIva: 7260,
      adjudicatario: 'Empresa válida',
      nifAdjudicatario: 'B00000031',
    };

    expect(sanitizeTerminalLotAwardFields('Adjudicado', fields)).toEqual(fields);
  });
});

describe('audit-and-fix-lotes atomic apply', () => {
  it('confirma la transacción solo después de las verificaciones y revierte ante errores', () => {
    const writeStart = source.indexOf("db.exec('BEGIN TRANSACTION;');");
    const commit = source.indexOf("db.exec('COMMIT;');");
    const validation = source.indexOf('// Paso 5: Asserts matemáticos de validación');
    const rollback = source.indexOf("db.exec('ROLLBACK;');");

    expect(writeStart).toBeGreaterThanOrEqual(0);
    expect(validation).toBeGreaterThan(writeStart);
    expect(commit).toBeGreaterThan(validation);
    expect(rollback).toBeGreaterThan(commit);
  });
});
