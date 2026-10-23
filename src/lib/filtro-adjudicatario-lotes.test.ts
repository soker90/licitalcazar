import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Filtro de adjudicatario lot-aware', () => {
  it('incluye coincidencias de adjudicatarios y NIF de lotes sin duplicar expedientes', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/db.ts'), 'utf8');
    const start = source.indexOf('export function getLicitaciones');
    const end = source.indexOf('export function getLicitacionById', start);
    const filters = source.slice(start, end);

    expect(filters).toContain('lot.contract_id = contracts.id');
    expect(filters).toContain('AND lot.awardee = ?');
    expect(filters).toContain('AND lot.awardee_nif = ?');
    expect(filters).toContain('lot.awardee LIKE ? OR lot.awardee_nif LIKE ?');
  });
});


  it('busca también en lot_awards para no ocultar adjudicatarios secundarios', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/db.ts'), 'utf8');

    expect(source).toContain('FROM lot_awards award');
    expect(source).toContain('count(DISTINCT lot.lot_number)');
    expect(source).toContain('award.awardee LIKE ?');
    expect(source).toContain('award.awardee_nif LIKE ?');
    expect(source).toContain('award.awardee = ?');
    expect(source).toContain('award.awardee_nif = ?');
  });