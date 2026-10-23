import { 
  Timer, 
  Clock, 
  Hammer, 
  CalendarCheck, 
  CheckCircle2, 
  HelpCircle,
  AlertCircle
} from 'lucide-react';
import { CronometriaContrato } from '@/lib/cronometria';
import { formatDate } from '@/lib/format';

interface ContractChronometryCardProps {
  crono: CronometriaContrato;
  tipoContrato?: string | null;
  modificadosInfo?: {
    tieneModificaciones?: boolean;
    totalModificaciones?: number;
    totalModificadosImporte?: number;
    totalModificadosPlazoDias?: number;
    totalModificadosPlazoMeses?: number;
    modificaciones?: Array<{
      id?: string;
      numero?: number;
      tipo?: string;
      fecha?: string | null;
      importe?: number;
      duracionValor?: number;
      duracionUnidad?: string;
      duracionDias?: number;
      duracionMeses?: number;
      motivo?: string;
      documentoUrl?: string | null;
    }>;
  } | null;
}

export default function ContractChronometryCard({ crono, modificadosInfo, tipoContrato }: ContractChronometryCardProps) {
  const isEnCurso = !crono.esHistoricoTerminado;
  const isDesiertaOAnulada = crono.estadoCiclo === 'desierta_anulada';
  const esPatrimonial = (tipoContrato || '').toLowerCase().includes('patrimonial');
  const todayProgressPct = Math.min(97, Math.max(3, crono.pctAvance));

  const info = modificadosInfo;
  const totalDiasProrroga = (info?.totalModificadosPlazoDias || 0) > 0 
    ? (info?.totalModificadosPlazoDias || 0) 
    : (crono.prorrogaDias || 0);
  const totalMesesProrroga = info?.totalModificadosPlazoMeses || 0;
  const tieneProrroga = totalDiasProrroga > 0 || totalMesesProrroga > 0;

  const modsPlazo = (info?.modificaciones || []).filter((m) => 
    (m.duracionDias && m.duracionDias > 0) ||
    (m.duracionMeses && m.duracionMeses > 0) ||
    (m.duracionValor && m.duracionValor > 0) ||
    (m.tipo || '').toLowerCase().includes('plazo') ||
    (m.tipo || '').toLowerCase().includes('prórroga')
  );

  const primerMotivoProrroga = modsPlazo.find((m) => m.motivo)?.motivo;
  const plazoBadge = totalDiasProrroga > 0
    ? `+${totalDiasProrroga} ${totalDiasProrroga === 1 ? 'día' : 'días'}`
    : totalMesesProrroga > 0
    ? `+${totalMesesProrroga} ${totalMesesProrroga === 1 ? 'mes' : 'meses'}`
    : '';

  return (
    <div className="mint-card p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e2e8f0] pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
            <Timer className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-[#1e293b] flex items-center gap-2">
              Cronometría y Plazo Total del Contrato
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {esPatrimonial
                ? 'Desglose de tramitación y plazo contractual; no presupone ejecución continua.'
                : 'Desglose entre tramitación burocrática previa y ejecución material de la prestación'}
            </p>
          </div>
        </div>

        <div>
          {isDesiertaOAnulada && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#fffbeb] text-[#b45309] border border-[#fef3c7]">
              <AlertCircle className="h-3.5 w-3.5 text-[#b45309]" />
              Licitación declarada desierta / cerrada
            </span>
          )}
          {crono.estadoCiclo === 'en_formalizacion' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#3b82f6] animate-pulse" />
              En plazo de formalización
            </span>
          )}
          {crono.estadoCiclo === 'en_ejecucion' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] animate-pulse" />
              {esPatrimonial ? 'Uso contractual en curso' : 'Obra / Servicio en ejecución'}
            </span>
          )}
          {crono.estadoCiclo === 'completado' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#f8fafc] text-slate-700 border border-[#cbd5e1]">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#10b981]" />
              Ciclo contractual cerrado
            </span>
          )}
        </div>
      </div>

      {/* Alerta de modificaciones de plazo / prórrogas si existen */}
      {tieneProrroga && (
        <div className="p-4 bg-amber-50/90 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs text-amber-950 shadow-2xs">
          <div className="flex items-start gap-2.5">
            <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div>
                Este contrato cuenta con <strong>ampliación de plazo o prórroga de ejecución registrada</strong>:{' '}
                <span className="font-bold font-mono text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                  {plazoBadge} adicionales
                </span>{' '}
                sobre la duración contratada inicialmente en pliego.
              </div>
              {primerMotivoProrroga && (
                <p className="text-[11px] text-amber-900/80 leading-relaxed italic line-clamp-2">
                  &ldquo;{primerMotivoProrroga}&rdquo;
                </p>
              )}
            </div>
          </div>
          <a
            href="#seccion-modificaciones"
            className="inline-flex items-center gap-1 font-semibold text-amber-900 hover:text-amber-950 underline shrink-0 self-start sm:self-auto"
          >
            <span>Ver resolución oficial</span>
          </a>
        </div>
      )}

      {/* 3 KPIs Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI 1: Fase Administrativa */}
        <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-[#2563eb]" />
              Tramitación Previa
            </span>
            <span className="text-[11px] font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">
              Licitación
            </span>
          </div>

          <div>
            <div className="text-2xl font-bold font-mono text-[#1e293b]">
              {crono.diasLicitacionTotal !== null ? `${crono.diasLicitacionTotal} días` : 'Directa'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {crono.diasOfertas !== null && crono.diasEvaluacion !== null
                ? `${crono.diasOfertas}d ofertas + ${crono.diasEvaluacion}d valoración`
                : crono.diasEvaluacion !== null
                ? `${crono.diasEvaluacion}d hasta adjudicación`
                : 'Contrato menor sin plicas previas'}
            </div>
          </div>
        </div>

        {/* KPI 2: Ejecución Material / Plazo contractual */}
        <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span className="flex items-center gap-1.5">
              <Hammer className={`h-4 w-4 ${isDesiertaOAnulada ? 'text-slate-400' : 'text-[#0d9373]'}`} />
              {isDesiertaOAnulada ? 'Ejecución Material' : esPatrimonial ? 'Plazo contractual' : 'Ejecución Contratada'}
            </span>
            {isDesiertaOAnulada ? (
              <span className="text-[11px] font-mono bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200">
                No realizada
              </span>
            ) : tieneProrroga ? (
              <span className="text-[11px] font-mono bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300 font-bold flex items-center gap-1">
                <Clock className="h-3 w-3 text-amber-600" />
                {plazoBadge} prórroga
              </span>
            ) : esPatrimonial ? (
              <span className="text-[11px] font-mono bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-100">
                Duración publicada
              </span>
            ) : (
              <span className="text-[11px] font-mono bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-100">
                Pliego técnico
              </span>
            )}
          </div>

          <div>
            <div className="text-2xl font-bold font-mono text-[#1e293b]">
              {isDesiertaOAnulada ? 'Sin ejecución' : crono.duracionPrevistaTexto}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {isDesiertaOAnulada ? (
                crono.duracionPrevistaTexto
              ) : tieneProrroga ? (
                <span>Duración extendida con prórrogas ({crono.duracionPrevistaDias ? `~${crono.duracionPrevistaDias} días en total` : ''})</span>
              ) : esPatrimonial ? (
                <span>Duración contractual publicada; no equivale a días efectivos de uso o prestación.</span>
              ) : crono.duracionPrevistaDias ? (
                `Equivale a ~${crono.duracionPrevistaDias} días naturales`
              ) : (
                'Duración indeterminada'
              )}
            </div>
          </div>
        </div>

        {/* KPI 3: Plazo Total (Real / Estimado) */}
        <div className={`p-4 rounded-xl border flex flex-col justify-between space-y-2 ${
          isDesiertaOAnulada
            ? 'bg-[#fffbeb]/50 border-[#fde68a]'
            : isEnCurso
            ? 'bg-[#eff6ff]/60 border-[#bfdbfe]'
            : 'bg-[#ecfdf5]/50 border-[#a7f3d0]'
        }`}>
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="flex items-center gap-1.5 text-[#1e293b]">
              <CalendarCheck className={`h-4 w-4 ${
                isDesiertaOAnulada ? 'text-amber-700' : isEnCurso ? 'text-[#2563eb]' : 'text-[#0d9373]'
              }`} />
              {isDesiertaOAnulada ? 'Tramitación del Expediente' : esPatrimonial ? 'Plazo contractual' : isEnCurso ? 'Plazo Total Estimado' : 'Plazo Total Real'}
            </span>
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
              isDesiertaOAnulada
                ? 'bg-amber-100 text-amber-800 border-amber-200'
                : isEnCurso
                ? 'bg-blue-100 text-blue-800 border-blue-200'
                : 'bg-emerald-100 text-emerald-800 border-emerald-200'
            }`}>
              {isDesiertaOAnulada ? 'Procedimiento cerrado' : esPatrimonial ? 'Sin proyección de ejecución' : isEnCurso ? `${crono.diasTranscurridosHoy}d hoy` : 'Real cerrado'}
            </span>
          </div>

          <div>
            <div className="text-2xl font-bold font-mono text-[#1e293b]">
              {esPatrimonial ? crono.duracionPrevistaTexto : crono.plazoTotalTexto}
            </div>
            <div className="text-xs text-slate-600 mt-1">
              {isDesiertaOAnulada ? (
                <span>Duración total desde publicación hasta decreto de desierta</span>
              ) : esPatrimonial ? (
                <span>No se proyecta fecha de fin efectiva sin una fecha de inicio contractual explícita.</span>
              ) : isEnCurso && crono.fechaFinPrevista ? (
                <span>Fin proyectado: <strong>{formatDate(crono.fechaFinPrevista)}</strong></span>
              ) : !isEnCurso ? (
                <span>Ciclo integral desde publicación hasta entrega</span>
              ) : (
                <span>Estimación según plazos oficiales de pliego</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {esPatrimonial ? (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
          <HelpCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong>Plazo contractual:</strong> la duración publicada no se interpreta aquí como ejecución continua. Los contratos patrimoniales pueden establecer periodos concretos de uso o anualidades; sin un calendario contractual estructurado, la aplicación no proyecta una fecha efectiva de finalización.
          </div>
        </div>
      ) : (
        <>
                {/* Barra de Distribución Cronológica */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-semibold text-[#1e293b]">
                      Distribución Temporal por Fases
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {isDesiertaOAnulada ? 'Tramitación concluida' : isEnCurso ? `Avance transcurrido: ${crono.pctAvance}%` : 'Ciclo 100% completado'}
                    </span>
                  </div>
          
                  {/* Multi-segment bar container with minimalist Today marker */}
                  <div className={`relative ${isEnCurso ? 'pt-5 pb-0.5' : 'py-1'}`}>
                    {isEnCurso && (
                      <div
                        className="absolute top-0 -translate-x-1/2 flex flex-col items-center pointer-events-auto group cursor-default transition-all duration-300 select-none"
                        style={{ left: `${todayProgressPct}%` }}
                        title={`Ahora: día ${crono.diasTranscurridosHoy} de ${crono.plazoTotalDias} (${crono.pctAvance}% del plazo total)`}
                        role="img"
                        aria-label={`Ahora: día ${crono.diasTranscurridosHoy} de ${crono.plazoTotalDias} (${crono.pctAvance}% del plazo total)`}
                      >
                        <span className="text-[10px] font-mono font-semibold text-slate-500 tracking-tight leading-none group-hover:text-slate-800 transition-colors">
                          Ahora
                        </span>
                        {/* Minimalist triangle pointing down to the bar */}
                        <svg
                          width="7"
                          height="4"
                          viewBox="0 0 7 4"
                          className="text-slate-600 fill-current mt-0.5 group-hover:text-slate-900 transition-colors"
                          aria-hidden="true"
                        >
                          <path d="M3.5 4L0 0H7L3.5 4Z" />
                        </svg>
                        {/* Refined hairline needle intersecting the bar */}
                        <div
                          className="w-px h-[18px] bg-slate-700/80 rounded-full shadow-[0_0_1.5px_rgba(255,255,255,0.9)] mt-0.5 pointer-events-none"
                          aria-hidden="true"
                        />
                      </div>
                    )}
          
                    {/* Multi-segment bar */}
                    <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden flex gap-0.5 p-0.5 border border-[#e2e8f0]">
                      {crono.fases.map((fase) => (
                        <div
                          key={fase.id}
                          style={{ width: `${fase.pct}%`, backgroundColor: fase.color }}
                          className={`h-full rounded-xs transition-all relative group ${
                            fase.estado === 'en_curso' ? 'animate-pulse' : ''
                          }`}
                          title={`${fase.nombre}: ${fase.dias} días (${fase.pct}%)`}
                        />
                      ))}
                    </div>
                  </div>
          
                  {/* Leyenda de fases */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                    {crono.fases.map((fase) => (
                      <div key={fase.id} className="flex items-start gap-2 text-xs">
                        <span 
                          className="h-2.5 w-2.5 rounded-full mt-1 shrink-0" 
                          style={{ backgroundColor: fase.color }} 
                        />
                        <div>
                          <div className="font-semibold text-slate-800 leading-tight">
                            {fase.nombre}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                            {fase.dias} días ({fase.pct}%)
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
          
          
        </>
      )}

      {/* Nota Metodológica y Legal */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-[#e2e8f0] flex items-start gap-2.5 text-xs text-slate-600">
        <HelpCircle className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong>Rigor metodológico:</strong> La contratación pública distingue entre el tiempo de tramitación administrativa (apertura de plicas y adjudicación) y el plazo material de ejecución. Para contratos en vigor, el plazo total proyecta la fecha estimada de entrega según los pliegos oficiales de la licitación (LCSP arts. 29 y 153).
        </div>
      </div>
    </div>
  );
}
