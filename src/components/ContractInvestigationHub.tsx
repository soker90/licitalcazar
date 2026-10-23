'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getPlacspId } from '@/lib/placsp';
import { formatCurrency, formatDate } from '@/lib/format';
import { 
  Briefcase, 
  Tag, 
  Building2, 
  Coins, 
  FileText
} from 'lucide-react';

interface ContractItemSimple {
  id: string;
  expediente?: string;
  objeto: string;
  contracting_authority_name?: string;
  adjudicatario?: string;
  importe_adjudicacion?: number;
  award_amount_type?: 'total' | 'unitario' | 'desconocido' | null;
  estado?: string;
  fecha_adjudicacion?: string;
  fecha_publicacion?: string;
  year?: number;
  num_ofertas?: number | null;
  cpv_principal?: string | null;
}

interface LoteAdjudicatarioInfo {
  adjudicatario: string;
  nifAdjudicatario: string | null;
  empresaId: string;
  numeroLote: string | null;
  nombreLote: string | null;
  relacionadas: ContractItemSimple[];
  stats: { totalContratos: number; volumenTotal: number } | null;
}

interface ContractInvestigationHubProps {
  currentId: string;
  adjudicatario: string | null;
  empresaId?: string;
  organo: string;
  cpvPrincipal: string | null;
  relacionadasOrgano: ContractItemSimple[];
  relacionadasEmpresa: ContractItemSimple[];
  statsEmpresa: { totalContratos: number; volumenTotal: number } | null;
  relacionadasCpv: ContractItemSimple[];
  lotesAdjudicatariosInfo?: LoteAdjudicatarioInfo[] | null;
}

export default function ContractInvestigationHub({
  adjudicatario,
  empresaId,
  organo,
  cpvPrincipal,
  relacionadasOrgano,
  relacionadasEmpresa,
  statsEmpresa,
  relacionadasCpv,
  lotesAdjudicatariosInfo,
}: ContractInvestigationHubProps) {
  const isMultiWinner = !!(lotesAdjudicatariosInfo && lotesAdjudicatariosInfo.length > 0);
  const empresaTabCount = isMultiWinner
    ? lotesAdjudicatariosInfo!.reduce((sum, e) => sum + e.relacionadas.length, 0)
    : relacionadasEmpresa.length;

  const [activeTab, setActiveTab] = useState<'empresa' | 'cpv' | 'organo'>(
    (adjudicatario || isMultiWinner) ? 'empresa' : relacionadasCpv.length > 0 ? 'cpv' : 'organo'
  );

  return (
    <div className="mint-card p-6 sm:p-7 space-y-6">
      <div className="border-b border-[#e2e8f0] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
              <FileText className="h-4 w-4" />
            </span>
            <h3 className="font-bold text-base text-[#1e293b] tracking-tight">
              Investigación y Expedientes Relacionados
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Trazabilidad cruzada por contratista, sector CPV y organismo para analizar y contextualizar precios y concurrencia.
          </p>
        </div>

        {/* Tabs de navegación */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-lg border border-slate-200/70 text-xs">
          {(adjudicatario || isMultiWinner) && (
            <button
              type="button"
              onClick={() => setActiveTab('empresa')}
              className={`px-3 py-1 rounded-md font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'empresa'
                  ? 'bg-white text-[#0d9373] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Briefcase className="h-3.5 w-3.5" />
              <span>{isMultiWinner ? 'Por Empresa' : 'Misma Empresa'}</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700 font-bold">
                {empresaTabCount}
              </span>
            </button>
          )}

          {cpvPrincipal && (
            <button
              type="button"
              onClick={() => setActiveTab('cpv')}
              className={`px-3 py-1 rounded-md font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'cpv'
                  ? 'bg-white text-[#2563eb] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Tag className="h-3.5 w-3.5" />
              <span>Mismo CPV</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700 font-bold">
                {relacionadasCpv.length}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('organo')}
            className={`px-3 py-1 rounded-md font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'organo'
                ? 'bg-white text-[#0891b2] shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>Organismo</span>
            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700 font-bold">
              {relacionadasOrgano.length}
            </span>
          </button>
        </div>
      </div>

      {/* Pestaña 1: Misma Empresa (single-winner) / Por Empresa (multi-winner) */}
      {activeTab === 'empresa' && (adjudicatario || isMultiWinner) && (
        <div className="space-y-4">
          {/* Multi-winner: one card per lot adjudicatario */}
          {isMultiWinner ? (
            <div className="space-y-5">
              {lotesAdjudicatariosInfo!.map((entry) => (
                <div key={entry.empresaId} className="rounded-xl border border-[#e2e8f0] overflow-hidden">
                  {/* Per-winner header banner */}
                  <div className="p-3.5 bg-[#f0fdf4] border-b border-[#bbf7d0] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#166534]">
                    <div className="flex items-center gap-2">
                      <Coins className="h-4 w-4 text-[#16a34a] shrink-0" />
                      <span>
                        {entry.numeroLote && (
                          <span className="font-mono text-[10px] bg-[#dcfce7] px-1.5 py-0.5 rounded mr-1.5 text-[#15803d] font-bold">
                            Lote {entry.numeroLote}
                          </span>
                        )}
                        <strong>{entry.adjudicatario}</strong>
                        {entry.stats && (
                          <> · <strong>{entry.stats.totalContratos} contratos</strong> en registros municipales</>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 self-start sm:self-auto">
                      {entry.stats && (
                        <span className="font-mono font-bold text-sm text-[#14532d]">
                          {formatCurrency(entry.stats.volumenTotal)}
                        </span>
                      )}
                      <Link
                        href={`/empresas/${encodeURIComponent(entry.empresaId)}`}
                        className="px-2.5 py-1 rounded-lg bg-white border border-[#86efac] text-[#15803d] hover:bg-[#dcfce7] font-semibold text-[11px] transition-colors whitespace-nowrap"
                      >
                        Ver Ficha →
                      </Link>
                    </div>
                  </div>
                  {/* Per-winner related contracts */}
                  {entry.relacionadas.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-3 text-center bg-white">
                      Sin otros contratos registrados para esta empresa.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3 bg-white">
                      {entry.relacionadas.map((item) => (
                        <Link
                          key={item.id}
                          href={`/licitaciones/${encodeURIComponent(getPlacspId(item.id) || item.id)}`}
                          className="p-4 rounded-xl border border-[#e2e8f0] bg-[#f8fafb] hover:bg-white hover:border-[#0d9373] hover:shadow-xs transition-all space-y-2 block group"
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-mono text-slate-400 font-semibold truncate max-w-[140px]">
                              {item.expediente || 'Sin exp.'}
                            </span>
                            <span className="font-bold font-mono text-[#0a0a0a]">
                              {item.award_amount_type === 'unitario' || item.award_amount_type === 'desconocido'
                                ? 'Importe no comparable'
                                : formatCurrency(item.importe_adjudicacion)}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-700 line-clamp-2 group-hover:text-[#0d9373] transition-colors leading-snug">
                            {item.objeto}
                          </p>
                          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-[#f1f5f7] font-mono">
                            <span className="truncate max-w-[150px]">{item.contracting_authority_name}</span>
                            <span>{item.year || formatDate(item.fecha_adjudicacion)}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* Single-winner: existing flat list */
            <>
              {statsEmpresa && (
                <div className="p-3.5 rounded-xl bg-[#f0fdf4] border border-[#bbf7d0] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#166534]">
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-[#16a34a] shrink-0" />
                    <span>
                      <strong>{adjudicatario}</strong> acumula <strong>{statsEmpresa.totalContratos} contratos</strong> en los registros de Alcázar de San Juan.
                    </span>
                  </div>
                  <div className="flex items-center gap-3 self-start sm:self-auto">
                    <span className="font-mono font-bold text-sm text-[#14532d]">
                      {formatCurrency(statsEmpresa.volumenTotal)}
                    </span>
                    <Link
                      href={`/empresas/${encodeURIComponent(empresaId || adjudicatario || '')}`}
                      className="px-2.5 py-1 rounded-lg bg-white border border-[#86efac] text-[#15803d] hover:bg-[#dcfce7] font-semibold text-[11px] transition-colors"
                    >
                      Ver Ficha de Empresa →
                    </Link>
                  </div>
                </div>
              )}

              {relacionadasEmpresa.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-4 text-center">
                  No constan otros contratos adjudicados a esta empresa en la base de datos municipal.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {relacionadasEmpresa.map((item) => (
                    <Link
                      key={item.id}
                      href={`/licitaciones/${encodeURIComponent(getPlacspId(item.id) || item.id)}`}
                      className="p-4 rounded-xl border border-[#e2e8f0] bg-[#f8fafb] hover:bg-white hover:border-[#0d9373] hover:shadow-xs transition-all space-y-2 block group"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono text-slate-400 font-semibold truncate max-w-[140px]">
                          {item.expediente || 'Sin exp.'}
                        </span>
                        <span className="font-bold font-mono text-[#0a0a0a]">
                          {item.award_amount_type === 'unitario' || item.award_amount_type === 'desconocido'
                                ? 'Importe no comparable'
                                : formatCurrency(item.importe_adjudicacion)}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-700 line-clamp-2 group-hover:text-[#0d9373] transition-colors leading-snug">
                        {item.objeto}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-[#f1f5f7] font-mono">
                        <span className="truncate max-w-[150px]">{item.contracting_authority_name}</span>
                        <span>{item.year || formatDate(item.fecha_adjudicacion)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Pestaña 2: Mismo Sector / CPV */}
      {activeTab === 'cpv' && cpvPrincipal && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-[#eff6ff] border border-[#bfdbfe] text-xs text-[#1e40af] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-[#2563eb] shrink-0" />
              <span>
                Comparativa de contrataciones en la misma familia de actividad: Código CPV <strong>{cpvPrincipal.slice(0, 4)}*</strong>.
              </span>
            </div>
          </div>

          {relacionadasCpv.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-4 text-center">
              No constan otros contratos con el mismo código CPV registrado.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {relacionadasCpv.map((item) => (
                <Link
                  key={item.id}
                  href={`/licitaciones/${encodeURIComponent(getPlacspId(item.id) || item.id)}`}
                  className="p-4 rounded-xl border border-[#e2e8f0] bg-[#f8fafb] hover:bg-white hover:border-[#2563eb] hover:shadow-xs transition-all space-y-2 block group"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-slate-400 font-semibold truncate max-w-[140px]">
                      {item.expediente || 'Sin exp.'}
                    </span>
                    <span className="font-bold font-mono text-[#0a0a0a]">
                      {item.award_amount_type === 'unitario' || item.award_amount_type === 'desconocido'
                                ? 'Importe no comparable'
                                : formatCurrency(item.importe_adjudicacion)}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-700 line-clamp-2 group-hover:text-[#2563eb] transition-colors leading-snug">
                    {item.objeto}
                  </p>
                  <div className="pt-1 border-t border-[#f1f5f7] flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-600 font-medium truncate max-w-[140px]">
                      {item.adjudicatario || 'Sin adjudicatario'}
                    </span>
                    {item.num_ofertas !== null && item.num_ofertas !== undefined && (
                      <span className={`px-1.5 py-0.2 rounded ${item.num_ofertas === 1 ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'}`}>
                        {item.num_ofertas} {item.num_ofertas === 1 ? 'oferta' : 'ofertas'}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pestaña 3: Mismo Organismo */}
      {activeTab === 'organo' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-[#ecfeff] border border-[#a5f3fc] text-xs text-[#0e7490] flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#0891b2] shrink-0" />
            <span>
              Otras licitaciones tramitadas por <strong>{organo}</strong>.
            </span>
          </div>

          {relacionadasOrgano.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-4 text-center">
              No constan otras licitaciones recientes para este organismo.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {relacionadasOrgano.map((item) => (
                <Link
                  key={item.id}
                  href={`/licitaciones/${encodeURIComponent(getPlacspId(item.id) || item.id)}`}
                  className="p-4 rounded-xl border border-[#e2e8f0] bg-[#f8fafb] hover:bg-white hover:border-[#0891b2] hover:shadow-xs transition-all space-y-2 block group"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-slate-400 font-semibold truncate max-w-[140px]">
                      {item.expediente || 'Sin exp.'}
                    </span>
                    <span className="font-bold font-mono text-[#0a0a0a]">
                      {item.award_amount_type === 'unitario' || item.award_amount_type === 'desconocido'
                                ? 'Importe no comparable'
                                : formatCurrency(item.importe_adjudicacion)}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-700 line-clamp-2 group-hover:text-[#0891b2] transition-colors leading-snug">
                    {item.objeto}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-[#f1f5f7] font-mono">
                    <span className="text-slate-500 font-medium">{item.estado || 'Tramitación'}</span>
                    <span>{formatDate(item.fecha_publicacion || item.fecha_adjudicacion)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
