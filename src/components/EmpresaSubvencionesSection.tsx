'use client';

import { useState, useMemo } from 'react';
import { 
  Gift, 
  ExternalLink, 
  Search, 
  Building2, 
  Landmark, 
  Globe, 
  ShieldCheck, 
  HelpCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { formatCurrency, formatCompactCurrency, formatDate, formatNumber } from '@/lib/format';
import type { SubvencionesResumen } from '@/lib/db';

interface EmpresaSubvencionesSectionProps {
  subvenciones?: SubvencionesResumen | null;
  nombreEmpresa: string;
}

function isEuFunded(convocatoria?: string | null, instrumento?: string | null): boolean {
  const text = `${convocatoria || ''} ${instrumento || ''}`.toUpperCase();
  return (
    text.includes('PRTR') ||
    text.includes('NEXTGENERATION') ||
    text.includes('NEXT GENERATION') ||
    text.includes('MECANISMO DE RECUPERACIÓN') ||
    text.includes('MECANISMO DE RECUPERACION') ||
    text.includes('RECUPERACIÓN Y RESILIENCIA') ||
    text.includes('RECUPERACION Y RESILIENCIA') ||
    text.includes('MRR') ||
    text.includes('FEDER') ||
    text.includes('FSE') ||
    text.includes('FONDO EUROPEO') ||
    text.includes('FONDOS EUROPEOS') ||
    text.includes('UNIÓN EUROPEA') ||
    text.includes('UNION EUROPEA') ||
    text.includes('KIT DIGITAL')
  );
}

export default function EmpresaSubvencionesSection({
  subvenciones,
  nombreEmpresa,
}: EmpresaSubvencionesSectionProps) {
  const [selectedNivel, setSelectedNivel] = useState<string>('TODOS');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAll, setShowAll] = useState<boolean>(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const items = useMemo(() => subvenciones?.items || [], [subvenciones?.items]);
  const hasSubvenciones = items.length > 0;

  // Clasificación estricta por administración concedente
  const itemsAlcazar = useMemo(
    () => items.filter(it => it.is_alcazar === 1),
    [items]
  );
  const itemsAutonomica = useMemo(
    () => items.filter(it => (it.granting_authority_level_1 || '').toUpperCase() === 'AUTONOMICA'),
    [items]
  );
  const itemsNacionales = useMemo(
    () => items.filter(it => (it.granting_authority_level_1 || '').toUpperCase() === 'ESTADO'),
    [items]
  );
  const itemsOtrasLocales = useMemo(
    () => items.filter(it => (it.granting_authority_level_1 || '').toUpperCase() === 'LOCAL' && !it.is_alcazar),
    [items]
  );
  const itemsOtrosEntes = useMemo(
    () => items.filter(it => {
      const n1 = (it.granting_authority_level_1 || '').toUpperCase();
      return !it.is_alcazar && n1 !== 'AUTONOMICA' && n1 !== 'ESTADO' && n1 !== 'LOCAL';
    }),
    [items]
  );

  // Filtrado reactivo
  const filteredItems = useMemo(() => {
    let result = items;

    if (selectedNivel === 'ALCAZAR') {
      result = itemsAlcazar;
    } else if (selectedNivel === 'AUTONOMICA') {
      result = itemsAutonomica;
    } else if (selectedNivel === 'ESTADO') {
      result = itemsNacionales;
    } else if (selectedNivel === 'OTRAS_LOCALES') {
      result = itemsOtrasLocales;
    } else if (selectedNivel === 'OTROS_ENTES') {
      result = itemsOtrosEntes;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(it => 
        (it.call && it.call.toLowerCase().includes(q)) ||
        (it.granting_authority && it.granting_authority.toLowerCase().includes(q)) ||
        (it.granting_authority_level_2 && it.granting_authority_level_2.toLowerCase().includes(q)) ||
        (it.instrument && it.instrument.toLowerCase().includes(q)) ||
        (it.call_number && it.call_number.includes(q))
      );
    }

    return result;
  }, [items, selectedNivel, searchQuery, itemsAlcazar, itemsAutonomica, itemsNacionales, itemsOtrasLocales, itemsOtrosEntes]);

  // Si no hay subvenciones, no renderizamos absolutamente nada (regla de no mostrar bloques vacíos)
  if (!hasSubvenciones) {
    return null;
  }

  const volumenTotal = subvenciones?.volumenTotal || 0;
  const totalSubvenciones = subvenciones?.total || 0;

  const volAlcazar = itemsAlcazar.reduce((acc, it) => acc + (it.amount || 0), 0);
  const volAutonomica = itemsAutonomica.reduce((acc, it) => acc + (it.amount || 0), 0);
  const volNacionales = itemsNacionales.reduce((acc, it) => acc + (it.amount || 0), 0);
  const volOtrasLocales = itemsOtrasLocales.reduce((acc, it) => acc + (it.amount || 0), 0);
  const volOtrosEntes = itemsOtrosEntes.reduce((acc, it) => acc + (it.amount || 0), 0);

  const visibleItems = showAll ? filteredItems : filteredItems.slice(0, 6);

  return (
    <div id="subvenciones-bdns" className="mint-card p-6 sm:p-7 space-y-6 border-l-4 border-l-[#3b82f6]">
      {/* Cabecera de la Sección */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e2e8f0] pb-4">
        <div>
          <h3 className="font-bold text-[#1e293b] text-base sm:text-lg flex items-center gap-2">
            <Gift className="h-5 w-5 text-[#2563eb]" />
            <span>Ayudas y Subvenciones Públicas Registradas (BDNS)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Concesiones oficiales de dinero público sin contraprestación mercantil concedidas a <strong className="text-slate-800">{nombreEmpresa}</strong> según la BDNS (IGAE - Ministerio de Hacienda)
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
            <ShieldCheck className="h-3.5 w-3.5" />
            SNPSAP / IGAE Oficial
          </span>
        </div>
      </div>

      {/* Tarjetas KPI de Subvenciones: Solo mostramos tarjetas que tengan información (> 0) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total General */}
        <div className="p-4 rounded-xl bg-[#eff6ff]/60 border border-[#dbeafe] space-y-1">
          <span className="text-[11px] font-bold text-[#2563eb] uppercase tracking-wider block">
            Total Subvenciones BDNS
          </span>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {formatCurrency(volumenTotal)}
          </div>
          <p className="text-[11px] text-slate-500 font-medium">
            {formatNumber(totalSubvenciones)} concesión(es) registrada(s)
          </p>
        </div>

        {/* Solo si hay ayudas del Ayuntamiento de Alcázar */}
        {itemsAlcazar.length > 0 && (
          <div className="p-4 rounded-xl bg-[#ecfdf5] border border-[#d1fae5] space-y-1">
            <span className="text-[11px] font-bold text-[#0d9373] uppercase tracking-wider block">
              Ayuntamiento de Alcázar
            </span>
            <div className="text-xl font-bold font-mono text-[#065f46]">
              {formatCompactCurrency(volAlcazar)}
            </div>
            <p className="text-[11px] text-[#0d9373]">
              {itemsAlcazar.length} ayuda(s) directa(s) municipal(es)
            </p>
          </div>
        )}

        {/* Autonómicas (JCCM, etc.) */}
        {itemsAutonomica.length > 0 && (
          <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Autonómicas (JCCM y otras CC.AA.)
            </span>
            <div className="text-xl font-bold font-mono text-slate-800">
              {formatCompactCurrency(volAutonomica)}
            </div>
            <p className="text-[11px] text-slate-500">
              {itemsAutonomica.length} ayudas autonómicas
            </p>
          </div>
        )}

        {/* Nacionales / UE */}
        {itemsNacionales.length > 0 && (
          <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Nacionales / UE
            </span>
            <div className="text-xl font-bold font-mono text-slate-800">
              {formatCompactCurrency(volNacionales)}
            </div>
            <p className="text-[11px] text-slate-500">
              {itemsNacionales.length} ayudas estatales y fondos europeos
            </p>
          </div>
        )}

        {/* Otros Ayuntamientos (si no es Alcázar) */}
        {itemsOtrasLocales.length > 0 && (
          <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Otros Ayuntamientos
            </span>
            <div className="text-xl font-bold font-mono text-slate-800">
              {formatCompactCurrency(volOtrasLocales)}
            </div>
            <p className="text-[11px] text-slate-500">
              {itemsOtrasLocales.length} de otros municipios
            </p>
          </div>
        )}

        {/* Otras entidades públicas (Fundaciones, Consorcios) */}
        {itemsOtrosEntes.length > 0 && itemsOtrasLocales.length === 0 && (
          <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Otras Entidades Públicas
            </span>
            <div className="text-xl font-bold font-mono text-slate-800">
              {formatCompactCurrency(volOtrosEntes)}
            </div>
            <p className="text-[11px] text-slate-500">
              {itemsOtrosEntes.length} fundaciones / consorcios
            </p>
          </div>
        )}
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        {/* Pestañas de Administración: Solo mostramos pestañas que tengan datos (> 0) */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setSelectedNivel('TODOS')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
              selectedNivel === 'TODOS'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todas ({items.length})
          </button>

          {itemsAlcazar.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedNivel('ALCAZAR')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                selectedNivel === 'ALCAZAR'
                  ? 'bg-white text-[#0d9373] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ayto. Alcázar ({itemsAlcazar.length})
            </button>
          )}

          {itemsAutonomica.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedNivel('AUTONOMICA')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                selectedNivel === 'AUTONOMICA'
                  ? 'bg-white text-[#2563eb] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Autonómicas ({itemsAutonomica.length})
            </button>
          )}

          {itemsNacionales.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedNivel('ESTADO')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                selectedNivel === 'ESTADO'
                  ? 'bg-white text-[#4f46e5] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Nacionales / UE ({itemsNacionales.length})
            </button>
          )}

          {itemsOtrasLocales.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedNivel('OTRAS_LOCALES')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                selectedNivel === 'OTRAS_LOCALES'
                  ? 'bg-white text-[#d97706] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Otros Ayuntamientos ({itemsOtrasLocales.length})
            </button>
          )}

          {itemsOtrosEntes.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedNivel('OTROS_ENTES')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                selectedNivel === 'OTROS_ENTES'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Otros Entes ({itemsOtrosEntes.length})
            </button>
          )}
        </div>

        {/* Campo de búsqueda */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por convocatoria u órgano..."
            className="w-full pl-8.5 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/20 focus:border-[#3b82f6] text-slate-800 placeholder-slate-400"
          />
        </div>
      </div>

      {/* Listado / Tabla de Concesiones */}
      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <div className="text-center py-8 bg-[#f8fafb] rounded-xl border border-dashed border-[#e2e8f0]">
            <p className="text-xs text-slate-500">
              No se encontraron subvenciones con los filtros aplicados.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f8fafb] text-slate-500 font-semibold border-b border-[#e2e8f0]">
                <tr>
                  <th className="py-2.5 px-3.5">Fecha</th>
                  <th className="py-2.5 px-3">Importe</th>
                  <th className="py-2.5 px-3">Administración / Órgano Concedente</th>
                  <th className="py-2.5 px-3.5">Convocatoria y Finalidad</th>
                  <th className="py-2.5 px-3">Instrumento</th>
                  <th className="py-2.5 px-3 text-center">Bases / Doc</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {visibleItems.map((sub) => {
                  const isExpanded = expandedId === sub.id;
                  const nivel = (sub.granting_authority_level_1 || '').toUpperCase();
                  const esAlcazar = sub.is_alcazar === 1;
                  const esOtraLocal = nivel === 'LOCAL' && !esAlcazar;
                  const esAutonoma = nivel === 'AUTONOMICA';
                  const esNacional = nivel === 'ESTADO';
                  const euFunded = isEuFunded(sub.call, sub.instrument);

                  return (
                    <tr key={sub.id} className="hover:bg-[#f8fafb] transition-colors">
                      <td className="py-3 px-3.5 whitespace-nowrap font-mono text-slate-600">
                        {formatDate(sub.grant_date)}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-mono font-bold text-slate-900">
                        {formatCurrency(sub.amount)}
                      </td>
                      <td className="py-3 px-3">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                              esAlcazar
                                ? 'bg-[#ecfdf5] text-[#0d9373] border-[#d1fae5]'
                                : esOtraLocal
                                ? 'bg-[#fffbeb] text-[#b45309] border-[#fef3c7]'
                                : esAutonoma
                                ? 'bg-[#eff6ff] text-[#2563eb] border-[#dbeafe]'
                                : esNacional
                                ? 'bg-[#f5f3ff] text-[#6d28d9] border-[#ede9fe]'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}>
                              {esAlcazar && <Landmark className="h-3 w-3 text-[#0d9373]" />}
                              {esOtraLocal && <Landmark className="h-3 w-3 text-[#b45309]" />}
                              {esAutonoma && <Building2 className="h-3 w-3 text-[#2563eb]" />}
                              {esNacional && <Globe className="h-3 w-3 text-[#6d28d9]" />}
                              {esAlcazar
                                ? 'Alcázar de San Juan'
                                : esOtraLocal
                                ? `Ayto. ${sub.granting_authority_level_2 || 'Local'}`
                                : sub.granting_authority_level_2 || sub.granting_authority_level_1 || 'Entidad Pública'}
                            </span>

                            {euFunded && (
                              <span 
                                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe]"
                                title="Subvención cofinanciada por la Unión Europea (NextGenerationEU / PRTR / FEDER / FSE)"
                              >
                                <span>🇪🇺</span> Fondos UE / NextGen
                              </span>
                            )}
                          </div>

                          <div className="font-medium text-slate-800 line-clamp-1 max-w-[240px]" title={sub.granting_authority || ''}>
                            {sub.granting_authority || 'Órgano Público'}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3.5">
                        <div className="space-y-1 max-w-[380px]">
                          <p className={`text-slate-700 leading-snug ${isExpanded ? '' : 'line-clamp-2'}`}>
                            {sub.call || 'Sin descripción detallada en BDNS'}
                          </p>
                          {sub.call && sub.call.length > 120 && (
                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                              className="text-[11px] font-semibold text-[#2563eb] hover:underline inline-flex items-center gap-0.5"
                            >
                              {isExpanded ? (
                                <>Ver menos <ChevronUp className="h-3 w-3" /></>
                              ) : (
                                <>Ver texto completo <ChevronDown className="h-3 w-3" /></>
                              )}
                            </button>
                          )}
                          <div className="flex flex-wrap items-center gap-x-2 text-[10px] font-mono text-slate-400 pt-0.5">
                            {sub.call_number && (
                              <span>Conv. BDNS: {sub.call_number}</span>
                            )}
                            {sub.award_code && (
                              <span className="text-slate-500 font-medium">Asiento: {sub.award_code}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="text-[11px] text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200/60 block truncate max-w-[140px]" title={sub.instrument || 'Subvención'}>
                          {sub.instrument || 'Subvención'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          {sub.terms_url && (
                            <a
                              href={sub.terms_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2563eb] hover:text-[#1d4ed8] hover:underline px-2 py-0.5 rounded bg-[#eff6ff] border border-[#dbeafe]"
                              title="Consultar orden de bases y convocatoria oficial publicada en diario oficial (DOCM/BOE)"
                            >
                              <span>Bases oficiales</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {sub.call_number && (
                            <a
                              href={`https://www.pap.hacienda.gob.es/bdnstrans/GE/es/convocatorias/${sub.call_number}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 hover:text-slate-900 hover:underline"
                              title="Consultar ficha de la convocatoria y concesiones en el portal oficial de la BDNS (Ministerio de Hacienda)"
                            >
                              <span>Ficha BDNS</span>
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                          {!sub.terms_url && !sub.call_number && (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Botón de expansión de resultados */}
        {filteredItems.length > 6 && (
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#f8fafb] hover:bg-slate-100 border border-[#e2e8f0] text-slate-700 transition-colors"
            >
              {showAll ? (
                <>
                  <ChevronUp className="h-4 w-4" /> Mostrar menos ayudas
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" /> Ver todas las {filteredItems.length} ayudas registradas
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Nota Metodológica y Legal */}
      <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] flex items-start gap-3">
        <HelpCircle className="h-4 w-4 text-[#2563eb] shrink-0 mt-0.5" />
        <div className="text-[11px] text-slate-600 leading-relaxed space-y-1">
          <div>
            <strong className="text-slate-900 font-semibold">
              ¿De dónde proceden los importes y datos de las ayudas?
            </strong>{' '}
            Los importes mostrados corresponden al <em>asiento individual de concesión</em> registrado y certificado telemáticamente por cada administración pública en la Base de Datos Nacional de Subvenciones (IGAE) bajo su código oficial de concesión.
          </div>
          <div>
            El enlace a <em>Bases oficiales</em> conduce a la orden de convocatoria previa publicada en el diario oficial (DOCM, BOE, boletines provinciales), donde se aprueban los requisitos generales del programa. La concesión individual con su cuantía exacta queda acreditada en el registro de la BDNS.
          </div>
        </div>
      </div>
    </div>
  );
}
