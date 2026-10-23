import Link from 'next/link';
import { formatCurrency, formatDate, formatCompactCurrency, formatNumber } from '@/lib/format';
import { getContractSlug } from '@/lib/placsp';
import { ContratosVivosStats } from '@/lib/contratos-vivos';
import { CalendarClock, ArrowRight, Clock, AlertTriangle, ShieldCheck, Briefcase } from 'lucide-react';

interface HomeExpiringContractsSectionProps {
  contratosVivos: ContratosVivosStats;
  scope?: string;
}

export default function HomeExpiringContractsSection({ contratosVivos, scope }: HomeExpiringContractsSectionProps) {
  const { kpis, proximosVencimientos6Meses } = contratosVivos;
  const items = proximosVencimientos6Meses.slice(0, 4);

  return (
    <div className="mint-card p-6 sm:p-7 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#fff1f2] text-[#e11d48] border border-[#fecdd3]"><CalendarClock className="h-4 w-4" /></span>
            <h3 className="font-bold text-[#1e293b] text-base sm:text-lg tracking-tight">Vigilancia de Contratos en Vigor y Próximos Vencimientos</h3>
          </div>
          <p className="text-xs text-[#64748b] mt-1">Anticipación de convocatorias y seguimiento de servicios esenciales antes de su fecha de finalización registrada</p>
        </div>
        <Link href={`/seguimiento${scope ? `?ambito=${scope}` : ''}`} className="text-xs font-semibold text-[#0d9373] hover:text-[#00b48a] flex items-center gap-1.5 self-start sm:self-auto transition-colors shrink-0">
          <span>Ver observatorio en curso completo</span><ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-[#f8fafb] border border-[#e2e8f0]"><div className="flex items-center justify-between text-xs text-slate-500 mb-1"><span className="font-medium">Total en Ejecución</span><Clock className="h-3.5 w-3.5 text-slate-400" /></div><div className="text-xl font-bold font-mono text-slate-900">{formatNumber(kpis.totalVivos)} <span className="text-xs font-normal text-slate-500 font-sans">({formatCompactCurrency(kpis.volumenVivoTotal)})</span></div><div className="text-[11px] text-slate-400 mt-0.5">Contratos formalizados activos</div></div>
        <div className={`p-3.5 rounded-xl border ${kpis.vencenEn30Dias > 0 ? 'bg-amber-50/70 border-amber-200' : 'bg-[#f8fafb] border-[#e2e8f0]'}`}><div className="flex items-center justify-between text-xs mb-1"><span className={`font-semibold ${kpis.vencenEn30Dias > 0 ? 'text-amber-800' : 'text-slate-500'}`}>Vencimiento Inminente (&lt;30 días)</span><AlertTriangle className={`h-3.5 w-3.5 ${kpis.vencenEn30Dias > 0 ? 'text-amber-600' : 'text-slate-400'}`} /></div><div className={`text-xl font-bold font-mono ${kpis.vencenEn30Dias > 0 ? 'text-amber-900' : 'text-slate-900'}`}>{formatNumber(kpis.vencenEn30Dias)} <span className={`text-xs font-normal font-sans ${kpis.vencenEn30Dias > 0 ? 'text-amber-700' : 'text-slate-500'}`}>({formatCompactCurrency(kpis.volumenVence30Dias)})</span></div><div className={`text-[11px] mt-0.5 ${kpis.vencenEn30Dias > 0 ? 'text-amber-700 font-medium' : 'text-slate-400'}`}>{kpis.vencenEn30Dias > 0 ? 'Revisión necesaria por finalización próxima' : 'Sin contratos con vencimiento inminente'}</div></div>
        <div className="p-3.5 rounded-xl bg-[#f8fafb] border border-[#e2e8f0]"><div className="flex items-center justify-between text-xs text-slate-500 mb-1"><span className="font-medium">Ventana de Re-licitación (&lt;6 meses)</span><ShieldCheck className="h-3.5 w-3.5 text-blue-500" /></div><div className="text-xl font-bold font-mono text-slate-900">{formatNumber(kpis.vencenEn6Meses)} <span className="text-xs font-normal text-slate-500 font-sans">({formatCompactCurrency(kpis.volumenVence6Meses)})</span></div><div className="text-[11px] text-slate-400 mt-0.5">Oportunidades de licitación pública</div></div>
      </div>
      {items.length > 0 ? <div className="space-y-3"><div className="text-xs font-bold uppercase tracking-wider text-[#64748b] font-mono">Contratos con finalización próxima o vencimiento estimado</div><div className="grid grid-cols-1 md:grid-cols-2 gap-3">{items.map((contrato) => { const dias = contrato.diasRestantes; const isUrgent = dias !== null && dias <= 30; return <Link key={contrato.id} href={`/licitaciones/${getContractSlug(contrato.id)}`} className="p-4 rounded-xl bg-white border border-[#e2e8f0] hover:border-[#00d4a4] hover:shadow-xs transition-all flex flex-col justify-between group"><div className="space-y-2"><div className="flex items-center justify-between gap-2 text-[11px]"><span className="font-mono text-slate-400 truncate max-w-[130px]">{contrato.case_number || 'Sin exp.'}</span><div className="flex items-center gap-1.5 shrink-0">{isUrgent ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">{dias !== null && dias > 0 ? `Vence en ${dias}d` : 'Vence hoy/inminente'}</span> : <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">{dias !== null ? `En ~${Math.round(dias / 30)} meses` : 'En 6 meses'}</span>}<span className="font-bold font-mono text-slate-900">{formatCurrency(contrato.amount)}</span></div></div><h4 className="font-semibold text-slate-800 text-xs leading-snug line-clamp-2 group-hover:text-[#0d9373] transition-colors">{contrato.object_description}</h4></div><div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500"><div className="flex items-center gap-1.5 truncate mr-2"><Briefcase className="h-3 w-3 text-slate-400 shrink-0" /><span className="truncate font-medium text-slate-700">{contrato.awardee}</span></div><div className="flex items-center gap-1 text-[10px] text-slate-400 shrink-0"><span>Fin:</span><span className="font-mono font-medium text-slate-600">{contrato.fechaFinEstimada ? formatDate(contrato.fechaFinEstimada) : 'Pendiente'}</span></div></div></Link>; })}</div></div> : <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl"><p className="text-xs text-slate-500">No se registran contratos con fecha de fin prevista en los próximos 6 meses para este ámbito.</p></div>}
      <p className="text-[11px] text-slate-500 border-t border-[#e2e8f0] pt-3 leading-relaxed"><strong>Nota metodológica:</strong> La fecha de finalización se calcula a partir del plazo de ejecución o duración oficial publicado en PLACSP. Prórrogas o modificaciones contractuales pueden haberse formalizado o publicarse con posterioridad.</p>
    </div>
  );
}
