import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { ensureSubvencionesTable, getSubvencionesByNifs } from './db';
import { buildTargetPatterns, isTargetOrgan } from '../../scripts/sync-subvenciones';

describe('Integración BDNS - Subvenciones Públicas (Issue #17)', () => {
  describe('isAlcazarOrgan', () => {
    it('detecta entes y convocatorias del Ayuntamiento de Alcázar de San Juan', () => {
      expect(isTargetOrgan({ nivel3: 'AYUNTAMIENTO DE ALCAZAR DE SAN JUAN' }, ['AYUNTAMIENTO DE ALCAZAR DE SAN JUAN'])).toBe(true);
      expect(isTargetOrgan({ nivel2: 'ALCAZAR DE SAN JUAN' }, ['ALCAZAR DE SAN JUAN'])).toBe(true);
      expect(isTargetOrgan({ nivel1: 'LOCAL', convocatoria: 'Ayudas municipales directas del Ayuntamiento de Alcázar de San Juan' }, ['AYUNTAMIENTO DE ALCAZAR DE SAN JUAN'])).toBe(true);
    });

    it('no clasifica entes externos como Alcázar', () => {
      expect(isTargetOrgan({ nivel1: 'AUTONOMICA', nivel2: 'CASTILLA-LA MANCHA', nivel3: 'CONSEJERÍA DE ECONOMÍA' }, ['AYUNTAMIENTO DE ALCAZAR DE SAN JUAN'])).toBe(false);
      expect(isTargetOrgan({ nivel1: 'ESTADO', nivel2: 'MINISTERIO DE HACIENDA' }, ['AYUNTAMIENTO DE ALCAZAR DE SAN JUAN'])).toBe(false);
    });
  });

  describe('buildTargetPatterns', () => {
    it('deriva la nomenclatura municipal que usa BDNS desde las autoridades de PLACSP', () => {
      const patterns = buildTargetPatterns([
        { name: 'Concejalía Delegada de Contratación del Ayuntamiento de Alcázar de San Juan' },
      ]);

      expect(patterns).toContain('CONCEJALIA DELEGADA DE CONTRATACION DEL AYUNTAMIENTO DE ALCAZAR DE SAN JUAN');
      expect(patterns).toContain('AYUNTAMIENTO DE ALCAZAR DE SAN JUAN');
      expect(patterns).toContain('ALCAZAR DE SAN JUAN');
    });
  });

  describe('getSubvencionesByNifs', () => {
    it('crea la tabla subvenciones y agrega correctamente concesiones por CIF', () => {
      const db = new DatabaseSync(':memory:');
      ensureSubvencionesTable(db);

      // Insertar datos de prueba
      db.prepare(`
        INSERT INTO grants (
          bdns_id, award_code, beneficiary_nif, beneficiary,
          granting_authority, granting_authority_level_1, granting_authority_level_2, granting_authority_level_3,
          amount, grant_date, instrument, call, is_alcazar
        ) VALUES 
        (1001, 'SB01', 'B13016415', 'INTEDHOR SL', 'INSTITUTO REGIONAL SSL', 'AUTONOMICA', 'CASTILLA-LA MANCHA', 'IRSSL', 2500, '2024-05-10', 'Subvención', 'CLM Más Segura', 0),
        (1002, 'SB02', 'B13016415', 'INTEDHOR SL', 'MINISTERIO ENERGIA', 'ESTADO', 'MINISTERIO', 'DG', 15000, '2023-11-20', 'Subvención', 'RECORE', 0),
        (1003, 'SB03', 'B13016415', 'INTEDHOR SL', 'AYUNTAMIENTO ALCAZAR', 'LOCAL', 'ALCÁZAR DE SAN JUAN', 'AYTO', 3000, '2022-04-15', 'Subvención', 'Ayuda Local', 1);
      `).run();

      const res = getSubvencionesByNifs(db, ['B13016415']);

      expect(res.total).toBe(3);
      expect(res.volumenTotal).toBe(20500);
      expect(res.totalAlcazar).toBe(1);
      expect(res.volumenAlcazar).toBe(3000);
      expect(res.totalOtras).toBe(2);
      expect(res.volumenOtras).toBe(17500);
      expect(res.items.length).toBe(3);
      expect(res.items[0].grant_date).toBe('2024-05-10'); // Orden cronológico descendente
    });

    it('devuelve estructura vacía si no hay NIFs válidos o no constan registros', () => {
      const db = new DatabaseSync(':memory:');
      ensureSubvencionesTable(db);

      const emptyRes = getSubvencionesByNifs(db, ['A00000000']);
      expect(emptyRes.total).toBe(0);
      expect(emptyRes.volumenTotal).toBe(0);
      expect(emptyRes.items).toEqual([]);

      const invalidRes = getSubvencionesByNifs(db, ['***123***']);
      expect(invalidRes.total).toBe(0);
    });
  });
});
