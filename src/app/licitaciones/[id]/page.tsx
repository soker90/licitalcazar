import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLicitacionById, getAlertasForContract } from '@/lib/db';
import { getPlacspUrl, getPlacspId, getContractSlug } from '@/lib/placsp';
import { SITE_URL } from '@/lib/config';
import { formatCurrency, formatDate, formatNumber, formatNif, formatUrgencia } from '@/lib/format';
import { getOpaqueEmpresaId } from '@/lib/corporate';
import { isEligibleAwardLotStatus } from '@/lib/lot-status.js';
import { EstadoBadge, TipoBadge, ProcedimientoBadge } from '@/components/Badge';
import { getContractStatus } from '@/lib/contract-status';
import ContractLifecycleTimeline from '@/components/ContractLifecycleTimeline';
import ContractChronometryCard from '@/components/ContractChronometryCard';
import { calcularCronometriaContrato, validarModeloTemporal } from '@/lib/cronometria';
import ContractAlertsCard from '@/components/ContractAlertsCard';
import ContractViewModeToggle from '@/components/ContractViewModeToggle';
import ContractInvestigationHub from '@/components/ContractInvestigationHub';
import AnchorLink from '@/components/AnchorLink';
import { 
  Building2, 
  Briefcase, 
  ExternalLink, 
  Calendar, 
  ArrowLeft, 
  Tag, 
  Users, 
  TrendingDown, 
  TrendingUp,
  Clock, 
  MapPin, 
  ShieldCheck, 
  ChevronRight, 
  RefreshCw, 
  Boxes, 
  Layers,
  Coins,
  FileText
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const lic = getLicitacionById(decodedId);

  if (!lic) {
    return {
      title: 'Licitación no encontrada · LicitAlcázar',
    };
  }

  const canonicalSlug = getContractSlug(lic.id);
  const title = `${lic.expediente} · ${lic.objeto.slice(0, 65)} · LicitAlcázar`;
  const description = `Dossier oficial de contratación del expediente ${lic.expediente} (${lic.contracting_authority_name}). Presupuesto: ${formatCurrency(lic.importe_sin_iva)}. Auditoría y cronometría cívica.`;

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/licitaciones/${canonicalSlug}`,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/licitaciones/${canonicalSlug}`,
    },
  };
}

function formatPlazoMod(valor?: number | null, unidad?: string | null, dias?: number | null, meses?: number | null): string {
  if (valor && valor > 0 && unidad) {
    const u = unidad.toUpperCase();
    if (u === 'DAY') return `+${valor} ${valor === 1 ? 'día adicional' : 'días adicionales'}`;
    if (u === 'MON') return `+${valor} ${valor === 1 ? 'mes adicional' : 'meses adicionales'}`;
    if (u === 'ANN') return `+${valor} ${valor === 1 ? 'año adicional' : 'años adicionales'}`;
  }
  if (dias && dias > 0) {
    return `+${dias} ${dias === 1 ? 'día adicional' : 'días adicionales'}`;
  }
  if (meses && meses > 0) {
    return `+${meses} ${meses === 1 ? 'mes adicional' : 'meses adicionales'}`;
  }
  return 'Sin alteración de plazo';
}

function formatTotalPlazoBadge(totalDias?: number | null, totalMeses?: number | null): string {
  if (totalDias && totalDias > 0) {
    return `+${totalDias} ${totalDias === 1 ? 'día' : 'días'}`;
  }
  if (totalMeses && totalMeses > 0) {
    return `+${totalMeses} ${totalMeses === 1 ? 'mes' : 'meses'}`;
  }
  return '';
}

export default async function LicitacionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const lic = getLicitacionById(decodedId);

  if (!lic) {
    notFound();
  }

  const canonicalSlug = getContractSlug(lic.id);
  // Redirección permanente (301) hacia el slug limpio si se recibe un enlace legado codificado
  if (id !== canonicalSlug && (id.includes('%') || decodedId.startsWith('http') || decodedId.includes('/'))) {
    redirect(`/licitaciones/${canonicalSlug}`);
  }

  const placspUrl = getPlacspUrl(lic);
  const placspId = getPlacspId((lic as any).placsp_id || lic.id);
  const authorityProfileIdentifier = (lic as any).organismoPlacspId || (lic as any).organismoAuthorityId || null;
  const alertasV2 = getAlertasForContract(lic.id);

  // Calculate savings (strictly on PBL sin IVA - Art. 100 LCSP)
  const lotesList = ((lic as any).lotes || []) as any[];
  const lotesAdjudicados = lotesList.filter((l: any) => l.importeAdjudicacion != null && isEligibleAwardLotStatus(l.estadoLote));
  const lotesSinAdjudicar = lotesList.filter((l: any) => !isEligibleAwardLotStatus(l.estadoLote) || (!l.importeAdjudicacion && !l.adjudicatario));
  
  const pblTotal = lic.importe_sin_iva;
  const pblAdjudicados = lotesList.length > 0
    ? lotesAdjudicados.reduce((sum: number, l: any) => sum + (l.presupuestoSinIva || 0), 0)
    : pblTotal;
  const pblSinAdjudicar = lotesSinAdjudicar.reduce((sum: number, l: any) => sum + (l.presupuestoSinIva || 0), 0);

  // When lots exist, base budget for savings is strictly pblAdjudicados to exclude all lots without a valid award
  const pblBaseAhorro = lotesList.length > 0 ? pblAdjudicados : pblTotal;
  const adj = lic.importe_adjudicacion;
  const awardAmountType = (lic as any).award_amount_type || 'total';
  const hasComparableAward = awardAmountType === 'total' && lic.importe_adjudicacion != null;
  const hasSavings = hasComparableAward && pblBaseAhorro && adj && pblBaseAhorro > adj;
  const ahorroEuros = hasSavings ? pblBaseAhorro - adj : null;
  const ahorroPct = hasSavings ? Math.round(((pblBaseAhorro - adj) / pblBaseAhorro) * 1000) / 10 : null;
  const crono = calcularCronometriaContrato(lic);
  const validacionTemporal = validarModeloTemporal(lic);
  const esIngreso = lic.naturaleza_economica === 'ingreso';
  const esConcesion = lic.naturaleza_economica === 'concesion';
  const esEconomiaNoGasto = esIngreso || esConcesion;
  const hasDistinctPblIva = lic.importe_con_iva != null && (
    lic.importe_sin_iva == null || Math.abs(lic.importe_con_iva - lic.importe_sin_iva) > 0.01
  );
  const hasDistinctAdjIva = lic.importe_adjudicacion != null && lic.importe_adj_con_iva != null && (
    lic.importe_adjudicacion == null || Math.abs(lic.importe_adj_con_iva - lic.importe_adjudicacion) > 0.01
  );
  const contractStatus = getContractStatus({
    estado: lic.estado,
    procedimiento: lic.procedimiento,
    tipoContrato: lic.tipo_contrato,
    fechaPublicacion: lic.fecha_publicacion,
    fechaLimite: lic.fecha_limite,
    fechaAdjudicacion: lic.fecha_adjudicacion,
    fechaFormalizacion: (lic as any).fecha_formalizacion,
    importeAdjudicacion: lic.importe_adjudicacion,
    importeSinIva: lic.importe_sin_iva,
    duracion: lic.duracion,
    duracionUnidad: lic.duracion_unidad,
    vigencia: (lic as any).vigencia,
  });

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 space-y-7 bg-[#ffffff]">
      {/* Back button & external PLACSP action */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/licitaciones"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#0d9373] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a todas las licitaciones
        </Link>

        <a
          href={placspUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] text-slate-700 hover:text-[#0d9373] border border-[#e2e8f0] hover:border-[#d1fae5] text-xs font-semibold shadow-2xs transition-all active:scale-95 group"
          title="Abrir expediente original en la Plataforma de Contratación del Sector Público (PLACSP)"
        >
          <ExternalLink className="h-3.5 w-3.5 text-[#0d9373] group-hover:scale-110 transition-transform" />
          <span>Ver en PLACSP</span>
        </a>
      </div>

      <ContractViewModeToggle
        technicalDetails={{
          idCanonica: lic.id,
          cpvPrincipal: lic.cpv_principal,
          nifOrgano: lic.contracting_authority_nif,
          dir3Organo: lic.contracting_authority_dir3,
          tipoContrato: lic.tipo_contrato,
          procedimiento: lic.procedimiento,
          placspUrl: placspUrl,
        }}
      >
        <div className="space-y-7">
          {/* Main Dossier Header */}
          <div className="mint-card p-6 sm:p-8 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded bg-[#f8fafb] border border-[#e2e8f0] text-slate-700">
                Exp: {lic.expediente || 'Sin número'}
              </span>
              <a
                href={placspUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[#ecfdf5] border border-[#d1fae5] text-[#0d9373] hover:bg-[#d1fae5] transition-colors inline-flex items-center gap-1"
                title="Enlace canónico al expediente oficial en PLACSP"
              >
                <span>PLACSP</span>
                <ExternalLink className="h-3 w-3" />
              </a>
              <EstadoBadge estado={lic.estado} status={contractStatus} />
              <TipoBadge tipo={lic.tipo_contrato} />
              <ProcedimientoBadge procedimiento={lic.procedimiento} />
              {contractStatus.flags.isInExecution && (lic as any).vigencia?.estadoVigencia === 'en_vigor' && (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0] flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] animate-pulse" />
                  En vigor ({(lic as any).vigencia.diasRestantes} días)
                </span>
              )}
              {contractStatus.flags.isInExecution && (lic as any).vigencia?.estadoVigencia === 'proximo_vencimiento' && (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#fffbeb] text-[#b45309] border border-[#fde68a] flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b] animate-pulse" />
                  Próximo a vencer ({(lic as any).vigencia.diasRestantes} días)
                </span>
              )}
              {contractStatus.flags.canShowFormalizationPeriodBadge && (
                <span 
                  className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe] flex items-center gap-1"
                  title="Contrato formalmente adjudicado. En plazo reglamentario de formalización según el artículo 153 de la Ley de Contratos del Sector Público."
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#3b82f6] animate-pulse" />
                  En plazo de formalización (Art. 153 LCSP)
                </span>
              )}
              {lic.esLicitadorUnico ? (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#fffbeb] text-[#b45309] border border-[#fef3c7]">
                  1 único licitador
                </span>
              ) : (() => {
                const lotesConOfertaUnica = ((lic as any).lotes || []).filter((l: any) => l.numOfertas === 1);
                if (lotesConOfertaUnica.length > 0) {
                  return (
                    <AnchorLink
                      href="#seccion-lotes"
                      className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#fffbeb] text-[#b45309] border border-[#fef3c7] hover:bg-[#fef3c7] transition-colors cursor-pointer"
                      title="Lotes adjudicados con una única oferta admitida en la plataforma. Clic para ver desglose."
                    >
                      {lotesConOfertaUnica.length} {lotesConOfertaUnica.length === 1 ? 'lote con oferta única' : 'lotes con oferta única'}
                    </AnchorLink>
                  );
                }
                return null;
              })()}
              {!lic.esLicitadorUnico && lic.num_ofertas && lic.num_ofertas > 1 && (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
                  {lic.num_ofertas} ofertas concurrentes
                </span>
              )}
              {(lic as any).lotizacion?.lotizado ? (
                <AnchorLink 
                  href="#seccion-lotes"
                  className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0] hover:bg-[#d1fae5] transition-colors flex items-center gap-1 cursor-pointer"
                  title="Contrato formalmente dividido en lotes según lo previsto en el art. 99 de la LCSP. Clic para ver desglose."
                >
                  <Layers className="h-3 w-3 text-[#10b981]" />
                  {(lic as any).lotizacion.numLotes} lotes (Art. 99 LCSP)
                </AnchorLink>
              ) : lic.procedimiento !== 'Contrato menor' && lic.procedimiento !== 'Menor' && lic.conjunto !== 'menores' ? (
                <span 
                  className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#f8fafc] text-slate-600 border border-[#cbd5e1] flex items-center gap-1"
                  title="Licitación tramitada como lote único según los pliegos de la convocatoria (Art. 99 LCSP)."
                >
                  <Boxes className="h-3 w-3 text-slate-400" />
                  Lote único
                </span>
              ) : null}
              {(lic as any).modificadosInfo?.tieneModificaciones && (
                <AnchorLink 
                  href="#seccion-modificaciones"
                  className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#fffbeb] text-[#b45309] border border-[#fde68a] hover:bg-[#fef3c7] transition-colors flex items-center gap-1 cursor-pointer"
                  title="Este contrato ha sido objeto de modificaciones contractuales o prórrogas registradas conforme a los artículos 203-207 de la LCSP. Clic para ver detalle."
                >
                  <RefreshCw className="h-3 w-3 text-[#d97706]" />
                  {(lic as any).modificadosInfo.totalModificaciones} {(lic as any).modificadosInfo.totalModificaciones === 1 ? 'modificación' : 'modificaciones'} (Art. 203 LCSP)
                </AnchorLink>
              )}
            </div>

            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-[#1e293b] tracking-tight leading-snug">
              {lic.objeto}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-3 border-t border-[#e2e8f0]">
              {authorityProfileIdentifier ? (
                <Link
                  href={`/organismos/${encodeURIComponent(authorityProfileIdentifier)}`}
                  className="flex items-center gap-1.5 text-slate-700 hover:text-[#0d9373] font-semibold transition-colors"
                >
                  <Building2 className="h-4 w-4 text-[#0d9373]" />
                  <span>{lic.contracting_authority_name}</span>
                </Link>
              ) : (
                <span className="flex items-center gap-1.5 text-slate-700 font-semibold">
                  <Building2 className="h-4 w-4 text-[#0d9373]" />
                  <span>{lic.contracting_authority_name}</span>
                </span>
              )}
              <span>•</span>
              <span className="flex items-center gap-1.5 font-mono text-slate-500">
                <Calendar className="h-4 w-4 text-slate-400" />
                Publicado el {formatDate(lic.fecha_publicacion || lic.fecha_adjudicacion)}
              </span>
              {(() => {
                const isDesierta = contractStatus.code === 'DESERTED';
                const isCancelada = contractStatus.code === 'CANCELED';
                const isResuelta = !contractStatus.flags.isTerminal && (lic.estado.toLowerCase().includes('resuelt') || Boolean((lic as any).fecha_formalizacion));
                const diasCalculados = crono.diasLicitacionTotal !== null
                  ? (isResuelta && crono.diasFormalizacion !== null
                      ? crono.diasLicitacionTotal + crono.diasFormalizacion
                      : crono.diasLicitacionTotal)
                  : lic.diasResolucion;

                if (isCancelada || diasCalculados === null || diasCalculados <= 0) return null;

                const tooltip = [
                  crono.diasOfertas !== null ? `Presentación de ofertas: ${crono.diasOfertas}d` : null,
                  crono.diasEvaluacion !== null ? (isDesierta ? `Evaluación/resolución: ${crono.diasEvaluacion}d` : `Evaluación/adjudicación: ${crono.diasEvaluacion}d`) : null,
                  crono.diasFormalizacion !== null && isResuelta ? `Formalización: ${crono.diasFormalizacion}d` : null,
                  `Tramitación total: ${diasCalculados}d`
                ].filter(Boolean).join(' · ');

                return (
                  <>
                    <span>•</span>
                    <span 
                      className="flex items-center gap-1.5 font-mono text-slate-600 font-medium cursor-help"
                      title={tooltip}
                    >
                      <Clock className="h-4 w-4 text-slate-400" />
                      {isDesierta ? `Tramitación: ${diasCalculados} días hasta desierta` : isResuelta ? `Tramitación total: ${diasCalculados} días` : `Adjudicado en ${diasCalculados} días`}
                    </span>
                  </>
                );
              })()}
              <span>•</span>
              <span className="text-slate-500">{lic.scope}</span>
            </div>
          </div>

          {/* Timeline de Ciclo de Vida V2 */}
          <ContractLifecycleTimeline
            contractStatus={contractStatus}
            estado={lic.estado}
            procedimiento={lic.procedimiento}
            tipoContrato={lic.tipo_contrato}
            fechaPublicacion={lic.fecha_publicacion}
            fechaLimite={lic.fecha_limite}
            fechaAdjudicacion={lic.fecha_adjudicacion}
            fechaFormalizacion={(lic as any).fecha_formalizacion}
            diasResolucion={lic.diasResolucion}
            vigencia={(lic as any).vigencia}
            tieneModificaciones={!!(lic as any).modificadosInfo?.tieneModificaciones}
            totalModificaciones={(lic as any).modificadosInfo?.totalModificaciones}
            crono={crono}
            validacionTemporal={validacionTemporal}
          />

          {/* Cronometría y Plazo Total V2 */}
          <ContractChronometryCard 
            crono={crono} 
            modificadosInfo={(lic as any).modificadosInfo}
            tipoContrato={lic.tipo_contrato}
          />

          {/* Economía del Contrato V2 */}
          <div className="mint-card p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-3">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-[#0d9373]" />
                <h3 className="font-bold text-sm text-[#1e293b] flex items-center gap-2">
                  Economía y Desglose Financiero del Contrato
                  {esEconomiaNoGasto && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800">
                      {esIngreso ? 'Ingreso municipal' : 'Sin flujo municipal directo determinado'}
                    </span>
                  )}
                </h3>
              </div>
              <span className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-full border ${
                contractStatus.flags.isFormalized
                  ? 'bg-[#ecfdf5] text-[#065f46] border-[#a7f3d0]'
                  : contractStatus.flags.isPendingFormalization
                  ? 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]'
                  : 'bg-[#f8fafb] text-slate-600 border-[#e2e8f0]'
              }`}>
                {contractStatus.flags.economicStatusLabel}
              </span>
            </div>

            <div className={`grid grid-cols-1 sm:grid-cols-2 ${
              lic.valor_estimado && lic.valor_estimado > 0
                ? 'lg:grid-cols-6'
                : 'lg:grid-cols-4'
            } gap-3 sm:gap-4`}>
              {/* Adjudicación Base */}
              <div className={`p-4 rounded-xl border border-[#d1fae5] bg-[#ecfdf5] min-w-0 overflow-hidden ${
                lic.valor_estimado && lic.valor_estimado > 0 ? 'lg:col-span-2' : ''
              }`}>
                <span className="text-[11px] text-[#0d9373] font-bold uppercase tracking-wider block mb-1 truncate" title={esEconomiaNoGasto ? "Importe adjudicado" : "Adjudicación Neta"}>
                  {esEconomiaNoGasto ? 'Importe adjudicado' : awardAmountType === 'unitario' ? 'Precio publicado' : awardAmountType === 'desconocido' ? 'Importe publicado' : 'Adjudicación Neta'}
                </span>
                <span
                  className="text-lg sm:text-xl font-extrabold font-mono text-[#0a0a0a] tracking-tight block whitespace-nowrap truncate"
                  title={hasComparableAward ? formatCurrency(lic.importe_adjudicacion ?? lic.importe_sin_iva) : 'Importe no comparable'}
                >
                  {hasComparableAward
                    ? formatCurrency(lic.importe_adjudicacion ?? lic.importe_sin_iva)
                    : 'Importe no comparable'}
                </span>
                <p className="text-[10px] text-[#065f46] mt-1 font-mono truncate" title={esEconomiaNoGasto ? 'Importe de ingreso/canon publicado; no representa gasto municipal.' : 'Base imponible sin impuestos'}>
                  {esEconomiaNoGasto ? 'Ingreso/canon publicado · no es gasto municipal' : awardAmountType === 'unitario' ? 'PLACSP lo publica como posible precio unitario · no es un total comparable' : awardAmountType === 'desconocido' ? 'PLACSP publica un importe cuya unidad económica no puede determinarse' : 'Base imponible sin impuestos'}
                </p>
              </div>

              {/* Presupuesto Base Licitación */}
              <div className={`p-4 rounded-xl border border-[#e2e8f0] bg-white min-w-0 overflow-hidden ${
                lic.valor_estimado && lic.valor_estimado > 0 ? 'lg:col-span-2' : ''
              }`}>
                <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block mb-1 truncate" title="Presupuesto Base (PBL)">
                  Presupuesto Base (PBL)
                </span>
                <span
                  className="text-lg sm:text-xl font-extrabold font-mono text-slate-800 tracking-tight block whitespace-nowrap truncate"
                  title={formatCurrency(lic.importe_sin_iva)}
                >
                  {formatCurrency(lic.importe_sin_iva)}
                </span>
                <p className="text-[10px] text-slate-400 mt-1 font-mono truncate" title={hasDistinctPblIva ? `Con IVA: ${formatCurrency(lic.importe_con_iva!)} (Límite máximo de gasto Art. 100 LCSP)` : 'Tope pliego (Art. 100 LCSP)'}>
                  {lotesSinAdjudicar.length > 0 && pblAdjudicados > 0
                    ? `Adj.: ${formatCurrency(pblAdjudicados)} · Sin adj.: ${formatCurrency(pblSinAdjudicar)}`
                    : hasDistinctPblIva ? `Con IVA: ${formatCurrency(lic.importe_con_iva!)}` : 'Tope pliego (Art. 100 LCSP)'}
                </p>
              </div>

              {/* Valor Estimado del Contrato (VEC) si existe */}
              {lic.valor_estimado && lic.valor_estimado > 0 && (
                <div className="p-4 rounded-xl border border-[#e2e8f0] bg-white min-w-0 overflow-hidden sm:col-span-2 lg:col-span-2">
                  <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block mb-1 truncate" title="Valor Estimado (VEC)">
                    Valor Estimado (VEC)
                  </span>
                  <span
                    className="text-lg sm:text-xl font-extrabold font-mono text-slate-800 tracking-tight block whitespace-nowrap truncate"
                    title={formatCurrency(lic.valor_estimado)}
                  >
                    {formatCurrency(lic.valor_estimado)}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono truncate" title="Art. 101 LCSP: importe global incluyendo prórrogas y modificaciones contractuales previstas. No incluye IVA.">
                    Art. 101 LCSP (sin IVA)
                  </p>
                </div>
              )}

              {!esEconomiaNoGasto && (
                <>
              {/* Ahorro / Baja conseguida */}
              <div className={`p-4 rounded-xl border border-[#e2e8f0] bg-white min-w-0 overflow-hidden ${
                lic.valor_estimado && lic.valor_estimado > 0 ? 'lg:col-span-3' : ''
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block truncate" title={esEconomiaNoGasto ? 'Comparativa económica' : 'Rebaja sobre PBL'}>
                    {esEconomiaNoGasto ? 'Comparativa económica' : 'Rebaja s/PBL'}
                  </span>
                  {lotesSinAdjudicar.length > 0 && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                      s/lotes sin adj.
                    </span>
                  )}
                </div>
                {hasSavings && !esEconomiaNoGasto ? (
                  <div>
                    <span className="text-lg sm:text-xl font-extrabold font-mono text-[#0d9373] flex items-center gap-1 tracking-tight whitespace-nowrap truncate">
                      <TrendingDown className="h-4 w-4 shrink-0" /> -{ahorroPct}%
                    </span>
                    <p className="text-[10px] text-slate-600 mt-1 font-mono truncate" title={`Ahorro: ${formatCurrency(ahorroEuros)}`}>
                      Ahorro: {formatCurrency(ahorroEuros)}
                    </p>
                    {lotesSinAdjudicar.length > 0 && (
                      <p className="text-[10px] text-slate-400 mt-0.5 font-mono truncate" title={`${formatCurrency(pblSinAdjudicar)} de presupuesto sin adjudicación válida`}>
                        +{formatCurrency(pblSinAdjudicar)} sin adjudicar
                      </p>
                    )}
                    {alertasV2.some(a => a.justificada) && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 truncate">
                        <ShieldCheck className="h-3 w-3 text-emerald-600 shrink-0" />
                        Baja justificada (Art. 149.4)
                      </span>
                    )}
                  </div>
                ) : (
                  <div>
                    <span className="text-lg sm:text-xl font-bold text-slate-400 font-mono tracking-tight block">
                      {esEconomiaNoGasto ? 'No aplica' : !hasComparableAward ? 'No comparable' : '0%'}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1 font-mono truncate">
                      {esEconomiaNoGasto
                        ? 'No se calcula ahorro para contratos de ingreso/concesión'
                        : awardAmountType === 'unitario'
                        ? 'El importe publicado parece ser un precio unitario; no se calcula baja sobre el PBL total'
                        : awardAmountType === 'desconocido'
                        ? 'No se calcula baja porque no puede asegurarse que ambos importes sean comparables'
                        : 'Sin descuento sobre PBL'}
                    </p>
                    {lotesSinAdjudicar.length > 0 && (
                      <AnchorLink
                        href="#seccion-lotes"
                        className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium text-amber-700 hover:text-amber-900 underline"
                        title="Ver lotes sin adjudicación en el desglose"
                      >
                        {formatCurrency(pblSinAdjudicar)} en {lotesSinAdjudicar.length === 1 ? '1 lote sin adjudicar' : `${lotesSinAdjudicar.length} lotes sin adjudicar`}
                      </AnchorLink>
                    )}
                  </div>
                )}
              </div>
                </>
              )}

              {/* IVA y Total devengado */}
              <div className={`p-4 rounded-xl border border-[#e2e8f0] bg-white min-w-0 overflow-hidden ${
                lic.valor_estimado && lic.valor_estimado > 0 ? 'lg:col-span-3' : ''
              }`}>
                <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block mb-1 truncate" title={esEconomiaNoGasto ? 'Importe publicado' : hasDistinctAdjIva ? 'Total con Impuestos' : 'Importe adjudicado'}>
                  {esEconomiaNoGasto ? 'Importe publicado' : hasDistinctAdjIva ? 'Total con Impuestos' : 'Importe adjudicado'}
                </span>
                {hasComparableAward && hasDistinctAdjIva ? (
                  <>
                    <span
                      className="text-lg sm:text-xl font-extrabold font-mono text-slate-800 tracking-tight block whitespace-nowrap truncate"
                      title={formatCurrency(lic.importe_adj_con_iva)}
                    >
                      {formatCurrency(lic.importe_adj_con_iva)}
                    </span>
                    <p
                      className="text-[10px] text-slate-400 mt-1 font-mono truncate"
                      title={
                        lic.importe_adjudicacion && lic.importe_adj_con_iva! > lic.importe_adjudicacion
                          ? `IVA devengado: ${formatCurrency(lic.importe_adj_con_iva! - lic.importe_adjudicacion)}`
                          : 'Impuestos incluidos según PLACSP'
                      }
                    >
                      {lic.importe_adjudicacion && lic.importe_adj_con_iva! > lic.importe_adjudicacion
                        ? `IVA: ${formatCurrency(lic.importe_adj_con_iva! - lic.importe_adjudicacion)}`
                        : 'Impuestos incluidos según PLACSP'}
                    </p>
                  </>
                ) : !lic.importe_adjudicacion && lic.importe_con_iva != null && hasDistinctPblIva ? (
                  <>
                    <span
                      className="text-lg sm:text-xl font-extrabold font-mono text-slate-800 tracking-tight block whitespace-nowrap truncate"
                      title={formatCurrency(lic.importe_con_iva)}
                    >
                      {formatCurrency(lic.importe_con_iva)}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1 font-mono truncate">
                      Presupuesto con impuestos (PBL)
                    </p>
                  </>
                ) : lic.importe_adjudicacion != null ? (
                  <>
                    <span
                      className="text-lg sm:text-xl font-extrabold font-mono text-slate-800 tracking-tight block whitespace-nowrap truncate"
                      title={formatCurrency(lic.importe_adjudicacion)}
                    >
                      {formatCurrency(lic.importe_adjudicacion)}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1 font-mono truncate">
                      {esEconomiaNoGasto
                        ? 'Importe publicado en PLACSP'
                        : 'No consta un importe con IVA diferenciado en PLACSP'}
                    </p>
                  </>
                ) : (
                  <>
                    <span className="text-lg sm:text-xl font-bold font-mono text-slate-400 block">
                      —
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1 font-mono truncate">
                      No facilitado en datos de PLACSP
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Modificaciones económicas o contractuales (excluyendo plazo) */}
            {(lic as any).modificadosInfo?.tieneModificaciones && (() => {
              const info = (lic as any).modificadosInfo;
              const tieneSobrecoste = (info.totalModificadosImporte || 0) > 0;
              const tieneReduccion = (info.totalModificadosImporte || 0) < 0;
              const tieneModificacionEconomica = tieneSobrecoste || tieneReduccion;

              // Buscar modificaciones que NO sean puramente de ampliación de plazo
              const modsNoPlazo = (info.modificaciones || []).filter((m: any) => {
                const tieneImporte = (m.importe || 0) !== 0;
                const tieneDuracion = (m.duracionDias > 0) || (m.duracionMeses > 0) || (m.duracionValor > 0);
                const esTipoPlazo = (m.tipo || '').toLowerCase().includes('plazo') || (m.tipo || '').toLowerCase().includes('prórroga');
                return tieneImporte || (!tieneDuracion && !esTipoPlazo);
              });

              // Si solo hubo ampliaciones de plazo, en la sección de economía no se muestra nada (va en Cronometría)
              if (!tieneModificacionEconomica && modsNoPlazo.length === 0) {
                return null;
              }

              return (
                <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                  tieneSobrecoste 
                    ? 'bg-rose-50/70 border-rose-200 text-rose-900' 
                    : tieneReduccion 
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50/70 border-amber-200 text-amber-900'
                }`}>
                  <div className="flex items-center gap-2">
                    {tieneSobrecoste ? (
                      <TrendingUp className="h-4 w-4 text-rose-600 shrink-0" />
                    ) : (
                      <RefreshCw className="h-4 w-4 text-amber-600 shrink-0" />
                    )}
                    <span>
                      Este contrato cuenta con{' '}
                      <strong>
                        {tieneModificacionEconomica ? 'modificaciones económicas posteriores registradas' : 'modificaciones contractuales posteriores registradas'}
                      </strong>
                      {tieneSobrecoste && (
                        <>
                          . Sobrecoste presupuestario acumulado:{' '}
                          <strong>+{formatCurrency(info.totalModificadosImporte)}</strong>
                        </>
                      )}
                      {tieneReduccion && (
                        <>
                          . Reducción presupuestaria acumulada:{' '}
                          <strong>{formatCurrency(info.totalModificadosImporte)}</strong>
                        </>
                      )}
                      {!tieneModificacionEconomica && (
                        <> (ajustes técnicos u operativos sin variación de precio)</>
                      )}
                      .
                    </span>
                  </div>
                  <a
                    href="#seccion-modificaciones"
                    className={`font-semibold underline shrink-0 ml-2 ${
                      tieneSobrecoste ? 'text-rose-800 hover:text-rose-950' : 'text-amber-800 hover:text-amber-950'
                    }`}
                  >
                    Ver detalle
                  </a>
                </div>
              );
            })()}
          </div>

          {/* Señales de Auditoría V2 */}
          <ContractAlertsCard
            alertas={alertasV2}
            redFlags={(lic as any).redFlags}
            placspUrl={placspUrl}
            currentContractId={lic.id}
          />

          {/* Sección de Modificaciones Contractuales (Art. 203-207 LCSP) */}
          {(lic as any).modificadosInfo?.tieneModificaciones && (
            <div id="seccion-modificaciones" className="mint-card p-6 space-y-4 border-amber-200/90 bg-gradient-to-br from-white to-amber-50/20 scroll-mt-28">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e2e8f0] pb-3">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-amber-600" />
                  <h3 className="font-bold text-sm text-[#1e293b]">
                    Modificaciones e Incidencias Contractuales (Art. 203-207 LCSP)
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-amber-800 bg-amber-100/80 px-2.5 py-1 rounded-full border border-amber-300/60">
                    {(lic as any).modificadosInfo.totalModificaciones} {(lic as any).modificadosInfo.totalModificaciones === 1 ? 'modificación aprobada' : 'modificaciones aprobadas'}
                  </span>
                  {(lic as any).modificadosInfo.totalModificadosImporte > 0 && (
                    <span className="text-xs font-mono font-bold text-red-700 bg-red-50 px-2.5 py-1 rounded-full border border-red-200">
                      Sobrecoste: +{formatCurrency((lic as any).modificadosInfo.totalModificadosImporte)}
                    </span>
                  )}
                  {((lic as any).modificadosInfo.totalModificadosPlazoDias > 0 || (lic as any).modificadosInfo.totalModificadosPlazoMeses > 0) && (
                    <span className="text-xs font-mono font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                      Plazo: {formatTotalPlazoBadge((lic as any).modificadosInfo.totalModificadosPlazoDias, (lic as any).modificadosInfo.totalModificadosPlazoMeses)}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {(lic as any).modificadosInfo.modificaciones.map((mod: any, idx: number) => {
                  const tieneSobrecoste = mod.importe > 0;
                  const tieneProrroga = (mod.duracionValor > 0) || (mod.duracionDias > 0) || (mod.duracionMeses > 0);
                  const textoPlazo = formatPlazoMod(mod.duracionValor, mod.duracionUnidad, mod.duracionDias, mod.duracionMeses);

                  return (
                    <div 
                      key={mod.id || idx}
                      className="p-4 rounded-xl border border-amber-200 bg-white/95 shadow-2xs space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-200">
                            Modificación nº {mod.numero}
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            {mod.tipo}
                          </span>
                        </div>

                        {mod.fecha && (
                          <span className="text-xs font-mono text-slate-500 flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            {formatDate(mod.fecha)}
                          </span>
                        )}
                      </div>

                      {mod.motivo && (
                        <div className="text-xs text-slate-600 bg-slate-50/80 p-3 rounded-lg border border-slate-200/80 leading-relaxed font-sans whitespace-pre-line">
                          <span className="font-semibold text-slate-800 block mb-1">
                            Motivo y resolución oficial:
                          </span>
                          {mod.motivo}
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/60">
                          <span className="text-[10px] uppercase font-mono font-bold text-slate-500 block">
                            Sobrecoste presupuestario
                          </span>
                          <span className={`font-mono font-bold text-sm ${tieneSobrecoste ? 'text-red-600' : 'text-slate-700'}`}>
                            {tieneSobrecoste ? `+${formatCurrency(mod.importe)}` : '0,00 € (Sin sobrecoste)'}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/60">
                          <span className="text-[10px] uppercase font-mono font-bold text-slate-500 block">
                            Variación de plazo
                          </span>
                          <span className={`font-mono font-bold text-sm ${tieneProrroga ? 'text-amber-700' : 'text-slate-700'}`}>
                            {textoPlazo}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/60 flex flex-col justify-between">
                          <span className="text-[10px] uppercase font-mono font-bold text-slate-500 block">
                            Documentación y resolución
                          </span>
                          {mod.documentoUrl ? (
                            <a
                              href={mod.documentoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs font-semibold text-[#0d9373] hover:underline flex items-center gap-1 mt-0.5 truncate"
                              title="Ver documento en la Plataforma de Contratación"
                            >
                              <span className="truncate">{mod.documentoNombre || 'Ver expediente en PLACSP'}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          ) : (
                            <span className="font-mono text-xs text-slate-500">Expediente municipal</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

      {/* Main Dossier Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Adjudicatario Card */}
        <div className="mint-card p-6 space-y-3">
          <h3 className="font-bold text-sm text-[#1e293b] flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-[#0d9373]" />
            <span>Empresa Adjudicataria</span>
          </h3>

          {(() => {
            const lotes = ((lic as any).lotes || []) as any[];

            // Group winners by company (keying by NIF or name)
            const winnerMap = new Map<string, {
              nombre: string;
              nif: string | null;
              lotes: (string | number)[];
              importeTotal: number;
              tieneImporte: boolean;
            }>();

            for (const l of lotes) {
              if (!isEligibleAwardLotStatus(l.estadoLote)) continue;

              const awards = Array.isArray(l.adjudicaciones) && l.adjudicaciones.length > 0
                ? l.adjudicaciones
                : l.adjudicatario
                  ? [{
                      awardee: l.adjudicatario,
                      nifAdjudicatario: l.nifAdjudicatario || null,
                      importeAdjudicacion: l.importeAdjudicacion ?? l.importeSinIva ?? null,
                    }]
                  : [];

              for (const award of awards) {
                if (!award.awardee) continue;
                const key = (award.nifAdjudicatario || award.awardee).trim().toUpperCase();
                const lotNum = l.numeroLote || '';
                const imp = award.importeAdjudicacion == null ? null : Number(award.importeAdjudicacion);
                if (!winnerMap.has(key)) {
                  winnerMap.set(key, {
                    nombre: award.awardee,
                    nif: award.nifAdjudicatario || null,
                    lotes: lotNum ? [lotNum] : [],
                    importeTotal: imp ?? 0,
                    tieneImporte: imp != null,
                  });
                } else {
                  const existing = winnerMap.get(key)!;
                  if (lotNum && !existing.lotes.includes(lotNum)) {
                    existing.lotes.push(lotNum);
                  }
                  if (imp != null) {
                    existing.importeTotal += imp;
                    existing.tieneImporte = true;
                  }
                }
              }
            }

            const uniqueWinners = Array.from(winnerMap.values());
            const sinAdjudicarCount = lotes.filter(l => !isEligibleAwardLotStatus(l.estadoLote) || (!l.importeAdjudicacion && !l.adjudicatario)).length;
            const adjudicadosCount = lotes.filter(l => isEligibleAwardLotStatus(l.estadoLote) && Boolean(l.adjudicatario || l.importeAdjudicacion != null)).length;

            if (uniqueWinners.length > 1) {
              return (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      Múltiples adjudicatarios ({uniqueWinners.length} empresas · {adjudicadosCount} {adjudicadosCount === 1 ? 'lote adjudicado' : 'lotes adjudicados'}{sinAdjudicarCount > 0 ? `, ${sinAdjudicarCount} sin adjudicar` : ''})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {uniqueWinners.map((w, i) => {
                      const target = getOpaqueEmpresaId(w.nif, w.nombre);
                      const lotesLabel = w.lotes.length > 1 ? `Lotes ${w.lotes.join(', ')}` : `Lote ${w.lotes[0]}`;
                      return (
                        <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-[#f8fafb] border border-[#e2e8f0] text-xs">
                          <div>
                            <Link href={`/empresas/${encodeURIComponent(target)}`} className="font-bold text-slate-800 hover:text-[#0d9373] transition-colors">
                              {w.nombre}
                            </Link>
                            {w.nif && <div className="font-mono text-[11px] text-slate-400">CIF: {formatNif(w.nif)}</div>}
                            <Link
                              href={`/empresas/${encodeURIComponent(target)}`}
                              className="text-[11px] font-semibold text-[#0d9373] hover:underline inline-flex items-center gap-0.5 mt-0.5"
                            >
                              Ver ficha <ChevronRight className="h-2.5 w-2.5" />
                            </Link>
                          </div>
                          <div className="text-right">
                            <span className="font-mono text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 block">
                              {lotesLabel}
                            </span>
                            {w.tieneImporte && (
                              <span className="font-mono text-[11px] text-slate-600 font-semibold mt-0.5 block">
                                {formatCurrency(w.importeTotal)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <AnchorLink
                    href="#seccion-lotes"
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline inline-flex items-center gap-1 pt-1"
                  >
                    <Layers className="h-3.5 w-3.5 text-[#10b981]" />
                    Ver desglose completo de lotes ({lotes.length} lotes)
                  </AnchorLink>
                </div>
              );
            }

            const singleWinnerName = lic.adjudicatario || (uniqueWinners.length === 1 ? uniqueWinners[0].nombre : null);
            const singleWinnerNif = lic.nif_adjudicatario || (uniqueWinners.length === 1 ? uniqueWinners[0].nif : null);

            if (singleWinnerName) {
              const adjInfo = (lic as any).adjudicatarioInfo;
              const canonicalName = adjInfo?.canonicalNombre || singleWinnerName;
              const canonicalTarget = adjInfo?.canonicalId || getOpaqueEmpresaId(singleWinnerNif, singleWinnerName);
              const esNombreAnterior = adjInfo?.tipoVinculo === 'cambio_denominacion' && adjInfo.canonicalNombre && adjInfo.canonicalNombre.toUpperCase() !== singleWinnerName.toUpperCase();

              return (
                <div className="space-y-2.5 pt-1">
                  <div>
                    <Link
                      href={`/empresas/${encodeURIComponent(canonicalTarget)}`}
                      className="font-bold text-base text-[#1e293b] hover:text-[#0d9373] transition-colors block leading-snug"
                    >
                      {canonicalName}
                    </Link>

                    {esNombreAnterior && (
                      <p className="text-xs text-[#b45309] font-medium mt-1">
                        Adjudicado formalmente como: <span className="font-semibold italic">&ldquo;{singleWinnerName}&rdquo;</span>
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {singleWinnerNif && (
                      <span className="font-mono bg-[#f8fafb] px-2.5 py-1 rounded border border-[#e2e8f0] text-slate-700 font-semibold">
                        CIF: {formatNif(singleWinnerNif)}
                      </span>
                    )}

                    {lotes.length > 1 && (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        Adjudicataria de todos los lotes ({lotes.length} lotes)
                      </span>
                    )}

                    {adjInfo?.grupo && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
                        <Building2 className="h-3 w-3" />
                        {adjInfo.grupo.nombre}
                      </span>
                    )}

                    {esNombreAnterior && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#fffbeb] text-[#b45309] border border-[#fef3c7]">
                        <RefreshCw className="h-3 w-3" />
                        Cambio de Denominación
                      </span>
                    )}

                    {adjInfo?.esDniEnmascarado && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
                        <ShieldCheck className="h-3 w-3" />
                        DNI Verificado
                      </span>
                    )}

                    {lic.es_pyme !== null && (
                      <span className="text-[11px] px-2.5 py-1 rounded bg-[#f8fafb] text-slate-600 border border-[#e2e8f0]">
                        {lic.es_pyme ? 'Clasificada como PYME' : 'Gran Empresa'}
                      </span>
                    )}
                  </div>

                  <Link
                    href={`/empresas/${encodeURIComponent(canonicalTarget)}`}
                    className="text-xs font-semibold text-[#0d9373] hover:underline inline-flex items-center gap-1 pt-1"
                  >
                    Ver ficha y contratos de esta empresa <ChevronRight className="h-3 w-3" />
                  </Link>

                  {lotes.length > 1 && (
                    <div>
                      <AnchorLink
                        href="#seccion-lotes"
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline inline-flex items-center gap-1 pt-1"
                      >
                        <Layers className="h-3.5 w-3.5 text-[#10b981]" />
                        Ver desglose de adjudicación por lote ({lotes.length} lotes)
                      </AnchorLink>
                    </div>
                  )}
                </div>
              );
            }

            if (lotes.length > 0) {
              return (
                <div className="space-y-2 pt-1">
                  <p className="text-xs text-slate-600">
                    Licitación dividida en <strong>{lotes.length} lotes</strong> con adjudicatarios individualizados.
                  </p>
                  <AnchorLink
                    href="#seccion-lotes"
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline inline-flex items-center gap-1"
                  >
                    <Layers className="h-3.5 w-3.5 text-[#10b981]" />
                    Ver desglose de adjudicación por lote ({lotes.length} lotes)
                  </AnchorLink>
                </div>
              );
            }

            return <p className="text-xs text-slate-400 italic">Expediente en tramitación o desierto</p>;
          })()}
        </div>

        {/* Órgano de Contratación Card */}
        <div className="mint-card p-6 space-y-3">
          <h3 className="font-bold text-sm text-[#1e293b] flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#0891b2]" />
            <span>Órgano de Contratación</span>
          </h3>
          <div className="space-y-2 pt-1">
            {authorityProfileIdentifier ? (
              <Link
                href={`/organismos/${encodeURIComponent(authorityProfileIdentifier)}`}
                className="font-bold text-base text-[#1e293b] hover:text-[#0d9373] transition-colors block"
              >
                {lic.contracting_authority_name}
              </Link>
            ) : (
              <span className="font-bold text-base text-[#1e293b] block">
                {lic.contracting_authority_name}
              </span>
            )}
            <p className="text-xs text-slate-600 leading-relaxed">
              {lic.contracting_authority_name}
            </p>
            {lic.contracting_authority_nif && (
              <p className="text-xs font-mono text-slate-400">
                NIF Entidad: {formatNif(lic.contracting_authority_nif)}
              </p>
            )}
            {authorityProfileIdentifier && (
              <Link
                href={`/organismos/${encodeURIComponent(authorityProfileIdentifier)}`}
                className="text-xs font-semibold text-[#0d9373] hover:underline inline-flex items-center gap-1 pt-1"
              >
                Ver perfil y presupuesto del organismo <ChevronRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>

        {/* Clasificación & CPV */}
        <div className="mint-card p-6 space-y-3">
          <h3 className="font-bold text-sm text-[#1e293b] flex items-center gap-2">
            <Tag className="h-4 w-4 text-[#2563eb]" />
            <span>Clasificación CPV y Ubicación</span>
          </h3>
          <div className="space-y-2 pt-1 text-xs">
            <div>
              <span className="text-slate-500 block mb-0.5">Código CPV Principal:</span>
              <span className="font-mono font-bold text-slate-900 text-sm bg-[#f8fafb] px-2.5 py-1 rounded border border-[#e2e8f0] inline-block">
                {lic.cpv_principal || 'No especificado'}
              </span>
            </div>
            {/* Lugar de Ejecución */}
            <div>
              <span className="text-slate-500 block mb-1">Lugar de Ejecución:</span>
              <div className="bg-[#f8fafb] rounded-lg p-2.5 border border-[#e2e8f0] space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-[#0d9373]" /> Municipio:
                  </span>
                  <span className="font-semibold text-slate-800">
                    {lic.ubicacion && lic.ubicacion.includes('(')
                      ? lic.ubicacion.split('(')[0].trim()
                      : (lic.contracting_authority_city || 'Alcázar de San Juan')}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200/60 pt-1">
                  <span className="text-slate-500">Provincia:</span>
                  <span className="font-medium text-slate-700">
                    {lic.ubicacion && lic.ubicacion.includes('(')
                      ? lic.ubicacion.match(/\(([^)]+)\)/)?.[1] || 'Ciudad Real'
                      : (lic.ubicacion || 'Ciudad Real')}
                  </span>
                </div>
                {lic.nuts && (
                  <div className="flex items-center justify-between border-t border-slate-200/60 pt-1">
                    <span className="text-slate-500">Código NUTS:</span>
                    <span className="font-mono text-[11px] font-bold text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                      {lic.nuts}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {lic.duracion && (
              <div>
                <span className="text-slate-500 block mb-0.5">Plazo de Ejecución y Vigencia:</span>
                <span className="text-slate-700 flex items-center gap-1 font-mono font-medium flex-wrap">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  {(lic as any).vigencia?.duracionTexto || `${lic.duracion} ${lic.duracion_unidad || 'meses'}`}
                  {(lic as any).vigencia?.fechaFinEstimada && (
                    <span className="text-slate-500 text-[11px] ml-1">
                      (Fin est: {formatDate((lic as any).vigencia.fechaFinEstimada)})
                    </span>
                  )}
                </span>
                {(lic as any).vigencia?.esProrrogable && (
                  <span className="inline-block mt-1 text-[10px] font-semibold text-[#065f46] bg-[#ecfdf5] px-2 py-0.5 rounded border border-[#a7f3d0]">
                    Prorrogable según pliegos (Art. 29 LCSP)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Concurrencia y Datos Técnicos */}
        <div className="mint-card p-6 space-y-3">
          <h3 className="font-bold text-sm text-[#1e293b] flex items-center gap-2">
            <Users className="h-4 w-4 text-[#d97706]" />
            <span>Concurrencia de Ofertas</span>
          </h3>
          <div className="space-y-2 pt-1 text-xs">
            <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-2">
              <span className="text-slate-500">Ofertas presentadas:</span>
              <span className="font-bold font-mono text-slate-900 text-sm">
                {lic.num_ofertas !== null ? formatNumber(lic.num_ofertas) : 'No indicado'}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-2">
              <span className="text-slate-500">Tramitación:</span>
              <span className="text-slate-700 font-medium">{formatUrgencia(lic.urgencia)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Financiación Europea:</span>
              <span className="text-slate-700 font-medium">
                {lic.financiacion_ue && lic.financiacion_ue !== 'NO-EU' && lic.financiacion_ue !== '0' && lic.financiacion_ue !== 'NO' && lic.financiacion_ue !== 'false'
                  ? 'Sí (Fondos UE)'
                  : 'No / Fondos propios'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sección de Desglose de Lotes Adjudicados (Art. 99 LCSP) */}
      {(lic as any).lotes && (lic as any).lotes.length > 0 && (
        <div id="seccion-lotes" className="mint-card p-6 space-y-4 border-emerald-200/90 bg-gradient-to-br from-white to-emerald-50/20 scroll-mt-28">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e2e8f0] pb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-[#0d9373]" />
              <div>
                <h3 className="font-bold text-sm text-[#1e293b]">
                  Desglose de Lotes Adjudicados (Art. 99 LCSP)
                </h3>
                <p className="text-xs text-slate-500">
                  Licitación dividida en lotes independientes para promover la concurrencia y facilitar el acceso a PYMEs.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-full border border-emerald-300/60">
                {(lic as any).lotes.length} {(lic as any).lotes.length === 1 ? 'lote formal' : 'lotes registrados'}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            {(() => {
              const lotes = (lic as any).lotes as any[];
              const lotesAdjudicados = lotes.filter((l: any) => l.importeAdjudicacion != null && isEligibleAwardLotStatus(l.estadoLote));
              const lotesSinAdjudicar = lotes.filter((l: any) => !isEligibleAwardLotStatus(l.estadoLote) || (!l.importeAdjudicacion && !l.adjudicatario));
              const totalPblLots = lotes.reduce((acc: number, l: any) => acc + (l.presupuestoSinIva || 0), 0);
              const totalPblAdjudicados = lotesAdjudicados.reduce((acc: number, l: any) => acc + (l.presupuestoSinIva || 0), 0);
              const totalPblSinAdjudicar = lotesSinAdjudicar.reduce((acc: number, l: any) => acc + (l.presupuestoSinIva || 0), 0);
              const totalAdjLots = lotesAdjudicados.reduce((acc: number, l: any) => acc + (l.importeAdjudicacion || 0), 0);
              const hasTotalSavings = totalPblAdjudicados > 0 && totalAdjLots > 0 && totalPblAdjudicados > totalAdjLots;
              const totalAhorroEur = hasTotalSavings ? totalPblAdjudicados - totalAdjLots : 0;
              const totalAhorroPct = hasTotalSavings ? Math.round((totalAhorroEur / totalPblAdjudicados) * 1000) / 10 : 0;

              return (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#e2e8f0] text-slate-500 font-semibold bg-slate-50/60">
                      <th className="py-2.5 px-3">Lote</th>
                      <th className="py-2.5 px-3">Denominación / Objeto</th>
                      <th className="py-2.5 px-3">Empresa Adjudicataria</th>
                      <th className="py-2.5 px-3 text-right">Presupuesto (PBL)</th>
                      <th className="py-2.5 px-3 text-right">Adjudicación</th>
                      <th className="py-2.5 px-3 text-right">Baja / Ahorro</th>
                      <th className="py-2.5 px-3 text-center">Concurrencia</th>
                      <th className="py-2.5 px-3 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {lotes.map((lote: any, idx: number) => {
                      const numLote = lote.numeroLote || (idx + 1);
                      const estadoLoteElegible = isEligibleAwardLotStatus(lote.estadoLote);
                      const tieneAdjudicatario = estadoLoteElegible && !!lote.adjudicatario;
                      const displayEstado = lote.estadoLote || (tieneAdjudicatario ? 'Adjudicado' : 'En tramitación');
                      const pbl = lote.presupuestoSinIva ?? (tieneAdjudicatario ? null : lote.importeSinIva);
                      const adj = estadoLoteElegible ? lote.importeAdjudicacion : null;
                      const hasLoteSavings = pbl && adj && pbl > adj;
                      const ahorroEur = hasLoteSavings ? pbl - adj : null;
                      const ahorroPct = hasLoteSavings ? Math.round(((pbl - adj) / pbl) * 1000) / 10 : null;
                      const ofertasStr = lote.numOfertas != null ? `${lote.numOfertas} ${lote.numOfertas === 1 ? 'oferta' : 'ofertas'}` : null;

                      return (
                        <tr key={lote.id || idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-3 font-mono font-bold text-[#0d9373] whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Lote {numLote}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-medium text-[#1e293b] max-w-xs sm:max-w-sm">
                            <div className="line-clamp-2" title={lote.nombreLote || `Lote ${numLote}`}>
                              {lote.nombreLote || `Lote ${numLote}`}
                            </div>
                            {lote.cpv && (
                              <span className="text-[11px] font-mono text-slate-400">
                                CPV: {lote.cpv}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-700">
                            {tieneAdjudicatario ? (
                              <div className="space-y-0.5">
                                <Link
                                  href={`/empresas/${encodeURIComponent(getOpaqueEmpresaId(lote.nifAdjudicatario, lote.adjudicatario))}`}
                                  className="font-semibold text-slate-800 hover:text-[#0d9373] transition-colors line-clamp-1"
                                >
                                  {lote.adjudicatario}
                                </Link>
                                {lote.nifAdjudicatario && (
                                  <span className="font-mono text-[11px] text-slate-400">
                                    CIF: {formatNif(lote.nifAdjudicatario)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">
                                {displayEstado.toLowerCase().includes('desiert') ? 'Desierto' : !estadoLoteElegible ? 'Sin adjudicación' : 'No adjudicado'}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                            {pbl != null ? formatCurrency(pbl) : '—'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-semibold text-[#1e293b] whitespace-nowrap">
                            {adj != null ? (
                              formatCurrency(adj)
                            ) : displayEstado.toLowerCase().includes('desiert') ? (
                              <span className="text-rose-600 font-normal text-[11px]">Desierto</span>
                            ) : !estadoLoteElegible ? (
                              <span className="text-slate-400 font-normal text-[11px]">Sin adjudicación</span>
                            ) : (
                              <span className="text-slate-400 font-normal text-[11px]">En trámite</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                            {hasLoteSavings ? (
                              <span className="text-[#0d9373] font-semibold" title={`Ahorro: ${formatCurrency(ahorroEur!)}`}>
                                -{ahorroPct}%
                              </span>
                            ) : adj != null && pbl != null && adj >= pbl ? (
                              <span className="text-slate-400 font-normal">0%</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {ofertasStr ? (
                              <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
                                lote.numOfertas === 1 ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {ofertasStr}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              displayEstado.toLowerCase().includes('adjudicad') || displayEstado.toLowerCase().includes('resuelt')
                                ? 'bg-emerald-100 text-emerald-800'
                                : displayEstado.toLowerCase().includes('desiert')
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {displayEstado}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {lotes.length > 1 && (
                    <tfoot className="border-t-2 border-[#cbd5e1] bg-slate-50/90 font-semibold text-slate-800">
                      <tr>
                        <td colSpan={3} className="py-3 px-3 text-slate-800 font-bold">
                          <div>
                            Total Licitación (Suma de {lotes.length} lotes)
                            {lotesSinAdjudicar.length > 0 && (
                              <div className="text-[10px] font-normal text-slate-500 mt-0.5">
                                {lotesSinAdjudicar.length} {lotesSinAdjudicar.length === 1 ? 'lote sin adjudicar' : 'lotes sin adjudicar'}{totalPblSinAdjudicar > 0 ? `: ${formatCurrency(totalPblSinAdjudicar)} de presupuesto sin adjudicar` : ''}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-700 whitespace-nowrap">
                          {totalPblLots > 0 ? formatCurrency(totalPblLots) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-emerald-800 whitespace-nowrap">
                          {totalAdjLots > 0 ? formatCurrency(totalAdjLots) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">
                          {hasTotalSavings ? (
                            <span className="text-[#0d9373]" title={`Ahorro en lotes adjudicados: ${formatCurrency(totalAhorroEur)} sobre ${formatCurrency(totalPblAdjudicados)}`}>
                              -{totalAhorroPct}%
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal" title={totalPblSinAdjudicar > 0 ? `0% de baja en los lotes adjudicados (${formatCurrency(totalPblAdjudicados)})` : '0% de baja'}>
                              0%{totalPblSinAdjudicar > 0 ? ' (s/adj.)' : ''}
                            </span>
                          )}
                        </td>
                        <td colSpan={2} className="py-3 px-3 text-center text-slate-500 font-normal text-[11px]">
                          {totalAdjLots > 0 ? 'Adjudicación consolidada' : 'En tramitación'}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              );
            })()}
          </div>
        </div>
      )}

      {/* Documentación Oficial del Expediente en PLACSP */}
      {(lic as any).documentos && (lic as any).documentos.length > 0 && (
        <div id="seccion-documentos" className="mint-card p-6 sm:p-7 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e2e8f0] pb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#0d9373]" />
              <div>
                <h3 className="font-bold text-sm sm:text-base text-[#1e293b]">
                  Documentación Oficial del Expediente en PLACSP ({(lic as any).documentos.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Pliegos, informes técnicos, actas de la mesa de contratación y justificaciones administrativas registradas.
                </p>
              </div>
            </div>
            <a
              href={placspUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-[#0d9373] hover:underline inline-flex items-center gap-1 self-start sm:self-auto"
            >
              <span>Ver expediente completo en PLACSP</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {(lic as any).documentos.map((doc: any, idx: number) => {
              const isAnormalidad = doc.es_justificacion_anormalidad;
              const isActa = doc.tipo_documento === 'ACTA_MESA';
              const isPliego = doc.tipo_documento === 'PLIEGO';

              return (
                <div
                  key={doc.id || idx}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2.5 transition-all ${
                    isAnormalidad
                      ? 'bg-emerald-50/80 border-emerald-300 ring-1 ring-emerald-200'
                      : 'bg-white border-slate-200 hover:border-[#d1fae5]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full ${
                        isAnormalidad
                          ? 'bg-emerald-200 text-emerald-900 border border-emerald-300 font-extrabold'
                          : isActa
                          ? 'bg-purple-100 text-purple-800 border border-purple-200'
                          : isPliego
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {isAnormalidad ? '🟢 Justificación Art. 149' : (doc.tipo_documento || 'OTROS').replace('_', ' ')}
                      </span>
                      {doc.fecha && (
                        <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          {doc.fecha}
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-bold text-slate-800 line-clamp-2 leading-snug" title={doc.titulo}>
                      {doc.titulo}
                    </h4>
                  </div>

                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isAnormalidad
                        ? 'bg-[#0d9373] text-white hover:bg-[#00b48a] shadow-2xs'
                        : 'bg-slate-50 hover:bg-[#ecfdf5] text-slate-700 hover:text-[#0d9373] border border-slate-200 hover:border-[#d1fae5]'
                    }`}
                  >
                    <span>{isAnormalidad ? 'Descargar Informe de Justificación' : 'Descargar Documento'}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Official Link & Verification Card */}
      <div className="mint-card p-6 sm:p-7 space-y-4 bg-[#f8fafb] border-[#cbd5e1]/70">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="space-y-1">
            <h4 className="font-bold text-sm sm:text-base text-[#1e293b] flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#0d9373]" />
              <span>Expediente Oficial Verificado en la Plataforma del Estado</span>
            </h4>
            <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
              Consulta directamente la publicación original en la Plataforma de Contratación del Sector Público (PLACSP) para descargar pliegos, actas de la mesa de contratación y resoluciones firmadas.
              <span className="block text-[11px] text-slate-400 mt-1">
                Nota: Si la plataforma estatal muestra un error de cortafuegos (WAF), ábrela en ventana de incógnito o limpia las cookies de contrataciondelestado.es.
              </span>
            </p>
          </div>
          <a
            href={placspUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#0d9373] hover:bg-[#0b7c61] font-semibold text-xs sm:text-sm text-white shadow-xs transition-all shrink-0 active:scale-95"
          >
            <span>Abrir en PLACSP</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        <div className="pt-3 border-t border-[#e2e8f0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-600 font-mono text-[11px] min-w-0">
            <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">URL Canónica:</span>
            <span className="truncate max-w-[200px] sm:max-w-md bg-white px-2 py-0.5 rounded border border-[#e2e8f0] text-slate-700 select-all" title={placspUrl}>
              {placspUrl}
            </span>
            {placspId && (
              <span className="bg-white px-2 py-0.5 rounded border border-[#e2e8f0] text-slate-500">
                ID Sindicación: {placspId}
              </span>
            )}
          </div>

          <Link
            href="/metodologia#verificabilidad"
            className="text-xs font-semibold text-[#0d9373] hover:underline inline-flex items-center gap-1 shrink-0"
          >
            <span>Metodología de Verificación</span>
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Sistema de Investigación: Relaciones Cruzadas (Empresa, CPV, Organismo) */}
      <div className="pt-4 border-t border-[#e2e8f0]">
        <ContractInvestigationHub
          currentId={lic.id}
          adjudicatario={lic.adjudicatario}
          empresaId={(lic as any).adjudicatarioInfo?.canonicalId || getOpaqueEmpresaId(lic.nif_adjudicatario, lic.adjudicatario)}
          organo={lic.contracting_authority_name}
          cpvPrincipal={lic.cpv_principal}
          relacionadasOrgano={lic.relacionadas || []}
          relacionadasEmpresa={lic.relacionadasEmpresa || []}
          statsEmpresa={lic.statsEmpresa}
          relacionadasCpv={lic.relacionadasCpv || []}
          lotesAdjudicatariosInfo={(lic as any).lotesAdjudicatariosInfo ?? null}
        />
      </div>
        </div>
      </ContractViewModeToggle>
    </div>
  );
}
