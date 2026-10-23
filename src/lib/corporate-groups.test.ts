import { describe, expect, it } from 'vitest';
import corporateGroups from '../data/corporate-groups.json';
import { getCorporateGroupForCif } from './corporate';

const catalog = Object.fromEntries(
  Object.entries(corporateGroups).map(([id, group]) => [
    id,
    {
      id,
      nombre: group.nombre ?? group.name,
      name: group.name ?? group.nombre,
      description: group.description ?? '',
      ambito: group.ambito ?? group.scope ?? '',
      scope: group.scope ?? group.ambito ?? '',
      cifs: group.cifs,
      sede: group.sede,
      color: group.color,
    },
  ])
);

describe('corporate groups catalog', () => {
  it('keeps a stable catalog identity and exposes every configured group', () => {
    const ids = Object.keys(corporateGroups);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);

    for (const id of ids) {
      expect(catalog[id].id).toBe(id);
      expect(catalog[id].cifs).toEqual(corporateGroups[id].cifs);
    }
  });

  it('resolves CIF membership from the externalized catalog', () => {
    for (const group of Object.values(catalog)) {
      for (const cif of group.cifs) {
        expect(getCorporateGroupForCif(cif, catalog)?.id).toBe(group.id);
      }
    }
  });
});
