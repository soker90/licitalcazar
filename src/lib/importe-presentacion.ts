import { getContractStatus } from './contract-status';

export interface ContractAmountPresentationInput {
  amount_excl_vat?: number | null;
  awarded_amount?: number | null;
  award_amount_type?: 'total' | 'unitario' | 'desconocido' | null;
  status?: string | null;
  award_date?: string | null;
  awardee?: string | null;
}

export interface ContractAmountPresentation {
  label: 'Importe adjudicado' | 'Presupuesto base' | 'Importe adjudicado no disponible' | 'Precio unitario publicado' | 'Importe no comparable';
  value: number | null;
  pbl: number | null;
}

function hasAwardEvent(c: ContractAmountPresentationInput): boolean {
  const status = (c.status || '').toLowerCase().trim();
  if (c.award_date || c.awardee) return true;
  if (status.includes('adjudic') || status.includes('formaliz')) return true;
  if (status.includes('resuelta')) return false;
  return false;
}

export function getContractAmountPresentation(
  c: ContractAmountPresentationInput,
): ContractAmountPresentation {
  const pbl = c.amount_excl_vat ?? null;
  const contractStatus = getContractStatus({
    estado: c.status,
    fechaAdjudicacion: c.award_date,
    importeAdjudicacion: c.awarded_amount,
  });

  // A residual parent amount must never turn a terminal no-award outcome into
  // an awarded amount in home/list cards.
  if (contractStatus.flags.isTerminal) {
    return { label: 'Presupuesto base', value: pbl, pbl };
  }

  if (c.award_amount_type === 'unitario') {
    return { label: 'Precio unitario publicado', value: c.awarded_amount ?? null, pbl };
  }

  if (c.award_amount_type === 'desconocido') {
    return { label: 'Importe no comparable', value: null, pbl };
  }

  if (c.awarded_amount !== null && c.awarded_amount !== undefined) {
    return { label: 'Importe adjudicado', value: c.awarded_amount, pbl };
  }

  if (hasAwardEvent(c)) {
    return { label: 'Importe adjudicado no disponible', value: null, pbl };
  }

  return { label: 'Presupuesto base', value: pbl, pbl };
}
