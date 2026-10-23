import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('contadores de alertas del explorador', () => {
  it('no usa cifras históricas hardcodeadas como fallback', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/licitaciones/page.tsx'),
      'utf8',
    );

    expect(source).not.toContain('ofertaUnica ?? 255');
    expect(source).not.toContain('alMaximo ?? 56');
    expect(source).not.toContain('alertaMenor ?? 131');
    expect(source).not.toContain('fondosUe ?? 160');
    expect(source).not.toContain('prorroga ?? 28');

    expect(source).toContain("ofertaUnica ?? '—'");
    expect(source).toContain("alMaximo ?? '—'");
    expect(source).toContain("alertaMenor ?? '—'");
    expect(source).toContain("fondosUe ?? '—'");
    expect(source).toContain("prorroga ?? '—'");
  });
});


describe('etiqueta de límite legal de contratos menores', () => {
  it('usa el VEC y no PBL/adjudicación para evaluar el umbral', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/licitaciones/page.tsx'),
      'utf8',
    );

    expect(source).toContain('lic.valor_estimado != null');
    expect(source).toContain('lic.valor_estimado >= 36000');
    expect(source).toContain('lic.valor_estimado < 40000');
    expect(source).toContain('lic.valor_estimado >= 13500');
    expect(source).toContain('lic.valor_estimado < 15000');
    expect(source).toContain('lic.valor_estimado >= 40000');
    expect(source).toContain('lic.valor_estimado >= 15000');
    expect(source).toContain('⚠️ Cerca del límite legal');
    expect(source).toContain('🎯 Límite legal');
    expect(source).not.toContain("lic.award_amount_type !== 'unitario' && lic.award_amount_type !== 'desconocido' && lic.valor_estimado");
    expect(source).not.toContain('(lic.importe_adjudicacion || lic.importe_sin_iva || 0) >= 36000');
    expect(source).not.toContain('(lic.importe_adjudicacion || lic.importe_sin_iva || 0) >= 13500');
    expect(source).not.toContain('(lic.importe_adjudicacion || lic.importe_sin_iva || 0) >= 40000');
    expect(source).not.toContain('(lic.importe_adjudicacion || lic.importe_sin_iva || 0) >= 15000');
  });
});
