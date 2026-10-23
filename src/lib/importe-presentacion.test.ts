import { describe, expect, it } from 'vitest';
import { getContractAmountPresentation } from './importe-presentacion';

describe('getContractAmountPresentation', () => {
  it('uses the awarded total when it is known', () => {
    expect(getContractAmountPresentation({
      amount_excl_vat: 100000,
      awarded_amount: 85000,
      award_amount_type: 'total',
      status: 'Adjudicada',
    })).toEqual({
      label: 'Importe adjudicado',
      value: 85000,
      pbl: 100000,
    });
  });

  it.each(['Anulada', 'Cancelled', 'Desierta', 'Deserted'])(
    'does not expose residual awarded amounts for terminal status %s',
    (status) => {
      expect(getContractAmountPresentation({
        amount_excl_vat: 100000,
        awarded_amount: 85000,
        award_amount_type: 'total',
        status,
        award_date: '2026-09-01',
        awardee: 'Empresa residual',
      })).toEqual({
        label: 'Presupuesto base',
        value: 100000,
        pbl: 100000,
      });
    }
  );

  it('uses PBL explicitly for a non-awarded tender', () => {
    expect(getContractAmountPresentation({
      amount_excl_vat: 100000,
      awarded_amount: null,
      award_amount_type: 'total',
      status: 'En plazo',
    })).toEqual({
      label: 'Presupuesto base',
      value: 100000,
      pbl: 100000,
    });
  });

  it('does not present PBL as the award when an award exists but its amount is unavailable', () => {
    expect(getContractAmountPresentation({
      amount_excl_vat: 100000,
      awarded_amount: null,
      award_amount_type: 'total',
      status: 'Adjudicada',
      award_date: '2026-09-01',
    })).toEqual({
      label: 'Importe adjudicado no disponible',
      value: null,
      pbl: 100000,
    });
  });

  it('keeps unit prices out of total-amount presentation', () => {
    expect(getContractAmountPresentation({
      amount_excl_vat: 100000,
      awarded_amount: 42,
      award_amount_type: 'unitario',
      status: 'Adjudicada',
    })).toEqual({
      label: 'Precio unitario publicado',
      value: 42,
      pbl: 100000,
    });
  });

  it('does not invent a comparable amount for unknown award semantics', () => {
    expect(getContractAmountPresentation({
      amount_excl_vat: 100000,
      awarded_amount: 42,
      award_amount_type: 'desconocido',
      status: 'Adjudicada',
    })).toEqual({
      label: 'Importe no comparable',
      value: null,
      pbl: 100000,
    });
  });
});
