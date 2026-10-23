import { describe, expect, it } from 'vitest';
import verifiedPersonMappings from '../data/verified-person-mappings.json';
import { resolveEntity } from './corporate';

const verifiedPersons = Object.fromEntries(
  Object.entries(verifiedPersonMappings).map(([name, mapping]) => [
    name,
    {
      canonicalId: mapping.canonicalId,
      variantesEnmascaradas: mapping.variantesEnmascaradas,
    },
  ])
);

const catalog = {
  corporateGroups: {},
  knownRebrandings: {},
  cifCorrections: {},
  verifiedPersons,
};

describe('verified person mappings privacy', () => {
  it('stores only opaque canonical identifiers', () => {
    for (const mapping of Object.values(verifiedPersonMappings)) {
      expect(mapping.canonicalId).toMatch(/^pf-[0-9a-f]{12}$/);
      expect(mapping.dniVerificado).toBe(mapping.canonicalId);
      expect(JSON.stringify(mapping)).not.toMatch(/\b\d{8}[A-Z]\b/i);
    }
  });

  it('resolves masked identifiers to the existing opaque identity', () => {
    const resolved = resolveEntity('***789***', 'JAVIER PINTOR LUCAS', catalog);
    expect(resolved.canonicalId).toBe('pf-5a0a4aee0755');
    expect(resolved.canonicalCif).toBe('pf-5a0a4aee0755');
    expect(resolved.tipoVinculo).toBe('dni_enmascarado');
  });
});
