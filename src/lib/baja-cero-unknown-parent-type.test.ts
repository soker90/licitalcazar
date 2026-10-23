import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('zero-discount filtering with unknown parent amount type', () => {
  it('uses complete per-lot coverage without falling back to the unknown parent amount', () => {
    const source = fs.readFileSync(new URL('./db.ts', import.meta.url), 'utf8');
    const start = source.indexOf('const lotAwareBajaCeroAwardedAmount =');
    const end = source.indexOf('const lotAwarePbl =', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const expression = source.slice(start, end);
    expect(expression).toContain("award_amount_type IS NULL OR award_amount_type = 'total'");
    expect(expression).toContain("award_amount_type = 'desconocido'");
    expect(expression).toContain('lotAwardsAmountCovered');
    expect(expression).toContain("eligibleAwardResultStateSql('award')");
    expect(expression).toContain("excludeAwardWhenLegacyLotTerminalSql('award')");
    expect(expression).toContain('round(sum(award.awarded_amount), 2)');
    expect(expression).toContain('ELSE NULL');
    expect(expression).not.toContain('allowParentAwardAmountFallbackSql');
  });

  it('uses the dedicated lot-aware amount only for the zero-discount filter', () => {
    const source = fs.readFileSync(new URL('./db.ts', import.meta.url), 'utf8');
    const start = source.indexOf('if (opts.bajaCero)');
    const end = source.indexOf('if (opts.alertaMenor)', start);
    const filter = source.slice(start, end);

    expect(filter).toContain('${lotAwareBajaCeroAwardedAmount} IS NOT NULL');
    expect(filter).toContain('abs(${lotAwareBajaCeroAwardedAmount} - ${lotAwarePbl}) <= 0.05');
    expect(filter).not.toContain("award_amount_type IS NULL OR award_amount_type = 'total'");
    expect(filter).not.toContain('${lotAwareAwardedAmount} IS NOT NULL');
  });
});
