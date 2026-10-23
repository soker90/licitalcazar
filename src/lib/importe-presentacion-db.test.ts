import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Issue #236 — importes en listados y búsqueda rápida', () => {
  it('no usa PBL como fallback de una adjudicación desconocida', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/db.ts'), 'utf8');

    expect(source).toContain('WHEN awarded_amount IS NOT NULL THEN awarded_amount');
    expect(source).toContain('ELSE NULL');
    expect(source).not.toContain('coalesce(awarded_amount, amount_excl_vat, 0) as amount');
  });

  it('mantiene PBL solo para expedientes sin evento de adjudicación', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/db.ts'), 'utf8');

    expect(source).toContain("WHEN ${terminalContractStatusSql('contracts')}");
    expect(source).not.toContain("status IN ('Desierta', 'Anulada')");
    expect(source).toContain("THEN amount_excl_vat");
    expect(source).toContain('amount_label');
  });

  it('no mezcla PBL en los filtros y ordenación de importe de adjudicación', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/db.ts'), 'utf8');

    expect(source).not.toContain('coalesce(awarded_amount, amount_excl_vat, 0) >= ?');
    expect(source).not.toContain('coalesce(awarded_amount, amount_excl_vat, 0) <= ?');
    expect(source).not.toContain("ORDER BY CASE WHEN award_amount_type IS NULL OR award_amount_type = 'total' THEN coalesce(awarded_amount, amount_excl_vat, 0)");
  });
});
