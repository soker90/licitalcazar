import {
  ContractStatusInput,
  ContractStatusResult,
  ContractCanonicalStatus,
  ContractStatusBadgeConfig,
} from '@/types/contract-status';

/**
 * Pure function to resolve the single source of truth for contract lifecycle state.
 * Implements strict legal precedence under Ley 9/2017 (LCSP):
 * 1. Terminal states (Canceled, Deserted, Resolved without award)
 * 2. Formalized & in-execution states (Formalization event supersedes raw PLACSP text "Adjudicada")
 * 3. Awarded pending formalization (Only when awarded, not formalized, and not a minor contract)
 * 4. Evaluation (Offer deadline expired or in evaluation)
 * 5. Bidding open / Convocatoria published
 */
export function getContractStatus(
  input: ContractStatusInput,
  currentDate: Date = new Date()
): ContractStatusResult {
  const {
    estado,
    procedimiento,
    fechaLimite,
    fechaAdjudicacion,
    fechaFormalizacion,
    vigencia,
    refDate = currentDate,
  } = input;

  const normalizedStatus = (estado || '').toLowerCase().trim();
  const normalizedProc = (procedimiento || '').toLowerCase().trim();
  const isMinorContract = normalizedProc.includes('menor');
  const nowMs = refDate.getTime();

  // ---------------------------------------------------------------------------
  // 1. EARLY TERMINAL STATES (Highest Precedence)
  // ---------------------------------------------------------------------------
  const isCanceled =
    normalizedStatus.includes('anulad') ||
    normalizedStatus.includes('annul') ||
    normalizedStatus.includes('cancelad') ||
    normalizedStatus.includes('cancel') ||
    normalizedStatus.includes('renuncia') ||
    normalizedStatus.includes('renounc') ||
    normalizedStatus.includes('desist') ||
    normalizedStatus.includes('desestimad') ||
    normalizedStatus.includes('withdraw');

  if (isCanceled) {
    return buildResult(
      'CANCELED',
      'Anulada',
      {
        variant: 'danger',
        tooltip: 'Procedimiento cancelado, anulado o desistido formalmente.',
      },
      input
    );
  }

  const isDeserted = normalizedStatus.includes('desiert') || normalizedStatus.includes('desert');
  if (isDeserted) {
    return buildResult(
      'DESERTED',
      'Declarada desierta',
      {
        variant: 'warning',
        tooltip: 'Licitación concluida sin adjudicación por falta de ofertas admisibles.',
      },
      input
    );
  }

  const isResolvedStatus =
    normalizedStatus === 'resuelta' ||
    normalizedStatus.startsWith('resuelta ') ||
    normalizedStatus === 'resolved' ||
    normalizedStatus.startsWith('resolved ');

  const isResolvedUnawarded =
    isResolvedStatus &&
    !fechaAdjudicacion &&
    !fechaFormalizacion &&
    !input.importeAdjudicacion;

  if (isResolvedUnawarded) {
    return buildResult(
      'RESOLVED_UNAWARDED',
      'Resuelta sin adjudicar',
      {
        variant: 'neutral',
        tooltip: 'Expediente resuelto administrativamente sin adjudicación formal.',
      },
      input
    );
  }

  // ---------------------------------------------------------------------------
  // 2. FORMALIZED & EXECUTION STATES
  // Formalization requires explicit evidence: a formalization date or an
  // explicit formalized state. PLACSP's RES means the folder is resolved; it
  // does not by itself prove that the contract has been formalized.
  // For minor contracts (Art. 118 LCSP), expenditure approval and award start execution directly.
  // ---------------------------------------------------------------------------
  const hasFormalizationEvent = Boolean(
    fechaFormalizacion ||
    normalizedStatus.includes('formaliz')
  );

  const isMinorDirectExecution = isMinorContract && Boolean(fechaAdjudicacion);

  if (hasFormalizationEvent || isMinorDirectExecution) {
    const isExplicitlyExpired =
      vigencia?.estadoVigencia === 'vencido' ||
      (typeof vigencia?.diasRestantes === 'number' && vigencia.diasRestantes < 0);

    if (isExplicitlyExpired) {
      return buildResult(
        'FORMALIZED',
        'Formalizado (Vencido)',
        {
          variant: 'neutral',
          tooltip: 'Contrato formalizado con plazo de vigencia y ejecución concluido.',
        },
        input
      );
    }

    // Default to in-execution when formalized and not expired
    return buildResult(
      'IN_EXECUTION',
      isMinorContract ? 'En ejecución' : 'Formalizado / En vigor',
      {
        variant: 'success',
        tooltip: isMinorContract
          ? 'Contrato menor formalmente encargado y en ejecución material directa (Art. 118 LCSP).'
          : 'Contrato formalizado y en periodo reglamentario de ejecución material.',
      },
      input
    );
  }

  // ---------------------------------------------------------------------------
  // 3. AWARDED - PENDING FORMALIZATION (Strictly when NO formalization exists)
  // ---------------------------------------------------------------------------
  const hasAwardEvent = Boolean(
    fechaAdjudicacion ||
    normalizedStatus === 'adjudicada' ||
    normalizedStatus === 'adjudicado' ||
    normalizedStatus.includes('adjudic')
  );

  if (hasAwardEvent) {
    return buildResult(
      'AWARDED_PENDING_FORMALIZATION',
      'Adjudicado — pendiente de formalización',
      {
        variant: 'info',
        tooltip: 'Acuerdo de adjudicación formalizado. En plazo legal de formalización contractual (Art. 153 LCSP).',
      },
      input
    );
  }

  // ---------------------------------------------------------------------------
  // 4. UNDER EVALUATION vs BIDDING OPEN / PUBLISHED
  // ---------------------------------------------------------------------------
  const deadlineMs = fechaLimite ? new Date(fechaLimite).getTime() : null;
  const isDeadlinePassed = deadlineMs !== null && !isNaN(deadlineMs) && deadlineMs < nowMs;
  const isUnderEvaluation = normalizedStatus.includes('evalua') || isDeadlinePassed;

  if (isUnderEvaluation) {
    return buildResult(
      'UNDER_EVALUATION',
      'En evaluación',
      {
        variant: 'warning',
        tooltip: 'Plazo de presentación de ofertas finalizado. Mesa evaluando las ofertas.',
      },
      input
    );
  }

  if (deadlineMs && deadlineMs >= nowMs) {
    return buildResult(
      'BIDDING_OPEN',
      'Plazo de ofertas abierto',
      {
        variant: 'warning',
        tooltip: 'Convocatoria abierta para la recepción de proposiciones de licitadores.',
      },
      input
    );
  }

  return buildResult(
    'PUBLISHED',
    'Publicada',
    {
      variant: 'neutral',
      tooltip: 'Convocatoria de licitación publicada oficialmente en la plataforma.',
    },
    input
  );
}

// -----------------------------------------------------------------------------
// INTERNAL BUILDER / STEPPER DERIVATION
// -----------------------------------------------------------------------------
function buildResult(
  code: ContractCanonicalStatus,
  label: string,
  badge: { variant: ContractStatusBadgeConfig['variant']; tooltip: string },
  input: ContractStatusInput
): ContractStatusResult {
  const isTerminal = code === 'CANCELED' || code === 'DESERTED' || code === 'RESOLVED_UNAWARDED';
  const isFormalized = code === 'FORMALIZED' || code === 'IN_EXECUTION';
  const isPendingFormalization = code === 'AWARDED_PENDING_FORMALIZATION';
  const isInExecution = code === 'IN_EXECUTION';
  const isCompleted = code === 'FORMALIZED' && (input.vigencia?.estadoVigencia === 'vencido' || (typeof input.vigencia?.diasRestantes === 'number' && input.vigencia.diasRestantes < 0));
  const isMinor = (input.procedimiento || '').toLowerCase().includes('menor');

  // Badge normativo del Art. 153 LCSP solo es admisible si está pendiente y no es menor
  const canShowFormalizationPeriodBadge = isPendingFormalization && !isMinor;

  // Economic badge label
  let economicStatusLabel: ContractStatusResult['flags']['economicStatusLabel'] = 'En licitación';
  if (isTerminal) {
    economicStatusLabel = 'Cancelado / Desierto';
  } else if (isFormalized) {
    economicStatusLabel = 'Formalizado';
  } else if (isPendingFormalization) {
    economicStatusLabel = 'Adjudicado (Pendiente de firma)';
  } else if (code === 'UNDER_EVALUATION') {
    economicStatusLabel = 'En evaluación';
  }

  // Stepper state computation
  const hasPublishedDate = Boolean(input.fechaPublicacion);
  const hasAwardDateOrCode = Boolean(input.fechaAdjudicacion) || hasOrPastAward(code);

  const stepper: ContractStatusResult['stepper'] = {
    publicacion: hasPublishedDate ? 'completed' : 'pending',
    ofertas: isMinor
      ? 'skipped'
      : isTerminal
      ? 'alert'
      : code === 'BIDDING_OPEN'
      ? 'active'
      : code !== 'PUBLISHED'
      ? 'completed'
      : 'pending',
    adjudicacion: isTerminal
      ? 'alert'
      : code === 'UNDER_EVALUATION'
      ? 'active'
      : hasAwardDateOrCode
      ? 'completed'
      : 'pending',
    formalizacion: isMinor
      ? 'skipped'
      : isTerminal
      ? 'alert'
      : isFormalized
      ? 'completed'
      : isPendingFormalization
      ? 'active'
      : 'pending',
    ejecucion: isTerminal
      ? 'pending'
      : isCompleted
      ? 'completed'
      : isInExecution
      ? 'active'
      : isFormalized
      ? 'completed'
      : 'pending',
    recepcion: isCompleted ? 'completed' : 'pending',
  };

  return {
    code,
    label,
    badge: {
      label,
      variant: badge.variant,
      tooltip: badge.tooltip,
    },
    flags: {
      isTerminal,
      isFormalized,
      isPendingFormalization,
      isInExecution,
      isCompleted,
      isBiddingOpen: code === 'BIDDING_OPEN',
      isUnderEvaluation: code === 'UNDER_EVALUATION',
      canShowFormalizationPeriodBadge,
      economicStatusLabel,
    },
    stepper,
  };
}

function hasOrPastAward(code: ContractCanonicalStatus): boolean {
  return (
    code === 'AWARDED_PENDING_FORMALIZATION' ||
    code === 'FORMALIZED' ||
    code === 'IN_EXECUTION'
  );
}
