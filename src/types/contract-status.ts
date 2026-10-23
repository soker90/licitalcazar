export type ContractCanonicalStatus =
  | 'CANCELED'                      // Anulada, cancelada o desistida
  | 'DESERTED'                      // Declarada desierta
  | 'RESOLVED_UNAWARDED'            // Resuelta formalmente sin adjudicación
  | 'IN_EXECUTION'                  // Formalizada y en periodo activo de ejecución
  | 'FORMALIZED'                    // Formalizada (concluida o en tramitación posterior)
  | 'AWARDED_PENDING_FORMALIZATION' // Adjudicada pero estrictamente pendiente de formalización (Art. 153 LCSP)
  | 'UNDER_EVALUATION'              // Plazo cerrado, ofertas en mesa de evaluación
  | 'BIDDING_OPEN'                  // Convocatoria abierta, recepción de ofertas
  | 'PUBLISHED';                    // Convocatoria publicada

export type StepState = 'completed' | 'active' | 'pending' | 'alert' | 'skipped';

export interface ContractStatusInput {
  estado?: string | null;
  procedimiento?: string | null;
  tipoContrato?: string | null;
  fechaPublicacion?: string | null;
  fechaLimite?: string | null;
  fechaAdjudicacion?: string | null;
  fechaFormalizacion?: string | null;
  fechaInicioEjecucion?: string | null;
  importeAdjudicacion?: number | null;
  importeSinIva?: number | null;
  duracion?: string | null;
  duracionUnidad?: string | null;
  vigencia?: {
    estadoVigencia?: 'en_vigor' | 'proximo_vencimiento' | 'vencido' | 'desconocido' | string | null;
    diasRestantes?: number | null;
    fechaFinEstimada?: string | null;
  } | null;
  refDate?: Date;
}

export interface ContractStatusBadgeConfig {
  label: string;
  sublabel?: string;
  variant: 'default' | 'success' | 'warning' | 'info' | 'danger' | 'neutral';
  tooltip?: string;
}

export interface ContractStatusResult {
  code: ContractCanonicalStatus;
  label: string;
  badge: ContractStatusBadgeConfig;
  flags: {
    isTerminal: boolean;
    isFormalized: boolean;
    isPendingFormalization: boolean;
    isInExecution: boolean;
    isCompleted: boolean;
    isBiddingOpen: boolean;
    isUnderEvaluation: boolean;
    canShowFormalizationPeriodBadge: boolean;
    economicStatusLabel: 'Formalizado' | 'Adjudicado (Pendiente de firma)' | 'En evaluación' | 'En licitación' | 'Cancelado / Desierto';
  };
  stepper: {
    publicacion: StepState;
    ofertas: StepState;
    adjudicacion: StepState;
    formalizacion: StepState;
    ejecucion: StepState;
    recepcion: StepState;
  };
}
