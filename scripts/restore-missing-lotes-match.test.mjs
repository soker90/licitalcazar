import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveCurrentContract, buildRestoredLotRow } = require('./restore-missing-lotes-match');

describe('restore-missing-lotes matching', () => {
  it('falls back to the previous contract case number when the internal id changed', () => {
    const previousContract = { id: 'ctr_old', case_number: '7/2025 Obras', contracting_authority_id: 'AUTH-A' };
    const currentContract = { id: 'ctr_new', case_number: '7/2025 Obras', contracting_authority_id: 'AUTH-A' };

    const currentIndex = {
      byId: new Map([[currentContract.id, currentContract]]),
      byExpediente: new Map([[currentContract.case_number, [currentContract]]]),
    };

    expect(resolveCurrentContract(previousContract, currentIndex, previousContract.id)).toEqual(currentContract);
  });

  it('normalizes a numeric .0 suffix before matching', () => {
    const currentContract = { id: '123', case_number: '7/2025 Obras', contracting_authority_id: 'AUTH-A' };
    const currentIndex = {
      byId: new Map([[currentContract.id, currentContract]]),
      byExpediente: new Map([[currentContract.case_number, [currentContract]]]),
    };

    expect(resolveCurrentContract({ case_number: '7/2025 Obras', contracting_authority_id: 'AUTH-A' }, currentIndex, '123.0')).toEqual(currentContract);
  });

  it('still prefers an exact current internal id', () => {
    const exact = { id: 'ctr_same', case_number: 'old' };
    const byCase = { id: 'ctr_other', case_number: 'same' };

    const currentIndex = {
      byId: new Map([[exact.id, exact]]),
      byExpediente: new Map([[byCase.case_number, [byCase]]]),
    };

    expect(resolveCurrentContract({ case_number: byCase.case_number }, currentIndex, exact.id)).toEqual(exact);
  });

  it('does not guess when the case number matches multiple current contracts', () => {
    const candidates = [
      { id: 'ctr_a', case_number: '7/2025 Obras', contracting_authority_id: 'AUTH-A' },
      { id: 'ctr_b', case_number: '7/2025 Obras', contracting_authority_id: 'AUTH-A' },
    ];
    const currentIndex = {
      byId: new Map(),
      byExpediente: new Map([['7/2025 Obras', candidates]]),
    };

    expect(resolveCurrentContract({ case_number: '7/2025 Obras', contracting_authority_id: 'AUTH-A' }, currentIndex, 'ctr_old')).toBeUndefined();
  });
  it('rebuilds restored lot identity and parent fields when the contract ID changed', () => {
    const oldLot = {
      id: 'ctr_old_lote_2',
      contract_id: 'ctr_old',
      case_number: '7/2025 Obras',
      lot_number: '2',
      lot_name: 'Pavimentación',
      awarded_amount: 1200,
    };

    expect(buildRestoredLotRow(oldLot, {
      id: 'ctr_new',
      case_number: '7/2025 Obras actualizado',
    })).toEqual({
      ...oldLot,
      id: 'ctr_new_lote_2',
      contract_id: 'ctr_new',
      case_number: '7/2025 Obras actualizado',
    });
  });
  it('does not match an expediente belonging to another authority even if it is the only candidate', () => {
    const previousContract = {
      id: 'ctr_old',
      case_number: '7/2025 Obras',
      contracting_authority_id: 'AUTH-A',
    };
    const otherAuthority = {
      id: 'ctr_new',
      case_number: '7/2025 Obras',
      contracting_authority_id: 'AUTH-B',
    };
    const currentIndex = {
      byId: new Map(),
      byExpediente: new Map([[otherAuthority.case_number, [otherAuthority]]]),
    };

    expect(resolveCurrentContract(previousContract, currentIndex, 'ctr_old')).toBeUndefined();
  });

  it('matches a changed ID only when both expediente and authority match', () => {
    const previousContract = {
      id: 'ctr_old',
      case_number: '7/2025 Obras',
      contracting_authority_id: 'AUTH-A',
    };
    const matching = {
      id: 'ctr_new',
      case_number: '7/2025 Obras',
      contracting_authority_id: 'AUTH-A',
    };
    const otherAuthority = {
      id: 'ctr_other',
      case_number: '7/2025 Obras',
      contracting_authority_id: 'AUTH-B',
    };
    const currentIndex = {
      byId: new Map(),
      byExpediente: new Map([[matching.case_number, [matching, otherAuthority]]]),
    };

    expect(resolveCurrentContract(previousContract, currentIndex, 'ctr_old')).toBe(matching);
  });

  it.each(['Cancelled', 'Canceled', 'Annulled', 'Anulada', 'Desierto', 'Withdrawn'])(
    'clears residual award data when restoring terminal lot status %s',
    (status) => {
      const restored = buildRestoredLotRow({
        lot_number: '2',
        lot_status: status,
        budget_excl_vat: 2000,
        awarded_amount: 1200,
        awarded_amount_incl_vat: 1452,
        awardee: 'Empresa residual',
        awardee_nif: 'B12345678',
      }, { id: 'ctr_new', case_number: '7/2025 Obras' });

      expect(restored).toMatchObject({
        lot_status: status,
        budget_excl_vat: 2000,
        awarded_amount: null,
        awarded_amount_incl_vat: null,
        awardee: null,
        awardee_nif: null,
      });
    }
  );

  it('pseudonymizes personal NIFs before restored lots are inserted', () => {
    const restoredPerson = buildRestoredLotRow(
      { lot_number: '1', awardee: 'Nombre Apellido', awardee_nif: '12345670A' },
      { id: 'ctr_new', case_number: '7/2025 Obras' },
    );
    const restoredCompany = buildRestoredLotRow(
      { lot_number: '2', awardee: 'Empresa SL', awardee_nif: 'B12345678' },
      { id: 'ctr_new', case_number: '7/2025 Obras' },
    );

    expect(restoredPerson.awardee_nif).toMatch(/^pf-[a-f0-9]{12}$/);
    expect(restoredPerson.awardee_nif).not.toBe('12345670A');
    expect(restoredCompany.awardee_nif).toBe('B12345678');
  });

});
