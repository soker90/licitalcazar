'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  AlertTriangle, 
  ShieldCheck, 
  ExternalLink, 
  ChevronDown, 
  ChevronUp, 
  ChevronRight,
  Info,
  Scale,
  FileText,
  HelpCircle,
  Zap,
  ArrowRight,
  Layers
} from 'lucide-react';
import type { AlertaV2, AlertaContratoDetalle, RedFlag } from '@/lib/db';
import { formatCurrency, formatDate } from '@/lib/format';

interface ContractAlertsCardProps {
  alertas: AlertaV2[];
  redFlags?: RedFlag[];
  placspUrl?: string;
  currentContractId?: string;
}

export default function ContractAlertsCard({ alertas = [], redFlags = [], placspUrl, currentContractId }: ContractAlertsCardProps) {
  const [expandedEvidencia, setExpandedEvidencia] = useState<Record<string, boolean>>({});

  const toggleEvidencia = (id: string) => {
    setExpandedEvidencia(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const displayAlertas: AlertaV2[] = [...(alertas || [])];

  if (redFlags && redFlags.length > 0) {
    for (const flag of redFlags) {
      if (flag.tipo === 'negociado_sin_publicidad') {
        const alreadyExists = displayAlertas.some(
          a => a.tipo === 'NEGOCIADO_SIN_PUBLICIDAD' || a.id.startsWith('NEG-SIN-PUB')
        );
        if (!alreadyExists) {
          const isAlerta = flag.level === 'alerta';
          displayAlertas.push({
            id: `NEG-SIN-PUB-${currentContractId || 'EXP'}`,
            category: 'D',
            tipo: 'NEGOCIADO_SIN_PUBLICIDAD',
            severity: isAlerta ? 'ALTA' : 'MEDIA',
            level: isAlerta ? 'ALTA' : 'MEDIA',
            scoreEscala: isAlerta ? 7.5 : 4.0,
            confidence: 95,
            title: flag.title,
            description: flag.description,
            datoObjetivo: flag.hecho || 'Contrato tramitado como negociado sin publicidad según datos oficiales de PLACSP.',
            source: 'Plataforma de Contratación del Sector Público (PLACSP)',
            urlFuente: placspUrl || 'Enlace oficial no disponible en los datos consultados',
            fechaExtraccion: new Date().toISOString(),
            fechaCreacion: new Date().toISOString(),
            reglaAplicada: 'Art. 168 y 170.2 LCSP (Procedimiento Negociado sin Publicidad)',
            versionMetodologia: 'v2.2',
            limitations: 'Basado en los datos y documentos publicados en PLACSP. Es indispensable cotejar el expediente administrativo completo.',
            explicacionAlternativa: flag.explicacionAlternativa || 'En publicidad en medios concretos puede invocarse exclusividad (solo el titular del medio puede insertar en él), siempre que el expediente lo acredite.',
            requiereRevisionHumana: true,
            evidence: [
              flag.hecho ? `Hecho: ${flag.hecho}` : null,
              flag.norma ? `Norma: ${flag.norma}` : null,
              flag.queComprobar ? `Qué comprobar: ${flag.queComprobar}` : null,
              flag.senalesVerificables && flag.senalesVerificables.length > 0
                ? `Señales verificables detectadas:\n• ${flag.senalesVerificables.join('\n• ')}`
                : null,
              flag.cierre ? `Aviso de neutralidad: ${flag.cierre}` : null,
            ].filter(Boolean).join('\n\n'),
            factores: flag.senalesVerificables && flag.senalesVerificables.length > 0
              ? flag.senalesVerificables.map((s) => ({
                  label: s,
                  scoreContribution: Math.round(100 / flag.senalesVerificables!.length),
                }))
              : [{ label: 'Tramitación por procedimiento negociado sin publicidad', scoreContribution: 100 }],
            explicacionesAlternativas: flag.explicacionAlternativa ? [flag.explicacionAlternativa] : [],
            documentosInvestigacion: [
              'Memoria justificativa del procedimiento y acreditación del supuesto legal (art. 168 LCSP).',
              'Invitaciones cursadas a empresarios y ofertas recibidas (art. 170.2 LCSP).',
              'Pliegos de cláusulas administrativas y prescripciones técnicas.',
            ],
          });
        }
      }
    }
  }

  const hasActiveSignals =
    displayAlertas.length > 0 ||
    (redFlags && redFlags.some(rf => rf.level === 'alerta' || rf.level === 'aviso'));

  if (!hasActiveSignals) {
    return (
      <div className="mint-card p-5 sm:p-6 bg-[#ecfdf5]/40 border-[#d1fae5] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-[#ecfdf5] border border-[#a7f3d0] text-[#0d9373] shrink-0 mt-0.5">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <span>Sin señales analíticas de riesgo identificadas</span>
              <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]">
                Parámetros habituales en los datos disponibles
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              No se han activado las reglas: Procedimiento negociado sin publicidad (art. 168 LCSP), Oferta única en concurso competitivo, Baja desproporcionada sobre PBL (art. 149 LCSP), ni Acumulación sobre umbral analítico de contratos menores (art. 118 LCSP).
            </p>
          </div>
        </div>

        <Link
          href="/metodologia"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0d9373] hover:text-[#00b48a] bg-white border border-[#d1fae5] px-3.5 py-2 rounded-lg transition-colors shrink-0 shadow-2xs self-start sm:self-auto"
        >
          <span>Ver Metodología</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  const numAltas = displayAlertas.filter(a => a.severity === 'ALTA').length;
  const numMedias = displayAlertas.filter(a => a.severity === 'MEDIA').length;
  const numInfo = displayAlertas.filter(a => a.severity === 'INFORMATIVA').length;

  return (
    <div className="mint-card p-5 sm:p-6 space-y-4 border-l-4 border-l-[#ea580c] bg-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e2e8f0] pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#fff7ed] border border-[#ffedd5] text-[#ea580c]">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base text-[#1e293b] flex items-center gap-2">
              <span>Señales Analíticas de Riesgo ({displayAlertas.length})</span>
            </h3>
            <div className="flex items-center gap-2 text-[11px] font-mono mt-0.5">
              {numAltas > 0 && <span className="text-red-700 font-bold">{numAltas} prioridad alta</span>}
              {numMedias > 0 && <span className="text-amber-700 font-bold">{numMedias} prioridad media</span>}
              {numInfo > 0 && <span className="text-blue-700 font-bold">{numInfo} informativas</span>}
            </div>
          </div>
        </div>

        <Link
          href="/metodologia"
          className="text-xs font-semibold text-[#0d9373] hover:underline inline-flex items-center gap-1 self-start sm:self-auto"
        >
          <span>Metodología y Criterios Analíticos</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Lista de alertas */}
      <div className="space-y-3">
        {displayAlertas.map((alerta) => {
          const isAlta = alerta.severity === 'ALTA';
          const isMedia = alerta.severity === 'MEDIA';
          const isJustificada = Boolean(alerta.justificada);
          const isExpanded = !!expandedEvidencia[alerta.id];

          return (
            <div 
              key={alerta.id}
              className={`p-4 rounded-xl border space-y-3 transition-all ${
                isJustificada
                  ? 'bg-[#ecfdf5]/80 border-[#a7f3d0]'
                  : isAlta 
                  ? 'bg-[#fef2f2]/60 border-[#fecaca]' 
                  : isMedia 
                  ? 'bg-[#fffbeb]/60 border-[#fde68a]' 
                  : 'bg-[#eff6ff]/60 border-[#bfdbfe]'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isJustificada ? (
                      <span className="text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-full bg-emerald-200 text-emerald-900 border border-emerald-300 flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3 text-emerald-700" />
                        🟢 Baja Justificada (Art. 149.4 LCSP)
                      </span>
                    ) : (
                      <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full ${
                        isAlta
                          ? 'bg-red-200 text-red-900 border border-red-300'
                          : isMedia
                          ? 'bg-amber-200 text-amber-900 border border-amber-300'
                          : 'bg-blue-200 text-blue-900 border border-blue-300'
                      }`}>
                        Prioridad {alerta.severity}
                      </span>
                    )}
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-white/90 text-slate-800 border border-slate-200">
                      Escala: {alerta.scoreEscala ? alerta.scoreEscala.toFixed(1) : (isAlta ? '6.5' : isMedia ? '4.0' : '2.0')} / 10
                    </span>
                    {alerta.patronContinuidad === 'recurrente_anual' && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                        🟢 Recurrente Periódico
                      </span>
                    )}
                    {alerta.patronContinuidad === 'patron_concentracion' && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                        🟠 Patrón en Revisión
                      </span>
                    )}
                    {alerta.patronContinuidad === 'recurrente_menores' && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        🟡 Recurrente Menores
                      </span>
                    )}
                    {alerta.patronContinuidad === 'posible_fraccionamiento' && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                        🔴 Acumulación Relevante (Art. 118 LCSP)
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-slate-500">
                      ID: {alerta.id}
                    </span>
                    <span className="text-[10px] font-mono font-semibold text-slate-600 bg-white/80 px-2 py-0.5 rounded border border-[#e2e8f0]">
                      {alerta.category ? (
                        alerta.category === 'A' ? 'Cat. A: Dato localizado' :
                        alerta.category === 'B' ? 'Cat. B: Info no localizada' :
                        alerta.category === 'C' ? 'Cat. C: Indicador analítico' :
                        'Cat. D: Requiere examinar expediente'
                      ) : (
                        alerta.tipo === 'OFERTA_UNICA' 
                        ? 'Cat. A: Dato localizado' 
                        : alerta.tipo === 'BAJA_ACUSADA' 
                        ? 'Cat. C: Indicador analítico' 
                        : 'Cat. D: Requiere examinar expediente'
                      )} · Fuente: {alerta.source || 'PLACSP'}
                    </span>
                  </div>

                  <h4 className="font-bold text-sm text-[#1e293b]">
                    {alerta.title}
                  </h4>
                </div>
              </div>

              {alerta.tipo === 'NEGOCIADO_SIN_PUBLICIDAD' ? (
                <div className="space-y-2 text-xs text-slate-700 leading-relaxed bg-white/60 p-3 rounded-lg border border-slate-200/80">
                  <div>
                    <span className="font-bold text-slate-900">Hecho: </span>
                    <span>Según PLACSP, el contrato se tramitó como negociado sin publicidad, sin anuncio previo de licitación.</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-900">Norma: </span>
                    <span>
                      El <a href="https://www.boe.es/buscar/act.php?id=BOE-A-2017-12902#a168" target="_blank" rel="noopener noreferrer" className="text-[#0d9373] underline font-semibold">art. 168 LCSP</a> limita este procedimiento a supuestos tasados y el <a href="https://www.boe.es/buscar/act.php?id=BOE-A-2017-12902#a170" target="_blank" rel="noopener noreferrer" className="text-[#0d9373] underline font-semibold">art. 170.2 LCSP</a> prevé, como regla general, invitar al menos a tres empresarios.
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-900">Qué comprobar: </span>
                    <span>Consultar en el expediente el supuesto invocado y las invitaciones enviadas.</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-900">Explicación alternativa: </span>
                    <span>En publicidad en medios concretos puede invocarse exclusividad (solo el titular del medio puede insertar en él), siempre que el expediente lo acredite.</span>
                  </div>
                  <div className="pt-1 text-slate-600 italic border-t border-slate-200/60 mt-1">
                    <span className="font-bold not-italic text-slate-700">Aviso de neutralidad: </span>
                    <span>Esta señal no implica por sí misma irregularidad.</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-700 leading-relaxed">
                  {alerta.description}
                </p>
              )}

              {/* Desglose Pedagógico y Comparativo para Acumulación de Contratos Menores */}
              {alerta.tipo === 'CONTRATOS_RELACIONADOS' && alerta.contratosDetalle && alerta.contratosDetalle.length > 1 && (
                <RelacionadosPedagogicoCard alerta={alerta} currentContractId={currentContractId} />
              )}

              {/* Banner de documento oficial de justificación técnica si existe */}
              {alerta.documentoJustificacionUrl && (
                <div className="p-3 bg-white/95 rounded-lg border border-emerald-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-emerald-950 block">
                        {alerta.documentoJustificacionTitulo || 'Informe sobre las ofertas incursas en presunción de anormalidad'}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Documento oficial de justificación técnica adjunto en PLACSP {alerta.documentoJustificacionFecha ? `(${alerta.documentoJustificacionFecha})` : ''}
                      </span>
                    </div>
                  </div>
                  <a
                    href={alerta.documentoJustificacionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0d9373] text-white hover:bg-[#00b48a] text-xs font-semibold shrink-0 transition-colors shadow-2xs"
                  >
                    <span>Descargar Documento</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}

              {/* Factores determinantes */}
              {alerta.factores && alerta.factores.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase text-slate-500 tracking-wider">
                      {alerta.tipo === 'NEGOCIADO_SIN_PUBLICIDAD' ? 'Señales concurrentes analizadas:' : 'Factores algorítmicos analizados:'}
                    </span>
                    {alerta.tipo === 'BAJA_ACUSADA' && alerta.scoreEscala && (
                      <span className="text-[10px] font-mono text-slate-500">
                        Ponderación normalizada: {alerta.scoreEscala.toFixed(1)} / 10
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {alerta.factores.map((f, i) => (
                      <span 
                        key={i} 
                        className="text-[11px] font-medium bg-white px-2.5 py-1 rounded-md border border-slate-200 text-slate-700 shadow-2xs inline-flex items-center gap-1"
                      >
                        <Scale className="h-3 w-3 text-slate-400" />
                        {f.label}
                        {alerta.tipo !== 'NEGOCIADO_SIN_PUBLICIDAD' && (
                          <strong className="text-slate-900 ml-0.5">+{f.scoreContribution}% peso</strong>
                        )}
                      </span>
                    ))}
                  </div>
                  {alerta.tipo === 'BAJA_ACUSADA' && (
                    <div className="text-[11px] text-slate-600 bg-[#f8fafb] border border-[#e2e8f0] rounded-lg p-2.5 space-y-1.5 mt-1 leading-relaxed">
                      <div className="font-semibold text-slate-800 flex items-center justify-between">
                        <span className="flex items-center gap-1 text-[#0d9373]">
                          <Scale className="h-3.5 w-3.5" />
                          Normalización analítica del score ({alerta.scoreEscala ? alerta.scoreEscala.toFixed(1) : '6.7'}/10):
                        </span>
                        <span className="font-mono text-[10px] text-slate-500">Art. 149 LCSP</span>
                      </div>
                      <p className="text-slate-600">
                        Los pesos de los factores analíticos ({alerta.factores.map(f => `+${f.scoreContribution}%`).join(' + ')} = suma de intensidad) se proyectan en la escala de severidad [1 - 10] según la fórmula normalizada: <code className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-800">Base 5.5 + ((Δbaja - 40) / 20) × 2.5 = {alerta.scoreEscala ? alerta.scoreEscala.toFixed(1) : '6.7'}/10</code> (Prioridad {alerta.severity}).
                      </p>
                      <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-200">
                        <strong>Garantía de concurrencia y contexto:</strong> La existencia de ofertas concurrentes descarta la ausencia de competencia. Este indicador no califica la oferta como anormal ni presupone irregularidad; constituye una señal preventiva para verificar los parámetros del pliego y, en su caso, la justificación de viabilidad económica conforme al art. 149 LCSP.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Evidencia Toggle */}
              <div className="pt-2 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => toggleEvidencia(alerta.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  <span>{isExpanded ? 'Ocultar evidencia y análisis de contexto' : 'Ver evidencia y explicaciones alternativas'}</span>
                </button>

                <div className="flex items-center gap-3 flex-wrap">
                  <Link
                    href={`/auditoria?alertaId=${encodeURIComponent(alerta.id)}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2563eb] hover:underline"
                  >
                    <span>Ver señal analítica</span>
                    <ChevronRight className="h-3 w-3" />
                  </Link>

                  {(placspUrl || (alerta.urlFuente && alerta.urlFuente.startsWith('http'))) ? (
                    <a
                      href={placspUrl || alerta.urlFuente}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0d9373] hover:underline"
                    >
                      <span>Expediente en PLACSP</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-[11px] text-slate-500 italic">
                      Enlace oficial no disponible en los datos consultados
                    </span>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="space-y-3 pt-2">
                  <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-600 font-mono space-y-1.5">
                    <div className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                      1. Evidencia registrada:
                    </div>
                    <div className="leading-relaxed whitespace-pre-wrap">
                      {alerta.evidence}
                    </div>
                  </div>

                  {alerta.explicacionesAlternativas && alerta.explicacionesAlternativas.length > 0 && (
                    <div className="p-3 bg-blue-50/70 rounded-lg border border-blue-200 text-xs space-y-1.5">
                      <div className="font-bold text-blue-900 text-[11px] uppercase tracking-wider">
                        2. Posibles explicaciones alternativas (Hipótesis legítimas):
                      </div>
                      <ul className="space-y-1 list-disc list-inside text-blue-950/80 leading-relaxed text-[11px]">
                        {alerta.explicacionesAlternativas.map((exp, i) => (
                          <li key={i}>{exp}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {alerta.documentosInvestigacion && alerta.documentosInvestigacion.length > 0 && (
                    <div className="p-3 bg-emerald-50/70 rounded-lg border border-emerald-200 text-xs space-y-1.5">
                      <div className="font-bold text-emerald-900 text-[11px] uppercase tracking-wider">
                        3. Documentación y cotejo en PLACSP:
                      </div>
                      <ul className="space-y-1.5 list-disc list-inside text-emerald-950/80 leading-relaxed text-[11px]">
                        {alerta.documentosInvestigacion.map((doc, i) => {
                          if (doc.includes(': http')) {
                            const [label, ...urlParts] = doc.split(': http');
                            const url = 'http' + urlParts.join(': http');
                            return (
                              <li key={i} className="list-none flex items-center gap-1.5 font-medium">
                                <span>•</span>
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-semibold text-[#0d9373] hover:underline inline-flex items-center gap-1"
                                >
                                  <span>{label}</span>
                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                </a>
                              </li>
                            );
                          }
                          return <li key={i}>{doc}</li>;
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legal disclaimer */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
        <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
        <span>
          <strong>Principio de neutralidad y límites de los datos:</strong> Las alertas son señales analíticas de priorización investigadora basadas en los datos públicos de PLACSP. No constituyen declaraciones de ilegalidad, fraude, nulidad ni resolución jurídica alguna. Es indispensable cotejar el expediente administrativo completo.
        </span>
      </div>
    </div>
  );
}

function RelacionadosPedagogicoCard({
  alerta,
  currentContractId,
}: {
  alerta: AlertaV2;
  currentContractId?: string;
}) {
  const contratos = alerta.contratosDetalle || [];
  if (contratos.length <= 1) return null;

  // 1. Determine legal threshold (obras = 40.000 €, services/supplies = 15.000 €)
  const isObras = contratos.some(
    (c) =>
      (c.procedimiento && c.procedimiento.toLowerCase().includes('obra')) ||
      (c.objeto && c.objeto.toLowerCase().includes('obra'))
  );
  const umbral = isObras ? 40000 : 15000;

  // 2. Identify current contract in the cluster
  const currentContract = contratos.find(
    (c) =>
      currentContractId &&
      (c.id === currentContractId ||
        c.id.endsWith(currentContractId) ||
        currentContractId.endsWith(c.id) ||
        (c.id.split('/').pop() && currentContractId.endsWith(c.id.split('/').pop()!)))
  );
  const currentAmount = currentContract?.importe ?? null;

  // 3. Accumulation metrics
  const totalAcumulado =
    alerta.relacionadosInfo?.importeAcumulado ||
    contratos.reduce((acc, c) => acc + Number(c.importe || 0), 0);
  const excesoEuros = Math.max(0, totalAcumulado - umbral);
  const excesoPct =
    umbral > 0
      ? Math.round(((totalAcumulado - umbral) / umbral) * 1000) / 10
      : 0;

  // 4. Same-day awards detection
  const dateMap = new Map<string, AlertaContratoDetalle[]>();
  for (const c of contratos) {
    if (!c.document_date) continue;
    const arr = dateMap.get(c.document_date) || [];
    arr.push(c);
    dateMap.set(c.document_date, arr);
  }
  const sameDayGroups: { date: string; count: number; sum: number; expedientes: string[] }[] = [];
  for (const [date, list] of dateMap.entries()) {
    if (list.length >= 2) {
      const sum = list.reduce((acc, c) => acc + Number(c.importe || 0), 0);
      sameDayGroups.push({
        date,
        count: list.length,
        sum,
        expedientes: list.map((c) => c.expediente),
      });
    }
  }

  const adjudicatarioName = contratos[0]?.adjudicatario || 'el adjudicatario';

  return (
    <div className="space-y-4 pt-2">
      {/* Explicación pedagógica en lenguaje directo */}
      <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/90 space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-amber-950">
          <HelpCircle className="h-4 w-4 text-amber-700 shrink-0" />
          <span>
            {currentAmount !== null && Number(currentAmount) < umbral
              ? `¿Por qué salta esta alerta si este contrato es de solo ${formatCurrency(Number(currentAmount))}?`
              : '¿Por qué salta esta señal analítica de contratos menores?'}
          </span>
        </div>
        <p className="text-xs text-amber-900/90 leading-relaxed">
          El art. 118.2 LCSP exige que el órgano de contratación justifique que no se está alterando el objeto del contrato para eludir los umbrales, y el art. 99.2 prohíbe fraccionar el objeto para evitar la publicidad y el procedimiento. La suma de contratos por proveedor que se muestra aquí es un umbral analítico propio de LicitAlcázar para priorizar la revisión; no es un límite legal.
        </p>
        <p className="text-xs text-amber-900/90 leading-relaxed">
          En este caso, <strong>{adjudicatarioName}</strong> acumula <strong>{contratos.length} contratos menores</strong> en el periodo analizado sumando <strong>{formatCurrency(totalAcumulado)}</strong>
          {excesoEuros > 0 ? (
            <> (un <strong>+{excesoPct}%</strong> sobre el umbral analítico de referencia, con un exceso acumulado de {formatCurrency(excesoEuros)}).</>
          ) : (
            <>.</>
          )}
        </p>
        <div className="pt-1 text-[11px] text-amber-950/80 font-medium italic border-t border-amber-200/60">
          Este resultado es una señal analítica preventiva y no acredita por sí mismo un fraccionamiento indebido. Para valorar esa cuestión debe examinarse la unidad funcional, la previsibilidad de la necesidad y el contenido de los expedientes.
        </div>
      </div>

      {/* Callout destacado de coincidencias temporales el mismo día si existen */}
      {sameDayGroups.map((group, idx) => (
        <div
          key={idx}
          className="p-3 rounded-xl bg-red-50/70 border border-red-200 text-xs text-red-950 flex items-start gap-2.5 shadow-2xs"
        >
          <Zap className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-red-900 block">
              Coincidencia temporal significativa ({formatDate(group.date)}):
            </span>
            <span className="leading-relaxed block text-red-900/90">
              Se adjudicaron <strong>{group.count} contratos menores en la misma fecha</strong> ({group.expedientes.join(', ')}) con un importe acumulado de <strong>{formatCurrency(group.sum)}</strong>, adjudicados directamente conforme al art. 118 LCSP.
            </span>
          </div>
        </div>
      ))}

      {/* Visualización de Umbral vs Acumulado */}
      <div className="p-4 bg-gradient-to-b from-white to-slate-50/50 rounded-2xl border border-slate-200/90 space-y-4 shadow-xs">
        {/* 3 Tarjetas métricas estilizadas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                Umbral analítico de referencia
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                cifra tomada del art. 118.1
              </span>
            </div>
            <div className="text-lg font-extrabold font-mono text-slate-800">
              {formatCurrency(umbral)}
            </div>
            <p className="text-[11px] text-slate-500 leading-tight">
              Cifra de referencia ({isObras ? 'obras' : 'servicios'})
            </p>
          </div>

          <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                Total acumulado
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                {contratos.length} contratos
              </span>
            </div>
            <div className="text-lg font-extrabold font-mono text-slate-900">
              {formatCurrency(totalAcumulado)}
            </div>
            <p className="text-[11px] text-slate-500 leading-tight">
              Suma adjudicada en el periodo
            </p>
          </div>

          <div className={`p-3 rounded-xl shadow-2xs space-y-1 border ${
            totalAcumulado > umbral 
              ? 'bg-rose-50/50 border-rose-200' 
              : 'bg-emerald-50/50 border-emerald-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-mono uppercase tracking-wider font-bold ${
                totalAcumulado > umbral ? 'text-rose-700' : 'text-emerald-700'
              }`}>
                {totalAcumulado > umbral ? 'Exceso sobre umbral analítico' : 'Margen disponible'}
              </span>
              {totalAcumulado > umbral && (
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-rose-200/80 text-rose-900 border border-rose-300">
                  +{excesoPct}%
                </span>
              )}
            </div>
            <div className={`text-lg font-extrabold font-mono ${
              totalAcumulado > umbral ? 'text-rose-700' : 'text-emerald-700'
            }`}>
              {totalAcumulado > umbral ? `+${formatCurrency(excesoEuros)}` : formatCurrency(umbral - totalAcumulado)}
            </div>
            <p className={`text-[11px] leading-tight ${
              totalAcumulado > umbral ? 'text-rose-600/90 font-medium' : 'text-emerald-600/90'
            }`}>
              {totalAcumulado > umbral ? 'Supera el umbral analítico de referencia' : 'Dentro del margen ordinario'}
            </p>
          </div>
        </div>

        {/* Medidor segmentado elegante con pin de posición */}
        {totalAcumulado > umbral ? (
          <div className="pt-2 pb-1 space-y-3">
            <div className="relative pt-6">
              {/* Marcador superior alineado con el umbral legal */}
              <div 
                className="absolute top-0 -translate-x-1/2 flex flex-col items-center pointer-events-none z-10"
                style={{ left: `${Math.round((umbral / totalAcumulado) * 1000) / 10}%` }}
              >
                <span className="text-[10px] font-mono font-bold bg-slate-900 text-white px-2 py-0.5 rounded-md shadow-xs whitespace-nowrap">
                  Umbral: {formatCurrency(umbral)}
                </span>
                <div className="w-0.5 h-1.5 bg-slate-900" />
              </div>

              {/* Barra redondeada elegante */}
              <div className="h-4 w-full flex rounded-full overflow-hidden bg-slate-100 p-0.5 ring-1 ring-slate-200/90 shadow-inner">
                {/* Tramo dentro del umbral analítico */}
                <div
                  className="h-full rounded-l-full bg-gradient-to-r from-slate-800 to-slate-700 transition-all"
                  style={{ width: `${Math.round((umbral / totalAcumulado) * 1000) / 10}%` }}
                />
                {/* Divisor blanco */}
                <div className="w-0.5 bg-white h-full shrink-0" />
                {/* Tramo de exceso */}
                <div
                  className="h-full rounded-r-full bg-gradient-to-r from-rose-500 to-red-600 transition-all"
                  style={{ width: `${Math.round((excesoEuros / totalAcumulado) * 1000) / 10}%` }}
                />
              </div>
            </div>

            {/* Leyenda limpia y equilibrada */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs font-mono gap-2 pt-1 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-800 shrink-0" />
                <span className="text-slate-700 font-medium">
                  Umbral analítico de referencia ({formatCurrency(umbral)})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                <span className="text-rose-700 font-bold">
                  Sobrepasado (+{formatCurrency(excesoEuros)} · +{excesoPct}%)
                </span>
              </div>
              <div className="text-slate-900 font-bold text-right sm:text-left">
                Total: {formatCurrency(totalAcumulado)}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 pt-1">
            <div className="h-3.5 w-full bg-slate-100 rounded-full overflow-hidden ring-1 ring-slate-200">
              <div
                className="h-full bg-emerald-600 rounded-full transition-all"
                style={{ width: `${Math.round((totalAcumulado / umbral) * 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
              <span>0 €</span>
              <span>Umbral analítico de referencia: {formatCurrency(umbral)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Tabla comparativa de los contratos del clúster */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-slate-500" />
            <span>Desglose de contratos acumulados ({contratos.length}):</span>
          </span>
          <span className="text-[11px] font-mono text-slate-500">
            Suma total: <strong>{formatCurrency(totalAcumulado)}</strong>
          </span>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-[11px] font-semibold border-b border-slate-200">
                  <th className="py-2 px-3">Expediente</th>
                  <th className="py-2 px-3">Fecha</th>
                  <th className="py-2 px-3">Objeto de la prestación</th>
                  <th className="py-2 px-3 text-right">Importe</th>
                  <th className="py-2 px-3 text-center">Ficha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contratos.map((c) => {
                  const slug = c.id.split('/').pop() || c.id;
                  const isCurrent = Boolean(
                    currentContractId &&
                    (c.id === currentContractId ||
                      c.id.endsWith(currentContractId) ||
                      currentContractId.endsWith(c.id) ||
                      (slug && currentContractId.endsWith(slug)))
                  );
                  const isNearThreshold = Number(c.importe || 0) >= umbral * 0.95;

                  return (
                    <tr
                      key={c.id}
                      className={`transition-colors ${
                        isCurrent
                          ? 'bg-emerald-50/80 font-medium'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{c.expediente}</span>
                          {isCurrent && (
                            <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-emerald-200 text-emerald-900 border border-emerald-300">
                              Este contrato
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                        {formatDate(c.document_date)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 max-w-xs sm:max-w-md truncate" title={c.objeto}>
                        {c.objeto}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-right font-mono font-bold text-slate-900">
                        <div className="flex items-center justify-end gap-1.5">
                          <span>{formatCurrency(Number(c.importe))}</span>
                          {isNearThreshold && (
                            <span className="text-[9px] font-sans font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-200" title="Contrato muy próximo al límite legal de 15.000 €">
                              Tope legal
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-center">
                        {isCurrent ? (
                          <span className="text-[11px] text-emerald-700 font-semibold italic">Actual</span>
                        ) : (
                          <Link
                            href={`/licitaciones/${slug}`}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0d9373] hover:underline"
                          >
                            <span>Ver</span>
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Nota técnica y equilibrio jurídico */}
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1 leading-relaxed">
        <div className="font-bold text-slate-700 flex items-center gap-1">
          <Info className="h-3.5 w-3.5 text-slate-400" />
          <span>Equilibrio jurídico y criterios de doctrina administrativa (TACRC):</span>
        </div>
        <p>
          Esta señal identifica una acumulación cuantitativa objetiva. Para constatar si concurre fraccionamiento indebido (art. 99.2 LCSP) o contrataciones legítimamente separadas debe verificarse si existía unidad funcional e indisociable entre los encargos, o si por el contrario correspondían a bienes patrimoniales independientes con necesidades sobrevenidas no previsibles conjuntamente, lo cual debe constar motivado en el informe de necesidad del expediente (art. 118.2 LCSP).
        </p>
      </div>
    </div>
  );
}
