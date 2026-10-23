import { describe, it, expect } from 'vitest';
import { getContractStatus } from './contract-status';

describe('getContractStatus (Canonical Contract Lifecycle State Machine)', () => {
  it('correctly resolves Expediente 2/2025 Suministros: formalization supersedes raw PLACSP "Adjudicada" status', () => {
    // Expediente 2/2025 Suministros
    // Raw PLACSP status is "Adjudicada", but formalization has occurred
    const contract2_2025 = {
      estado: 'Adjudicada',
      procedimiento: 'Abierto simplificado',
      tipoContrato: 'Suministros',
      fechaPublicacion: '2026-01-15',
      fechaLimite: '2026-02-05',
      fechaAdjudicacion: '2026-02-19',
      fechaFormalizacion: '2026-04-01',
      importeAdjudicacion: 45000,
      importeSinIva: 52000,
      duracion: '12',
      duracionUnidad: 'MON',
      vigencia: {
        estadoVigencia: 'en_vigor',
        diasRestantes: 200,
        fechaFinEstimada: '2027-04-01',
      },
    };

    const refDate = new Date('2026-05-01T12:00:00Z');
    const status = getContractStatus(contract2_2025, refDate);

    // 1. Canonical Status & Precedence
    expect(status.code).toBe('IN_EXECUTION');
    expect(status.label).toBe('Formalizado / En vigor');
    expect(status.badge.variant).toBe('success');

    // 2. Flags: strictly suppress Art. 153 LCSP false positives
    expect(status.flags.isFormalized).toBe(true);
    expect(status.flags.isPendingFormalization).toBe(false);
    expect(status.flags.isInExecution).toBe(true);
    expect(status.flags.canShowFormalizationPeriodBadge).toBe(false);
    expect(status.flags.economicStatusLabel).toBe('Formalizado');

    // 3. Stepper state
    expect(status.stepper.publicacion).toBe('completed');
    expect(status.stepper.ofertas).toBe('completed');
    expect(status.stepper.adjudicacion).toBe('completed');
    expect(status.stepper.formalizacion).toBe('completed');
    expect(status.stepper.ejecucion).toBe('active');
    expect(status.stepper.recepcion).toBe('pending');
  });

  it('correctly identifies genuine awarded contract pending formalization (Art. 153 LCSP)', () => {
    const pendingContract = {
      estado: 'Adjudicada',
      procedimiento: 'Abierto',
      tipoContrato: 'Servicios',
      fechaPublicacion: '2026-06-01',
      fechaLimite: '2026-06-25',
      fechaAdjudicacion: '2026-08-31',
      fechaFormalizacion: null,
      importeAdjudicacion: 120000,
      importeSinIva: 140000,
    };

    const refDate = new Date('2026-09-05T12:00:00Z');
    const status = getContractStatus(pendingContract, refDate);

    expect(status.code).toBe('AWARDED_PENDING_FORMALIZATION');
    expect(status.label).toBe('Adjudicado — pendiente de formalización');
    expect(status.flags.isFormalized).toBe(false);
    expect(status.flags.isPendingFormalization).toBe(true);
    expect(status.flags.canShowFormalizationPeriodBadge).toBe(true);
    expect(status.flags.economicStatusLabel).toBe('Adjudicado (Pendiente de firma)');

    // Stepper
    expect(status.stepper.adjudicacion).toBe('completed');
    expect(status.stepper.formalizacion).toBe('active');
    expect(status.stepper.ejecucion).toBe('pending');
  });

  it('handles minor contracts (Art. 118 LCSP): skips formalization deed and advances directly to execution', () => {
    const minorContract = {
      estado: 'Resuelta',
      procedimiento: 'Contrato menor',
      tipoContrato: 'Servicios',
      fechaPublicacion: '2025-03-01',
      fechaAdjudicacion: '2025-03-01',
      fechaFormalizacion: null,
      importeAdjudicacion: 12500,
      importeSinIva: 12500,
      duracion: '3',
      duracionUnidad: 'MON',
    };

    const status = getContractStatus(minorContract, new Date('2025-04-01'));

    expect(status.code).toBe('IN_EXECUTION');
    expect(status.flags.canShowFormalizationPeriodBadge).toBe(false);
    expect(status.stepper.ofertas).toBe('skipped');
    expect(status.stepper.formalizacion).toBe('skipped');
    expect(status.stepper.ejecucion).toBe('active');
  });

  it('prioritizes early terminal states: declared deserted contract', () => {
    const desertedContract = {
      estado: 'Desierta',
      procedimiento: 'Abierto simplificado',
      tipoContrato: 'Obras',
      fechaPublicacion: '2025-01-10',
      fechaLimite: '2025-02-01',
      fechaAdjudicacion: null,
      fechaFormalizacion: null,
    };

    const status = getContractStatus(desertedContract);

    expect(status.code).toBe('DESERTED');
    expect(status.flags.isTerminal).toBe(true);
    expect(status.flags.canShowFormalizationPeriodBadge).toBe(false);
    expect(status.stepper.adjudicacion).toBe('alert');
  });

  it('prioritizes early terminal states: canceled / annulled contract', () => {
    const canceledContract = {
      estado: 'Anulada por recurso especial',
      procedimiento: 'Abierto',
      tipoContrato: 'Servicios',
      fechaPublicacion: '2024-05-10',
    };

    const status = getContractStatus(canceledContract);

    expect(status.code).toBe('CANCELED');
    expect(status.flags.isTerminal).toBe(true);
    expect(status.stepper.ofertas).toBe('alert');
  });

  it.each(['Cancelled', 'Canceled', 'Annulled', 'Withdrawn', 'Renounced'])(
    'recognizes English terminal contract status %s',
    (estado) => {
      const status = getContractStatus({
        estado,
        procedimiento: 'Abierto',
        tipoContrato: 'Servicios',
        fechaPublicacion: '2025-01-10',
        fechaAdjudicacion: '2025-02-15',
        fechaFormalizacion: '2025-03-01',
        importeAdjudicacion: 12000,
      });

      expect(status.code).toBe('CANCELED');
      expect(status.flags.isTerminal).toBe(true);
      expect(status.flags.isInExecution).toBe(false);
    }
  );

  it('recognizes English Resolved status without award data as terminal unawarded', () => {
    const status = getContractStatus({
      estado: 'Resolved',
      procedimiento: 'Abierto',
      tipoContrato: 'Servicios',
      fechaPublicacion: '2025-01-10',
      fechaAdjudicacion: null,
      fechaFormalizacion: null,
      importeAdjudicacion: null,
    });

    expect(status.code).toBe('RESOLVED_UNAWARDED');
    expect(status.flags.isTerminal).toBe(true);
    expect(status.flags.isInExecution).toBe(false);
    expect(status.label).toBe('Resuelta sin adjudicar');
  });

  it.each(['Unresolved', 'No resuelta'])(
    'does not classify a non-resolved status as terminal: %s',
    (estado) => {
      const status = getContractStatus({
        estado,
        procedimiento: 'Abierto',
        tipoContrato: 'Servicios',
        fechaPublicacion: '2025-01-10',
        fechaAdjudicacion: null,
        fechaFormalizacion: null,
        importeAdjudicacion: null,
      });

      expect(status.code).not.toBe('RESOLVED_UNAWARDED');
      expect(status.flags.isTerminal).toBe(false);
    }
  );

  it('recognizes English Deserted status as a terminal unawarded result', () => {
    const status = getContractStatus({
      estado: 'Deserted',
      procedimiento: 'Abierto',
      tipoContrato: 'Servicios',
      fechaPublicacion: '2025-01-10',
      fechaAdjudicacion: '2025-02-15',
      fechaFormalizacion: '2025-03-01',
      importeAdjudicacion: 12000,
    });

    expect(status.code).toBe('DESERTED');
    expect(status.flags.isTerminal).toBe(true);
    expect(status.flags.isInExecution).toBe(false);
  });

  it('does not treat PLACSP RES as formalization without explicit formalization evidence', () => {
    const status = getContractStatus({
      estado: 'Resuelta',
      procedimiento: 'Abierto',
      tipoContrato: 'Servicios',
      fechaPublicacion: '2026-01-01',
      fechaLimite: '2026-01-20',
      fechaAdjudicacion: '2026-02-01',
      fechaFormalizacion: null,
      importeAdjudicacion: 120000,
    }, new Date('2026-02-15'));

    expect(status.code).toBe('AWARDED_PENDING_FORMALIZATION');
    expect(status.flags.isFormalized).toBe(false);
  });

  it('treats desistimiento as a canceled terminal state', () => {
    const status = getContractStatus({
      estado: 'Anulada / Desistimiento',
      procedimiento: 'Abierto',
      tipoContrato: 'Servicios',
    });

    expect(status.code).toBe('CANCELED');
    expect(status.flags.isTerminal).toBe(true);
  });

  it('correctly identifies offer evaluation phase when deadline has passed without award', () => {
    const evaluationContract = {
      estado: 'En evaluación',
      procedimiento: 'Abierto',
      fechaPublicacion: '2026-01-01',
      fechaLimite: '2026-01-20',
      fechaAdjudicacion: null,
      fechaFormalizacion: null,
    };

    const refDate = new Date('2026-02-01');
    const status = getContractStatus(evaluationContract, refDate);

    expect(status.code).toBe('UNDER_EVALUATION');
    expect(status.stepper.adjudicacion).toBe('active');
    expect(status.stepper.formalizacion).toBe('pending');
  });

  it('correctly identifies open bidding period when deadline is in the future', () => {
    const openContract = {
      estado: 'Publicada',
      procedimiento: 'Abierto',
      fechaPublicacion: '2026-08-01',
      fechaLimite: '2026-09-30',
      fechaAdjudicacion: null,
    };

    const refDate = new Date('2026-08-15');
    const status = getContractStatus(openContract, refDate);

    expect(status.code).toBe('BIDDING_OPEN');
    expect(status.flags.isBiddingOpen).toBe(true);
    expect(status.stepper.ofertas).toBe('active');
  });
});
