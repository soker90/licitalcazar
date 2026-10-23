import { describe, expect, it } from 'vitest';
import sync from './sync.js';

const { normalizeContractingAuthorityMatch, resolveContractingAuthority } = sync;

const makeTargets = (rows) => ({
  byPlacspId: new Map(rows.filter(r => r.placsp_id).map(r => [r.placsp_id, r])),
  byDir3: new Map(rows.filter(r => r.dir3).map(r => [r.dir3, r])),
  byNif: rows.reduce((map, row) => {
    const list = map.get(row.nif) || [];
    list.push(row);
    map.set(row.nif, list);
    return map;
  }, new Map()),
  byHistoricalName: new Map(rows.flatMap(r =>
    (r.historical_names || []).map(name => [normalizeContractingAuthorityMatch(name), r])
  )),
});

const targets = makeTargets([
  {
    id: 'ayuntamiento',
    placsp_id: '31052930149053',
    nif: 'P1300500D',
    name: 'Concejalía Delegada de Contratación',
    contracting_authority_name: 'Ayuntamiento',
    scope: 'Directa Municipal',
    historical_names: ['Concejalia Delegada Area Régimen Interior del Ayuntamiento de Alcázar de San Juan'],
  },
  {
    id: 'pmc',
    placsp_id: '31071310150891',
    nif: 'P6300505B',
    name: 'Presidencia del Patronato Municipal de Cultura',
    contracting_authority_name: 'Patronato Municipal de Cultura',
    scope: 'Directa Municipal',
    historical_names: ['Presidencia del Patronato Municipal de Cultura'],
  },
  {
    id: 'imd',
    placsp_id: '41083900152150',
    nif: 'P6300504E',
    name: 'Presidencia del Instituto Municipal de Deportes',
    contracting_authority_name: 'Instituto Municipal de Deportes',
    scope: 'Directa Municipal',
    historical_names: ['Presidencia del Instituto Municipal de Deportes'],
  },
]);

describe('resolución de contractingAuthorities en feeds PLACSP', () => {
  it('normaliza names ignorando acentos y puntuación', () => {
    expect(normalizeContractingAuthorityMatch('Concejalía Delegada de Contratación')).toBe(
      'CONCEJALIA DELEGADA DE CONTRATACION'
    );
  });

  it('prioriza ID_PLATAFORMA sobre NIF', () => {
    const resolved = resolveContractingAuthority(
      { ID_PLATAFORMA: '31052930149053', NIF: 'P1300500D' },
      'otro name',
      targets
    );
    expect(resolved?.id).toBe('ayuntamiento');
  });

  it('usa NIF solo cuando identifica un único perfil', () => {
    const resolved = resolveContractingAuthority(
      { NIF: 'P6300504E' },
      'cualquier name',
      targets
    );
    expect(resolved?.id).toBe('imd');
  });

  it('no usa NIF cuando hay varios perfiles con el mismo NIF', () => {
    const multi = makeTargets([
      { id: 'a', placsp_id: '1', nif: 'P', contracting_authority_name: 'A', scope: 'A' },
      { id: 'b', placsp_id: '2', nif: 'P', contracting_authority_name: 'B', scope: 'B' },
    ]);
    expect(resolveContractingAuthority({ NIF: 'P' }, 'desconocido', multi)).toBeNull();
  });

  it('rechaza un name histórico ambiguo entre perfiles', () => {
    const multi = makeTargets([
      { id: 'a', placsp_id: '1', nif: 'A', contracting_authority_name: 'A', scope: 'A', historical_names: ['Nombre compartido'] },
      { id: 'b', placsp_id: '2', nif: 'B', contracting_authority_name: 'B', scope: 'B', historical_names: ['Nombre compartido'] },
    ]);
    expect(resolveContractingAuthority({ NIF: '' }, 'Nombre compartido', multi)).toBeNull();
  });

  it('permite una asignación histórica explícita por name configurado', () => {
    const resolved = resolveContractingAuthority(
      { NIF: 'P1300500D' },
      'Concejalia Delegada Area Régimen Interior del Ayuntamiento de Alcázar de San Juan',
      targets
    );
    expect(resolved?.id).toBe('ayuntamiento');
  });
});
