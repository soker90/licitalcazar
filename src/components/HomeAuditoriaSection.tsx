import Link from 'next/link';
import { 
  ShieldAlert, AlertTriangle, TrendingDown, Layers, UserCheck, ArrowRight, Scale, Coins, Building2
} from 'lucide-react';
import { getAlertasV2, getAuditoriaKpis } from '@/lib/db';
import { formatCompactCurrency, formatNumber } from '@/lib/format';
import HomeAlertCard from '@/components/HomeAlertCard';

interface HomeAuditoriaSectionProps {
  scope?: string;
}

export default function HomeAuditoriaSection({ scope }: HomeAuditoriaSectionProps) {
  const kpis = getAuditoriaKpis(scope);
  const topAlertasResult = getAlertasV2({
    limit: 3,
    severidad: 'ALTA',
    scope,
  });
  const topAlertas = topAlertasResult.alertas;

  return (
    <section className="mint-card p-6 sm:p-7 space-y-6 relative overflow-hidden border-l-4 border-l-rose-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-rose-50 text-rose-600 border border-rose-200"><ShieldAlert className="h-4 w-4" /></span>
            <h3 className="font-bold text-[#1e293b] text-base sm:text-lg tracking-tight">Centro de Análisis de Riesgos de Contratación</h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 uppercase font-mono">LCSP 9/2017</span>
          </div>
          <p className="text-xs text-[#64748b] mt-1 max-w-2xl">Señales estadísticas automáticas para identificar riesgos de concentración, bajas acusadas y concurrencia restringida en el gasto público de Alcázar.</p>
        </div>
        <Link href={`/auditoria${scope && scope !== 'directa' ? `?ambito=${scope}` : ''}`} className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1.5 self-start sm:self-auto transition-colors group shrink-0">
          <span>Acceder al Centro de Análisis ({kpis.totalAlertas})</span><ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link href={`/auditoria?severidad=ALTA${scope && scope !== 'directa' ? `&ambito=${scope}` : ''}`} className="p-3.5 rounded-xl bg-rose-50/60 hover:bg-rose-50 border border-rose-200/80 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between"><span className="text-[11px] font-semibold text-rose-700">Señales Altas</span><ShieldAlert className="h-3.5 w-3.5 text-rose-600" /></div>
          <div className="mt-2 flex items-baseline gap-1.5"><span className="text-2xl font-black font-mono text-rose-900">{kpis.severidades.alta}</span><span className="text-[10px] text-rose-600 font-medium">expedientes</span></div>
        </Link>
        <Link href={`/auditoria?severidad=MEDIA${scope && scope !== 'directa' ? `&ambito=${scope}` : ''}`} className="p-3.5 rounded-xl bg-amber-50/60 hover:bg-amber-50 border border-amber-200/80 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between"><span className="text-[11px] font-semibold text-amber-700">Señales Medias</span><AlertTriangle className="h-3.5 w-3.5 text-amber-600" /></div>
          <div className="mt-2 flex items-baseline gap-1.5"><span className="text-2xl font-black font-mono text-amber-900">{kpis.severidades.media}</span><span className="text-[10px] text-amber-600 font-medium">expedientes</span></div>
        </Link>
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between"><span className="text-[11px] font-semibold text-slate-700">Gasto en Alerta</span><Coins className="h-3.5 w-3.5 text-slate-500" /></div>
          <div className="mt-2 flex items-baseline gap-1.5"><span className="text-2xl font-black font-mono text-slate-900">{formatCompactCurrency(kpis.volumenAuditado)}</span><span className="text-[10px] text-slate-500 font-medium">acumulado</span></div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between"><span className="text-[11px] font-semibold text-slate-700">Contratos Implicados</span><Building2 className="h-3.5 w-3.5 text-slate-500" /></div>
          <div className="mt-2 flex items-baseline gap-1.5"><span className="text-2xl font-black font-mono text-slate-900">{formatNumber(kpis.totalContratosConAlerta)}</span><span className="text-[10px] text-slate-500 font-medium">contratos</span></div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Link href={`/auditoria?tipo=BAJA_ACUSADA${scope && scope !== 'directa' ? `&ambito=${scope}` : ''}`} className="p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs transition-all flex items-center justify-between"><div className="flex items-center gap-2.5"><div className="p-1.5 rounded-md bg-amber-50 text-amber-700"><TrendingDown className="h-4 w-4" /></div><div><div className="text-xs font-semibold text-slate-900">Bajas Acusadas</div><div className="text-[11px] text-slate-500">Baja superior al 20% s/presupuesto</div></div></div><span className="font-mono text-xs font-bold text-slate-700 px-2 py-0.5 rounded bg-slate-100">{kpis.tipos.bajasAcusadas}</span></Link>
        <Link href={`/auditoria?tipo=CONTRATOS_RELACIONADOS${scope && scope !== 'directa' ? `&ambito=${scope}` : ''}`} className="p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs transition-all flex items-center justify-between"><div className="flex items-center gap-2.5"><div className="p-1.5 rounded-md bg-purple-50 text-purple-700"><Layers className="h-4 w-4" /></div><div><div className="text-xs font-semibold text-slate-900">Contratos Menores Similares</div><div className="text-[11px] text-slate-500">Mismo proveedor y objeto en el año</div></div></div><span className="font-mono text-xs font-bold text-slate-700 px-2 py-0.5 rounded bg-slate-100">{kpis.tipos.menoresRelacionados}</span></Link>
        <Link href={`/auditoria?tipo=OFERTA_UNICA${scope && scope !== 'directa' ? `&ambito=${scope}` : ''}`} className="p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs transition-all flex items-center justify-between"><div className="flex items-center gap-2.5"><div className="p-1.5 rounded-md bg-blue-50 text-blue-700"><UserCheck className="h-4 w-4" /></div><div><div className="text-xs font-semibold text-slate-900">Oferta Única</div><div className="text-[11px] text-slate-500">Un solo licitador concurrente</div></div></div><span className="font-mono text-xs font-bold text-slate-700 px-2 py-0.5 rounded bg-slate-100">{kpis.tipos.ofertaUnica}</span></Link>
      </div>
      {topAlertas.length > 0 && <div className="space-y-3 pt-2"><div className="flex items-center justify-between"><h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 font-mono">Señales recientes de severidad alta</h4><span className="text-[11px] text-slate-400 font-medium">Algoritmo ponderado LCSP</span></div><div className="grid grid-cols-1 md:grid-cols-3 gap-3">{topAlertas.map((alerta) => <HomeAlertCard key={alerta.id} alerta={alerta} />)}</div></div>}
      <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-1"><Scale className="h-3.5 w-3.5 text-slate-400 shrink-0" /><span>Las alertas son señales estadísticas automáticas para orientar el escrutinio público y no presuponen irregularidad jurídica ni infracción administrativa.</span></div>
    </section>
  );
}
