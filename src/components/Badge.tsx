import { ContractStatusResult } from '@/types/contract-status';

export function EstadoBadge({
  estado,
  status,
}: {
  estado?: string | null | undefined;
  status?: ContractStatusResult | null | undefined;
}) {
  if (status) {
    const { label, variant, tooltip } = status.badge;
    const variantStyles: Record<string, string> = {
      success: 'bg-[#ecfdf5] border-[#d1fae5] text-[#0d9373]',
      info: 'bg-[#eff6ff] border-[#bfdbfe] text-[#1d4ed8]',
      warning: 'bg-[#fffbeb] border-[#fef3c7] text-[#b45309]',
      danger: 'bg-[#fef2f2] border-[#fee2e2] text-[#dc2626]',
      neutral: 'bg-[#f8fafb] border-[#e2e8f0] text-[#475569]',
    };

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${variantStyles[variant] || variantStyles.neutral}`}
        title={tooltip}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            variant === 'info'
              ? 'bg-[#3b82f6] animate-pulse'
              : variant === 'success'
              ? 'bg-[#00d4a4]'
              : variant === 'warning'
              ? 'bg-[#f59e0b]'
              : variant === 'danger'
              ? 'bg-[#ef4444]'
              : 'bg-[#94a3b8]'
          }`}
        />
        {label}
      </span>
    );
  }

  if (!estado) return <span className="text-slate-400 text-xs">—</span>;

  const st = estado.toLowerCase().trim();
  
  // 1. Adjudicado pendiente de formalización (Art. 153.6 LCSP)
  // Requisito normativo: debe mostrar "Adjudicado — pendiente de formalización", nunca "En vigor" ni "Pendiente de adjudicación"
  if (
    st === 'adjudicada' || 
    st === 'adjudicado' ||
    st === 'adjudicada_pendiente_formalizacion' || 
    st.includes('pendiente de formalización') || 
    st.includes('pendiente formalizacion') ||
    st.includes('plazo de formalización')
  ) {
    return (
      <span 
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#eff6ff] border border-[#bfdbfe] text-[#1d4ed8]"
        title="Expediente adjudicado. Pendiente de formalización contractual (Art. 153 LCSP). No se encuentra en ejecución."
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[#3b82f6] animate-pulse" />
        Adjudicado — pendiente de formalización
      </span>
    );
  }

  // 2. Formalizada / En vigor
  if (
    st === 'formalizada' || 
    st === 'formalizada_en_vigor' || 
    st.includes('formalizada / en vigor') ||
    st === 'en vigor' || 
    st === 'en_vigor'
  ) {
    const label = (st === 'formalizada_en_vigor' || st.includes('formalizada / en vigor'))
      ? 'Formalizada / En vigor'
      : estado;
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#ecfdf5] border border-[#d1fae5] text-[#0d9373]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#00d4a4]" />
        {label}
      </span>
    );
  }

  // 3. Prorrogada
  if (st === 'prorrogada' || st.includes('prórroga') || st.includes('prorroga')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#f0fdfa] border border-[#ccfbf1] text-[#0f766e]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#0d9488]" />
        Prorrogada
      </span>
    );
  }

  // 4. Vencida
  if (st === 'vencida' || st === 'vencido') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#f8fafc] border border-[#cbd5e1] text-[#475569]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#94a3b8]" />
        Vencida
      </span>
    );
  }

  // 5. En evaluación
  if (st === 'en evaluación' || st === 'en evaluacion' || st === 'en_evaluacion' || (st.includes('evaluac') && !st.includes('adjudic'))) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#f5f3ff] border border-[#ede9fe] text-[#6d28d9]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#8b5cf6] animate-pulse" />
        En evaluación
      </span>
    );
  }

  // 6. Publicada
  if (st.includes('publicada') || st.includes('plazo')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#fffbeb] border border-[#fef3c7] text-[#b45309]">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f59e0b] opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#d97706]" />
        </span>
        Publicada
      </span>
    );
  }

  // 7. Desierta
  if (st.includes('desierta')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#fff7ed] border border-[#ffedd5] text-[#c2410c]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#ea580c]" />
        Desierta
      </span>
    );
  }

  // 8. Anulada
  if (st.includes('anulada') || st.includes('cancelada') || st.includes('renuncia') || st.includes('desestimad')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#fef2f2] border border-[#fee2e2] text-[#dc2626]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#ef4444]" />
        Anulada
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#f8fafb] border border-[#e2e8f0] text-[#475569]">
      {estado}
    </span>
  );
}

export function TipoBadge({ tipo }: { tipo: string | null | undefined }) {
  if (!tipo) return null;

  const t = tipo.toLowerCase();
  let colorClass = 'bg-[#f8fafc] text-[#475569] border-[#e2e8f0]';

  if (t.includes('obra')) {
    colorClass = 'bg-[#fff7ed] text-[#c2410c] border-[#ffedd5]';
  } else if (t.includes('concesión') || t.includes('concesion')) {
    colorClass = 'bg-[#faf5ff] text-[#7e22ce] border-[#f3e8ff]';
  } else if (t.includes('servicio')) {
    colorClass = 'bg-[#f5f3ff] text-[#6d28d9] border-[#ede9fe]';
  } else if (t.includes('suministro')) {
    colorClass = 'bg-[#ecfeff] text-[#0e7490] border-[#cffafe]';
  } else if (t.includes('privado')) {
    colorClass = 'bg-[#f8fafc] text-[#475569] border-[#e2e8f0]';
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${colorClass}`}>
      {tipo}
    </span>
  );
}

export function ProcedimientoBadge({ procedimiento }: { procedimiento: string | null | undefined }) {
  if (!procedimiento) return null;

  const p = procedimiento.toLowerCase();
  const isMenor = p.includes('menor');

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${
        isMenor
          ? 'bg-[#fffbeb] text-[#b45309] border-[#fde68a]'
          : 'bg-[#f8fafc] text-[#64748b] border-[#e2e8f0]'
      }`}
    >
      {isMenor ? 'Menor' : procedimiento}
    </span>
  );
}
