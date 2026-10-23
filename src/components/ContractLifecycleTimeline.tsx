import { 
  FileCheck2, 
  Calendar, 
  Clock, 
  Award, 
  FileSignature, 
  PlayCircle, 
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ClipboardCheck,
  Info
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import { CronometriaContrato, ValidacionTemporalResultado } from '@/lib/cronometria';
import { ContractStatusResult } from '@/types/contract-status';
import { getContractStatus } from '@/lib/contract-status';

interface ContractLifecycleProps {
  estado: string;
  procedimiento?: string | null;
  procedure?: string | null;
  tipoContrato?: string | null;
  fechaPublicacion?: string | null;
  fechaLimite?: string | null;
  fechaAdjudicacion?: string | null;
  fechaFormalizacion?: string | null;
  diasResolucion?: number | null;
  vigencia?: {
    estadoVigencia: string;
    fechaFinEstimada?: string | null;
    diasRestantes?: number | null;
    duracionTexto?: string;
  } | null;
  tieneModificaciones?: boolean;
  totalModificaciones?: number;
  crono?: CronometriaContrato | null;
  validacionTemporal?: ValidacionTemporalResultado | null;
  contractStatus?: ContractStatusResult | null;
}

export default function ContractLifecycleTimeline({
  estado,
  procedimiento,
  procedure,
  tipoContrato,
  fechaPublicacion,
  fechaLimite,
  fechaAdjudicacion,
  fechaFormalizacion,
  diasResolucion,
  vigencia,
  tieneModificaciones = false,
  totalModificaciones = 0,
  crono,
  validacionTemporal,
  contractStatus,
}: ContractLifecycleProps) {
  const currentStatus = contractStatus || getContractStatus({
    estado,
    procedimiento: procedimiento || procedure || null,
    tipoContrato,
    fechaPublicacion,
    fechaLimite,
    fechaAdjudicacion,
    fechaFormalizacion,
    vigencia,
  });

  const isDesierta = currentStatus.code === 'DESERTED';
  const isAnulada = currentStatus.code === 'CANCELED';
  const isEvaluacion = currentStatus.code === 'UNDER_EVALUATION';
  const isBiddingOpen = currentStatus.flags.isBiddingOpen;
  const isPendingFormalization = currentStatus.flags.isPendingFormalization;
  const isFormalizada = currentStatus.flags.isFormalized;
  const isInExecution = currentStatus.flags.isInExecution;
  const isCompleted = currentStatus.flags.isCompleted;
  const isObra = (tipoContrato || '').toLowerCase().includes('obra');
  const isPatrimonial = (tipoContrato || '').toLowerCase().includes('patrimonial');

  // Determinar etapas canónicas
  const etapas = [
    {
      id: 'publicacion',
      nombre: 'Publicación',
      subtitulo: fechaPublicacion ? formatDate(fechaPublicacion) : 'Convocatoria oficial',
      estado: currentStatus.stepper.publicacion,
      icono: FileCheck2,
    },
    ...(currentStatus.stepper.ofertas !== 'skipped' ? [{
      id: 'presentacion',
      nombre: 'Plazo de Ofertas',
      subtitulo: fechaLimite 
        ? (isBiddingOpen 
            ? `Hasta ${formatDate(fechaLimite)}` 
            : `Cerró: ${formatDate(fechaLimite)}`)
        : (isBiddingOpen ? 'Recepción de plicas' : 'Plazo concluido'),
      estado: currentStatus.stepper.ofertas,
      icono: Clock,
    }] : []),
    {
      id: 'adjudicacion',
      nombre: isDesierta ? 'Declarada Desierta' : isAnulada ? 'Licitación Anulada' : 'Adjudicación',
      subtitulo: fechaAdjudicacion 
        ? formatDate(fechaAdjudicacion) 
        : isDesierta 
        ? 'Sin ofertas válidas' 
        : isAnulada 
        ? 'Procedimiento cancelado' 
        : isEvaluacion
        ? 'Evaluación de ofertas'
        : 'Acuerdo de adjudicación',
      estado: currentStatus.stepper.adjudicacion,
      icono: (isDesierta || isAnulada) ? AlertCircle : Award,
    },
    ...(currentStatus.stepper.formalizacion !== 'skipped' && !isDesierta && !isAnulada ? [{
      id: 'formalizacion',
      nombre: 'Formalización',
      subtitulo: fechaFormalizacion 
        ? formatDate(fechaFormalizacion) 
        : isFormalizada
        ? 'Contrato formalizado'
        : isPendingFormalization
        ? 'Adjudicado — pendiente de formalización'
        : 'Firma pendiente',
      estado: currentStatus.stepper.formalizacion,
      icono: FileSignature,
    }] : []),
    ...(!isDesierta && !isAnulada ? [{
      id: 'ejecucion',
      nombre: isPatrimonial
        ? 'Vigencia / uso contractual'
        : (isPendingFormalization || isBiddingOpen || isEvaluacion)
        ? (isObra ? 'Ejecución de Obra' : 'Ejecución')
        : isInExecution
        ? (isObra ? 'Obras en Ejecución' : 'En Ejecución') 
        : (isObra ? 'Obra Ejecutada' : 'Ejecutado'),
      subtitulo: isPatrimonial
        ? 'Sin calendario de uso estructurado'
        : isPendingFormalization
        ? 'Adjudicado — pendiente de formalización'
        : (isBiddingOpen || isEvaluacion)
        ? 'Pendiente de adjudicación'
        : vigencia?.fechaFinEstimada
        ? (isInExecution
            ? 'Hasta ' + formatDate(vigencia.fechaFinEstimada)
            : 'Fin: ' + formatDate(vigencia.fechaFinEstimada))
        : isFormalizada
        ? 'Ciclo formalizado'
        : 'Plazo reglamentario',
      estado: currentStatus.stepper.ejecucion,
      icono: PlayCircle,
    }] : []),
    ...(!isDesierta && !isAnulada ? [{
      id: 'recepcion',
      nombre: isObra ? 'Recepción de Obra' : 'Recepción / Fin',
      subtitulo: isCompleted
        ? (isObra ? 'Acta de recepción' : 'Liquidación final')
        : 'Pendiente',
      estado: currentStatus.stepper.recepcion,
      icono: ClipboardCheck,
    }] : []),
  ];

  return (
    <div className="mint-card p-5 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e2e8f0] pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[#0d9373]" />
          <h3 className="font-bold text-sm text-[#1e293b]">
            Ciclo de Vida Administrativo
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tieneModificaciones && (
            <span className="text-xs font-mono font-medium text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3 text-amber-600 shrink-0" />
              <span>{totalModificaciones && totalModificaciones > 1 ? `${totalModificaciones} modificaciones` : '1 modificación'}</span>
            </span>
          )}
          {!crono && diasResolucion !== null && diasResolucion !== undefined && diasResolucion > 0 && (
            <span className="text-xs font-mono font-medium text-slate-600 bg-[#f8fafb] px-2.5 py-1 rounded-full border border-[#e2e8f0]">
              {isPendingFormalization ? 'Evaluación y adjudicación:' : 'Tramitación:'} <strong>{diasResolucion} días</strong>
            </span>
          )}
          {crono?.diasOfertas !== null && crono?.diasOfertas !== undefined && (
            <span className="text-xs font-mono font-medium text-slate-600 bg-[#f8fafb] px-2.5 py-1 rounded-full border border-[#e2e8f0]">
              Presentación de ofertas: <strong>{crono.diasOfertas} días</strong>
            </span>
          )}
          {crono?.diasEvaluacion !== null && crono?.diasEvaluacion !== undefined && (
            <span className="text-xs font-mono font-medium text-slate-600 bg-[#f8fafb] px-2.5 py-1 rounded-full border border-[#e2e8f0]">
              Evaluación/adjudicación: <strong>{crono.diasEvaluacion} días</strong>
            </span>
          )}
          {crono?.diasFormalizacion !== null && crono?.diasFormalizacion !== undefined && isFormalizada && (
            <span className="text-xs font-mono font-medium text-slate-600 bg-[#f8fafb] px-2.5 py-1 rounded-full border border-[#e2e8f0]">
              Formalización: <strong>{crono.diasFormalizacion} días</strong>
            </span>
          )}
          {crono?.diasLicitacionTotal !== null && crono?.diasLicitacionTotal !== undefined && (
            <span className="text-xs font-mono font-medium text-[#065f46] bg-[#ecfdf5] px-2.5 py-1 rounded-full border border-[#a7f3d0]">
              Tramitación total: <strong>{(crono.diasLicitacionTotal || 0) + (isFormalizada ? (crono.diasFormalizacion || 0) : 0)} días</strong>
            </span>
          )}
          {validacionTemporal && 
           validacionTemporal.clasificacion !== 'SECUENCIA_COHERENTE' &&
           validacionTemporal.clasificacion !== 'CORRECTO' && (
            <span
              className={`text-xs font-mono font-medium px-2.5 py-1 rounded-full border cursor-help ${
                validacionTemporal.clasificacion === 'PUBLICACION_A_POSTERIORI_CONTRATO_MENOR' ||
                validacionTemporal.clasificacion === 'PUBLICACION_A_POSTERIORI_NEGOCIADO_SIN_PUBLICIDAD' ||
                validacionTemporal.clasificacion === 'REGISTRO_LEGITIMO_A_POSTERIORI'
                  ? 'text-slate-700 bg-slate-100 border-slate-200'
                  : validacionTemporal.clasificacion === 'DISCREPANCIA_CRONOLOGICA_REGISTRAL' || validacionTemporal.clasificacion === 'ERRATA_REGISTRAL_CONFIRMADA' || validacionTemporal.clasificacion === 'ERRATA_ORGANO_CONTRATACION'
                  ? 'text-orange-800 bg-orange-50 border-orange-200'
                  : 'text-red-800 bg-red-50 border-red-200'
              }`}
              title={
                validacionTemporal.clasificacion === 'PUBLICACION_A_POSTERIORI_CONTRATO_MENOR'
                  ? 'Los contratos menores se publican trimestralmente tras su adjudicación (art. 63.4 LCSP); no constituye anomalía.'
                  : validacionTemporal.clasificacion === 'PUBLICACION_A_POSTERIORI_NEGOCIADO_SIN_PUBLICIDAD'
                  ? 'En los negociados sin publicidad (art. 168 LCSP) no existe convocatoria pública. La plataforma sólo registra el anuncio de adjudicación, cuya fecha es siempre posterior al límite de presentación de ofertas. No constituye anomalía.'
                  : validacionTemporal.motivo
              }
            >
              {validacionTemporal.clasificacion === 'PUBLICACION_A_POSTERIORI_CONTRATO_MENOR'
                ? 'ℹ️ Publicación posterior (art. 63.4 LCSP)'
                : validacionTemporal.clasificacion === 'PUBLICACION_A_POSTERIORI_NEGOCIADO_SIN_PUBLICIDAD'
                ? 'ℹ️ Sin publicación de convocatoria (art. 168 LCSP)'
                : validacionTemporal.clasificacion === 'REGISTRO_LEGITIMO_A_POSTERIORI'
                ? 'ℹ️ Registro a posteriori'
                : validacionTemporal.clasificacion === 'DISCREPANCIA_CRONOLOGICA_REGISTRAL' || validacionTemporal.clasificacion === 'ERRATA_ORGANO_CONTRATACION' || validacionTemporal.clasificacion === 'ERRATA_REGISTRAL_CONFIRMADA'
                ? '🟠 Discrepancia cronológica registral'
                : validacionTemporal.clasificacion === 'ANOMALIA_PARSER'
                ? '🔴 Error de ingestión confirmado'
                : '🔴 Inconsistencia registral pendiente de comprobación'}
            </span>
          )}
        </div>
      </div>

      <div className="relative pt-2 pb-1">
        {/* Timeline horizontal */}
        <div className="flex sm:grid sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-2 overflow-x-auto max-w-full scrollbar-none pb-2 sm:pb-0 snap-x">
          {etapas.map((etapa, idx) => {
            const Icon = etapa.icono;
            const isCompleted = etapa.estado === 'completed';
            const isActive = etapa.estado === 'active';
            const isAlert = etapa.estado === 'alert';

            return (
              <div 
                key={etapa.id}
                className={`min-w-[155px] sm:min-w-0 flex-1 snap-start relative p-3 rounded-xl border transition-all flex flex-col justify-between min-h-[96px] ${
                  isActive
                    ? 'bg-[#ecfdf5] border-[#10b981] shadow-2xs'
                    : isAlert
                    ? 'bg-[#fffbeb] border-[#f59e0b]'
                    : isCompleted
                    ? 'bg-[#f8fafb] border-[#e2e8f0]'
                    : 'bg-slate-50/50 border-dashed border-[#e2e8f0] opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${
                    isActive ? 'text-[#065f46]' : isAlert ? 'text-[#b45309]' : 'text-slate-500'
                  }`}>
                    Paso {idx + 1}
                  </span>
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-[#10b981] shrink-0" />
                  ) : isActive ? (
                    <span className="h-2 w-2 rounded-full bg-[#10b981] animate-ping shrink-0" />
                  ) : isAlert ? (
                    <AlertCircle className="h-4 w-4 text-[#f59e0b] shrink-0" />
                  ) : (
                    <Icon className="h-4 w-4 text-slate-300 shrink-0" />
                  )}
                </div>

                <div className="mt-1">
                  <div className="font-bold text-xs text-[#1e293b] leading-snug" title={etapa.nombre}>
                    {etapa.nombre}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 font-mono leading-tight break-words" title={etapa.id === 'ejecucion' && isPatrimonial ? 'No se calcula una fecha efectiva de fin porque los datos estructurados disponibles no aportan un calendario de uso contractual.' : etapa.subtitulo}>
                    {etapa.subtitulo}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Nota pedagógica sobre el estado administrativo vs ejecución física */}
      <div className="mt-3 p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 text-xs text-slate-600 space-y-1.5">
        <div className="flex items-center gap-2 font-semibold text-slate-800">
          <Info className="h-4 w-4 text-[#0d9373] shrink-0" />
          <span>Fase del procedimiento: ¿Por qué figura como «{estado}»?</span>
        </div>
        <p className="leading-relaxed pl-6 text-slate-600">
          {isObra ? (
            <>
              En la Plataforma de Contratación del Sector Público (PLACSP), el estado <strong>«Resuelta»</strong> indica que la tramitación administrativa del concurso ha concluido y el contrato está formalizado con el adjudicatario. <strong>No certifica que las obras físicas hayan finalizado sobre el terreno</strong>.
              La ejecución de los trabajos transcurre durante el plazo contractual ({vigencia?.duracionTexto || 'estipulado en pliegos'}), y su finalización oficial solo queda acreditada jurídicamente mediante la firma del <strong>Acta de Recepción de las Obras (Art. 243 LCSP)</strong> entre la dirección facultativa, la empresa contratista y los servicios técnicos municipales, iniciándose a continuación el plazo de garantía legal (mínimo 1 año).
            </>
          ) : (
            <>
              En la Plataforma de Contratación del Sector Público (PLACSP), el estado <strong>«Resuelta»</strong> acredita que la licitación administrativa concluyó con la formalización del contrato. La ejecución material del servicio o suministro se desarrolla conforme a los pliegos hasta su conformidad y liquidación formal por los servicios municipales.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
