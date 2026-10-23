import { afterEach, describe, expect, it } from 'vitest';
import { getMenoresRecurrentes, setDbForTests } from './db';
import { createGeneratedTestDb } from './test-db';

describe('minor contract analytics', () => {
  afterEach(() => {
    setDbForTests(null);
  });

  it('does not use PBL when the awarded amount is missing', () => {
    const db = createGeneratedTestDb(21601, 3);

    try {
      db.exec("DELETE FROM contracts WHERE id NOT IN ('generated-21601-1', 'generated-21601-2', 'generated-21601-3')");
      db.exec(`
        UPDATE contracts
        SET awardee = 'Empresa Recurrente',
            awardee_nif = 'B00000001',
            dataset = 'menores',
            procedure = 'Contrato menor',
            contract_type = 'Servicios',
            status = 'Adjudicada',
            scope = 'Directa Municipal',
            award_amount_type = 'total',
            amount_excl_vat = CASE id
              WHEN 'generated-21601-1' THEN 12000
              WHEN 'generated-21601-2' THEN 14000
              ELSE 14999
            END,
            estimated_value = NULL,
            awarded_amount = CASE id
              WHEN 'generated-21601-1' THEN 10000
              WHEN 'generated-21601-2' THEN 10000
              ELSE NULL
            END
      `);

      setDbForTests(db);
      const [empresa] = getMenoresRecurrentes(undefined, 15);

      expect(empresa).toMatchObject({
        totalMenores: 3,
        volumenTotal: 20000,
        mediaImporte: 10000,
        maxVec: null,
        umbralLegal: null,
        diferenciaUmbral: null,
        alertaUmbral: false,
      });
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it.each(['Anulada', 'Cancelled', 'Desierta', 'Deserted'])(
    'excludes terminal contract %s from recurrent-minor counts and metrics',
    (terminalStatus) => {
      const db = createGeneratedTestDb(21606, 4);
      try {
        db.prepare(`
          UPDATE contracts
          SET awardee = 'Empresa Recurrente Terminal',
              awardee_nif = 'B00000006',
              dataset = 'menores',
              procedure = 'Contrato menor',
              contract_type = 'Servicios',
              scope = 'Directa Municipal',
              award_amount_type = 'total',
              year = 2026,
              status = CASE
                WHEN id = 'generated-21606-4' THEN ?
                ELSE 'Adjudicada'
              END,
              awarded_amount = CASE id
                WHEN 'generated-21606-1' THEN 1000
                WHEN 'generated-21606-2' THEN 2000
                WHEN 'generated-21606-3' THEN 3000
                ELSE 9000
              END,
              estimated_value = CASE id
                WHEN 'generated-21606-1' THEN 10000
                WHEN 'generated-21606-2' THEN 11000
                WHEN 'generated-21606-3' THEN 12000
                ELSE 14999
              END
        `).run(terminalStatus);

        setDbForTests(db);
        const [empresa] = getMenoresRecurrentes(undefined, 15);

        expect(empresa).toMatchObject({
          awardee: 'Empresa Recurrente Terminal',
          totalMenores: 3,
          volumenTotal: 6000,
          mediaImporte: 2000,
          maxVec: 12000,
          umbralLegal: 15000,
          diferenciaUmbral: 3000,
          alertaUmbral: false,
        });
      } finally {
        setDbForTests(null);
        db.close();
      }
    }
  );

  it('usa el VEC para calcular la proximidad al umbral y no la adjudicación', () => {
    const db = createGeneratedTestDb(21602, 3);
    try {
      db.exec("DELETE FROM contracts WHERE id NOT IN ('generated-21602-1', 'generated-21602-2', 'generated-21602-3')");
      db.exec(`
        UPDATE contracts
        SET awardee = 'Empresa VEC', awardee_nif = 'B00000002', dataset = 'menores',
            procedure = 'Contrato menor', contract_type = 'Servicios', status = 'Adjudicada',
            scope = 'Directa Municipal', awarded_amount = 5000, amount_excl_vat = 5000,
            estimated_value = CASE id
              WHEN 'generated-21602-1' THEN 10000
              WHEN 'generated-21602-2' THEN 14000
              ELSE 14900
            END
      `);
      setDbForTests(db);
      const [empresa] = getMenoresRecurrentes(undefined, 15);
      expect(empresa.maxVec).toBe(14900);
      expect(empresa.umbralLegal).toBe(15000);
      expect(empresa.diferenciaUmbral).toBe(100);
      expect(empresa.alertaUmbral).toBe(true);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('deja sin determinar el umbral si el proveedor no tiene VEC informado', () => {
    const db = createGeneratedTestDb(21603, 3);
    try {
      db.exec("DELETE FROM contracts WHERE id NOT IN ('generated-21603-1', 'generated-21603-2', 'generated-21603-3')");
      db.exec(`
        UPDATE contracts
        SET awardee = 'Empresa Sin VEC', awardee_nif = 'B00000003', dataset = 'menores',
            procedure = 'Contrato menor', contract_type = 'Servicios', status = 'Adjudicada',
            scope = 'Directa Municipal', awarded_amount = 14999, amount_excl_vat = 14999,
            estimated_value = NULL
      `);
      setDbForTests(db);
      const [empresa] = getMenoresRecurrentes(undefined, 15);
      expect(empresa.maxVec).toBeNull();
      expect(empresa.umbralLegal).toBeNull();
      expect(empresa.diferenciaUmbral).toBeNull();
      expect(empresa.alertaUmbral).toBe(false);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
  it('usa adjudicatarios y VEC de lotes en menores recurrentes', () => {
    const db = createGeneratedTestDb(21604, 3);
    try {
      db.exec(`
        UPDATE contracts
        SET awardee = 'Varios adjudicatarios', awardee_nif = NULL, dataset = 'menores',
            procedure = 'Contrato menor', contract_type = 'Servicios', status = 'Adjudicada',
            scope = 'Directa Municipal', award_amount_type = 'total',
            awarded_amount = 9000, estimated_value = 20000
      `);
      db.exec(`
        INSERT INTO contract_lots (
          id, contract_id, case_number, lot_number, lot_name,
          budget_excl_vat, estimated_value, awarded_amount, awardee, awardee_nif, lot_status
        ) VALUES
          ('minor-lot-1', 'generated-21604-1', 'GEN/2024/1', '1', 'Lote 1', 4000, 10000, 2000, 'Empresa Lotes', 'B00000004', 'Adjudicado'),
          ('minor-lot-2', 'generated-21604-2', 'GEN/2024/2', '1', 'Lote 1', 6000, 14000, 2000, 'Empresa Lotes', 'B00000004', 'Adjudicado'),
          ('minor-lot-3', 'generated-21604-3', 'GEN/2024/3', '1', 'Lote 1', 7000, 14900, 2000, 'Empresa Lotes', 'B00000004', 'Adjudicado')
      `);
      db.exec(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awardee_nif, awarded_amount, award_date, result_state
        ) VALUES
          ('minor-award-1', 'generated-21604-1', 'GEN/2024/1', '1', 0, 'Empresa Award Lotes', 'B00000004', 2000, '2024-01-01', 'Adjudicado'),
          ('minor-award-2', 'generated-21604-2', 'GEN/2024/2', '1', 0, 'Empresa Award Lotes', 'B00000004', 2000, '2024-01-02', 'Adjudicado'),
          ('minor-award-3', 'generated-21604-3', 'GEN/2024/3', '1', 0, 'Empresa Award Lotes', 'B00000004', 2000, '2024-01-03', 'Adjudicado')
      `);

      setDbForTests(db);
      const [empresa] = getMenoresRecurrentes(undefined, 15);

      expect(empresa).toMatchObject({
        awardee: 'Empresa Award Lotes',
        nif: 'B00000004',
        totalMenores: 3,
        volumenTotal: 6000,
        mediaImporte: 2000,
        maxVec: 14900,
        umbralLegal: 15000,
        diferenciaUmbral: 100,
        alertaUmbral: true,
      });
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('cuenta un contrato una sola vez aunque tenga varios lot_awards', () => {
    const db = createGeneratedTestDb(21605, 3);
    try {
      db.exec(`
        UPDATE contracts
        SET awardee = 'Varios adjudicatarios', awardee_nif = NULL,
            dataset = 'menores', procedure = 'Contrato menor',
            contract_type = 'Servicios', status = 'Adjudicada',
            scope = 'Directa Municipal', award_amount_type = 'total'
      `);
      db.exec(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awardee_nif, awarded_amount, result_state
        ) VALUES
          ('minor-multi-award-1a', 'generated-21605-1', 'GEN/2024/1', '1', 0, 'Empresa Multiganadora', 'B00000005', 1000, 'Adjudicado'),
          ('minor-multi-award-1b', 'generated-21605-1', 'GEN/2024/1', '1', 1, 'Empresa Multiganadora', 'B00000005', 1000, 'Adjudicado'),
          ('minor-multi-award-2', 'generated-21605-2', 'GEN/2024/2', '1', 0, 'Empresa Multiganadora', 'B00000005', 2000, 'Adjudicado'),
          ('minor-multi-award-3', 'generated-21605-3', 'GEN/2024/3', '1', 0, 'Empresa Multiganadora', 'B00000005', 3000, 'Adjudicado')
      `);

      setDbForTests(db);
      const [empresa] = getMenoresRecurrentes(undefined, 15);

      expect(empresa).toMatchObject({
        awardee: 'Empresa Multiganadora',
        nif: 'B00000005',
        totalMenores: 3,
        volumenTotal: 7000,
      });
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

});
