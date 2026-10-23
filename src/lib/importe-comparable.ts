export interface ComparableAmountContract {
  importe_adjudicacion?: number | null;
  importe_sin_iva?: number | null;
  award_amount_type?: 'total' | 'unitario' | 'desconocido' | null;
}

export function esImporteAdjudicacionComparable(c: ComparableAmountContract): boolean {
  return (c.award_amount_type == null || c.award_amount_type === 'total') && c.importe_adjudicacion != null;
}

export function getContratoImporteComparable(c: ComparableAmountContract): number {
  return esImporteAdjudicacionComparable(c) ? c.importe_adjudicacion! : 0;
}
