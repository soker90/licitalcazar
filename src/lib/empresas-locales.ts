import { getDb, parseScope } from './db';
import { getCorporateContractSource } from './db-corporate';
import { isOpaquePersonaFisicaId } from './nif-rules';
import { canceledContractStatusSql } from './contract-status-sql';

export type AmbitoGeografico = 'local' | 'provincial' | 'regional' | 'nacional' | 'internacional';

export interface GastoAmbitoItem {
  ambito: AmbitoGeografico;
  nombre: string;
  contratos: number;
  pctContratos: number;
  volumen: number;
  pctVolumen: number;
  color: string;
  empresasDistintas: number;
}

export interface EvolucionAmbitoAno {
  year: number;
  totalVolumen: number;
  volumenLocal: number;
  pctLocal: number;
  volumenProvincial: number;
  pctProvincial: number;
  volumenRegional: number;
  pctRegional: number;
  volumenNacional: number;
  pctNacional: number;
  contratosLocales: number;
  totalContratos: number;
}

export interface EmpresaGeograficaItem {
  awardee: string;
  nif: string | null;
  ambito: AmbitoGeografico;
  sede: string;
  contratos: number;
  volumen: number;
  tipoPrincipal: string;
  grupo?: string;
}

export interface EmpresasLocalesStats {
  resumen: {
    totalVolumen: number;
    volumenLocal: number;
    pctGastoLocal: number;
    contratosLocales: number;
    pctContratosLocales: number;
    volumenProvincialTotal: number;
    pctGastoProvincialTotal: number;
    volumenRegionalTotal: number;
    pctGastoRegionalTotal: number;
    volumenNacionalTotal: number;
    pctGastoNacionalTotal: number;
    totalEmpresasLocales: number;
    totalEmpresasExternas: number;
    diagnostico: string;
  };
  desgloseAmbitos: GastoAmbitoItem[];
  evolucionAnual: EvolucionAmbitoAno[];
  porTipoContrato: {
    tipo: string;
    totalVolumen: number;
    volumenLocal: number;
    pctLocal: number;
    volumenProvincial: number;
    pctProvincial: number;
    volumenRegional: number;
    pctRegional: number;
    volumenNacional: number;
    pctNacional: number;
  }[];
  topEmpresasLocales: EmpresaGeograficaItem[];
  topEmpresasExternas: EmpresaGeograficaItem[];
}

export const PROVINCIAS_ESPANA: Record<string, { provincia: string; comunidad: string }> = {
  '01': { provincia: 'Álava', comunidad: 'País Vasco' },
  '02': { provincia: 'Albacete', comunidad: 'Castilla-La Mancha' },
  '03': { provincia: 'Alicante', comunidad: 'Comunidad Valenciana' },
  '04': { provincia: 'Almería', comunidad: 'Andalucía' },
  '05': { provincia: 'Ávila', comunidad: 'Castilla y León' },
  '06': { provincia: 'Badajoz', comunidad: 'Extremadura' },
  '07': { provincia: 'Baleares', comunidad: 'Islas Baleares' },
  '08': { provincia: 'Barcelona', comunidad: 'Cataluña' },
  '09': { provincia: 'Burgos', comunidad: 'Castilla y León' },
  '10': { provincia: 'Cáceres', comunidad: 'Extremadura' },
  '11': { provincia: 'Cádiz', comunidad: 'Andalucía' },
  '12': { provincia: 'Castellón', comunidad: 'Comunidad Valenciana' },
  '13': { provincia: 'Ciudad Real', comunidad: 'Castilla-La Mancha' },
  '14': { provincia: 'Córdoba', comunidad: 'Andalucía' },
  '15': { provincia: 'A Coruña', comunidad: 'Galicia' },
  '16': { provincia: 'Cuenca', comunidad: 'Castilla-La Mancha' },
  '17': { provincia: 'Girona', comunidad: 'Cataluña' },
  '18': { provincia: 'Granada', comunidad: 'Andalucía' },
  '19': { provincia: 'Guadalajara', comunidad: 'Castilla-La Mancha' },
  '20': { provincia: 'Gipuzkoa', comunidad: 'País Vasco' },
  '21': { provincia: 'Huelva', comunidad: 'Andalucía' },
  '22': { provincia: 'Huesca', comunidad: 'Aragón' },
  '23': { provincia: 'Jaén', comunidad: 'Andalucía' },
  '24': { provincia: 'León', comunidad: 'Castilla y León' },
  '25': { provincia: 'Lleida', comunidad: 'Cataluña' },
  '26': { provincia: 'La Rioja', comunidad: 'La Rioja' },
  '27': { provincia: 'Lugo', comunidad: 'Galicia' },
  '28': { provincia: 'Madrid', comunidad: 'Comunidad de Madrid' },
  '29': { provincia: 'Málaga', comunidad: 'Andalucía' },
  '30': { provincia: 'Murcia', comunidad: 'Región de Murcia' },
  '31': { provincia: 'Navarra', comunidad: 'Comunidad Foral de Navarra' },
  '32': { provincia: 'Ourense', comunidad: 'Galicia' },
  '33': { provincia: 'Asturias', comunidad: 'Principado de Asturias' },
  '34': { provincia: 'Palencia', comunidad: 'Castilla y León' },
  '35': { provincia: 'Las Palmas', comunidad: 'Canarias' },
  '36': { provincia: 'Pontevedra', comunidad: 'Galicia' },
  '37': { provincia: 'Salamanca', comunidad: 'Castilla y León' },
  '38': { provincia: 'Santa Cruz de Tenerife', comunidad: 'Canarias' },
  '39': { provincia: 'Cantabria', comunidad: 'Cantabria' },
  '40': { provincia: 'Segovia', comunidad: 'Castilla y León' },
  '41': { provincia: 'Sevilla', comunidad: 'Andalucía' },
  '42': { provincia: 'Soria', comunidad: 'Castilla y León' },
  '43': { provincia: 'Tarragona', comunidad: 'Cataluña' },
  '44': { provincia: 'Teruel', comunidad: 'Aragón' },
  '45': { provincia: 'Toledo', comunidad: 'Castilla-La Mancha' },
  '46': { provincia: 'Valencia', comunidad: 'Comunidad Valenciana' },
  '47': { provincia: 'Valladolid', comunidad: 'Castilla y León' },
  '48': { provincia: 'Bizkaia', comunidad: 'País Vasco' },
  '49': { provincia: 'Zamora', comunidad: 'Castilla y León' },
  '50': { provincia: 'Zaragoza', comunidad: 'Aragón' },
  '51': { provincia: 'Ceuta', comunidad: 'Ceuta' },
  '52': { provincia: 'Melilla', comunidad: 'Melilla' },
};

export const LOCAL_ENTITIES_ALCAZAR = new Set([
  'B13408349', // La Bola de Cristal Comarca Alcázar de San Juan S.L.
  'A13157029', // Aguas de Alcázar, Empresa Municipal S.A.U.
  'B13559349', // Edirsa Proyectos y Construcción S.L.
  'B13016415', // Intedhor (Ingeniería Técnica del Hormigón S.L.)
  'B13565007', // Prefadhor Tubyder S.L.
  'B13053129', // Recauchutados Luis Tejado S.L.
  'B13435789', // Conectalia Sistemas Integrados de Telecomunicación S.L.L.
  'B13027164', // Tecmoelectric S.L.
  'B13597950', // Plus Comunica S.L. (Comunica Alcázar)
  'B13567950', // Plus Comunica Telecomunicaciones
  'B13630140', // Tempo Music Alcázar S.L.
  'B13420047', // Grupo de Integración Almida S.L.
  'B13493911', // José Antonio Rebato Ruiz S.L.
  'B13385190', // Reformas y Construcciones Vidal S.L.
  'B13552948', // Industria del Poliéster Algar S.L.
  'B13354949', // Metalúrgica Manchega Mialche S.L.
  'B13589411', // Hosteleros del Gran Prior S.L.U.
  'B13536842', // Sima Ingeniería S.L.
  'B13177381', // Sefoma S.L.
  'B13631908', // Comunitelia Seguridad S.L.
]);

export function clasificarEmpresaGeografia(nif: string | null | undefined, awardee: string | null | undefined): {
  ambito: AmbitoGeografico;
  sede: string;
} {
  const nombre = (awardee || '').trim();
  const nombreLower = nombre.toLowerCase();
  const cleanNif = (nif || '').trim().toUpperCase();

  // 1. Identificación explícita de empresas con sede en Alcázar de San Juan
  if (LOCAL_ENTITIES_ALCAZAR.has(cleanNif) || nombreLower.includes('alcázar') || nombreLower.includes('alcazar')) {
    return {
      ambito: 'local',
      sede: 'Alcázar de San Juan (Ciudad Real)'
    };
  }

  // 2. Autónomos locales (DNI/NIE de personas físicas adjudicatarias de contratos municipales de Alcázar)
  if (isOpaquePersonaFisicaId(cleanNif) || cleanNif.match(/^[0-9]{8}[A-Z]/) || cleanNif.match(/^[XYZ][0-9]{7}[A-Z]/)) {
    return {
      ambito: 'local',
      sede: 'Alcázar de San Juan (Autónomo / Residente)'
    };
  }

  // 3. No residentes / Entidades extranjeras
  if (cleanNif.startsWith('W') || cleanNif.startsWith('N')) {
    return {
      ambito: 'internacional',
      sede: 'Internacional / No residente'
    };
  }

  // 4. Sociedades mercantiles con CIF español: primer dígito letra, siguientes dos dígitos código provincia
  if (cleanNif.match(/^[A-HJ-NP-SUV]/)) {
    const codProv = cleanNif.substring(1, 3);
    const provInfo = PROVINCIAS_ESPANA[codProv];

    if (codProv === '13') {
      return {
        ambito: 'provincial',
        sede: 'Ciudad Real (Provincial)'
      };
    }

    if (['02', '16', '19', '45'].includes(codProv)) {
      return {
        ambito: 'regional',
        sede: `${provInfo?.provincia || 'Castilla-La Mancha'} (CLM)`
      };
    }

    if (provInfo) {
      return {
        ambito: 'nacional',
        sede: `${provInfo.provincia} (${provInfo.comunidad})`
      };
    }
  }

  // Si no tiene NIF pero es una gran empresa conocida
  if (
    nombreLower.includes('totalenergies') ||
    nombreLower.includes('gas natural') ||
    nombreLower.includes('naturgy') ||
    nombreLower.includes('endesa') ||
    nombreLower.includes('iberdrola') ||
    nombreLower.includes('telefónica') ||
    nombreLower.includes('vodafone') ||
    nombreLower.includes('ferrovial') ||
    nombreLower.includes('serveo') ||
    nombreLower.includes('fcc') ||
    nombreLower.includes('sacyr') ||
    nombreLower.includes('valoriza') ||
    nombreLower.includes('viales y obras')
  ) {
    return {
      ambito: 'nacional',
      sede: 'Madrid / Corporación Nacional'
    };
  }

  return {
    ambito: 'nacional',
    sede: 'España (Nacional)'
  };
}

export function getEmpresasLocalesStats(year?: number | string, scope?: string): EmpresasLocalesStats {
  const db = getDb();
  const yearNum = Number(year);
  const filterByYear = !isNaN(yearNum) && yearNum > 0;
  const filterScope = parseScope(scope);

  const whereClauses = ["awardee IS NOT NULL", "awardee != 'Sin awardee'"];
  const params: any[] = [];

  if (filterByYear) {
    whereClauses.push("year = ?");
    params.push(yearNum);
  }
  if (filterScope) {
    whereClauses.push("scope = ?");
    params.push(filterScope);
  }

  const contractSource = getCorporateContractSource(db);

  const query = `
    SELECT 
      awardee,
      awardee_nif,
      id as contract_id,
      contract_type as tipo,
      year,
      round(CASE WHEN award_amount_type IS NULL OR award_amount_type IN ('total', 'desconocido') THEN coalesce(awarded_amount, 0) ELSE 0 END, 2) as amount
    FROM ${contractSource}
    WHERE NOT ${canceledContractStatusSql('')} AND ${whereClauses.join(' AND ')}
  `;

  const rows = db.prepare(query).all(...params) as any[];

  let totalVolumen = 0;
  const conteosAmbito: Record<AmbitoGeografico, { contratos: Set<string>; volumen: number; empresas: Set<string> }> = {
    local: { contratos: new Set(), volumen: 0, empresas: new Set() },
    provincial: { contratos: new Set(), volumen: 0, empresas: new Set() },
    regional: { contratos: new Set(), volumen: 0, empresas: new Set() },
    nacional: { contratos: new Set(), volumen: 0, empresas: new Set() },
    internacional: { contratos: new Set(), volumen: 0, empresas: new Set() },
  };

  const evolucionMap: Record<number, {
    totalVol: number;
    localVol: number;
    provVol: number;
    regVol: number;
    nacVol: number;
    localContratos: Set<string>;
    totalContratos: Set<string>;
  }> = {};

  const tipoMap: Record<string, {
    totalVol: number;
    localVol: number;
    provVol: number;
    regVol: number;
    nacVol: number;
  }> = {};

  const empresasMap: Record<string, {
    awardee: string;
    nif: string | null;
    ambito: AmbitoGeografico;
    sede: string;
    contratos: number;
    volumen: number;
    contratosSet: Set<string>;
    tipos: Record<string, number>;
  }> = {};

  for (const r of rows) {
    const imp = Number(r.amount) || 0;
    const yearItem = r.year ? Math.round(Number(r.year)) : null;
    const tipo = r.tipo || 'Otros';
    const empresa = (r.awardee || '').trim();
    const geo = clasificarEmpresaGeografia(r.awardee_nif, empresa);

    totalVolumen += imp;
    conteosAmbito[geo.ambito].contratos.add(String(r.contract_id));
    conteosAmbito[geo.ambito].volumen += imp;
    conteosAmbito[geo.ambito].empresas.add(empresa);

    // Evolución anual
    if (yearItem && yearItem >= 2018 && yearItem <= 2026) {
      if (!evolucionMap[yearItem]) {
        evolucionMap[yearItem] = {
          totalVol: 0,
          localVol: 0,
          provVol: 0,
          regVol: 0,
          nacVol: 0,
          localContratos: new Set(),
          totalContratos: new Set(),
        };
      }
      evolucionMap[yearItem].totalVol += imp;
      evolucionMap[yearItem].totalContratos.add(String(r.contract_id));
      if (geo.ambito === 'local') {
        evolucionMap[yearItem].localVol += imp;
        evolucionMap[yearItem].localContratos.add(String(r.contract_id));
      } else if (geo.ambito === 'provincial') {
        evolucionMap[yearItem].provVol += imp;
      } else if (geo.ambito === 'regional') {
        evolucionMap[yearItem].regVol += imp;
      } else {
        evolucionMap[yearItem].nacVol += imp;
      }
    }

    // Por tipo
    if (!tipoMap[tipo]) {
      tipoMap[tipo] = { totalVol: 0, localVol: 0, provVol: 0, regVol: 0, nacVol: 0 };
    }
    tipoMap[tipo].totalVol += imp;
    if (geo.ambito === 'local') tipoMap[tipo].localVol += imp;
    else if (geo.ambito === 'provincial') tipoMap[tipo].provVol += imp;
    else if (geo.ambito === 'regional') tipoMap[tipo].regVol += imp;
    else tipoMap[tipo].nacVol += imp;

    // Agregación de empresa
    const empKey = `${empresa}|${r.awardee_nif || ''}`;
    if (!empresasMap[empKey]) {
      empresasMap[empKey] = {
        awardee: empresa,
        nif: r.awardee_nif,
        ambito: geo.ambito,
        sede: geo.sede,
        contratos: 0,
        volumen: 0,
        contratosSet: new Set(),
        tipos: {},
      };
    }
    empresasMap[empKey].contratosSet.add(String(r.contract_id));
    empresasMap[empKey].contratos = empresasMap[empKey].contratosSet.size;
    empresasMap[empKey].volumen += imp;
    empresasMap[empKey].tipos[tipo] = (empresasMap[empKey].tipos[tipo] || 0) + imp;
  }

  const totalContratosGlobal = new Set(rows.map((r) => String(r.contract_id))).size;
  const volumenLocal = Math.round(conteosAmbito.local.volumen * 100) / 100;
  const volumenProvincial = Math.round(conteosAmbito.provincial.volumen * 100) / 100;
  const volumenRegional = Math.round(conteosAmbito.regional.volumen * 100) / 100;
  const volumenNacional = Math.round((conteosAmbito.nacional.volumen + conteosAmbito.internacional.volumen) * 100) / 100;

  const pctGastoLocal = totalVolumen > 0 ? Math.round((volumenLocal / totalVolumen) * 1000) / 10 : 0;
  const pctContratosLocales = totalContratosGlobal > 0 ? Math.round((conteosAmbito.local.contratos.size / totalContratosGlobal) * 1000) / 10 : 0;

  const volumenProvTotal = volumenLocal + volumenProvincial;
  const pctGastoProvTotal = totalVolumen > 0 ? Math.round((volumenProvTotal / totalVolumen) * 1000) / 10 : 0;

  const volumenRegTotal = volumenProvTotal + volumenRegional;
  const pctGastoRegTotal = totalVolumen > 0 ? Math.round((volumenRegTotal / totalVolumen) * 1000) / 10 : 0;

  const pctGastoNacTotal = totalVolumen > 0 ? Math.round((volumenNacional / totalVolumen) * 1000) / 10 : 0;

  const desgloseAmbitos: GastoAmbitoItem[] = [
    {
      ambito: 'local',
      nombre: 'Alcázar de San Juan (Local)',
      contratos: conteosAmbito.local.contratos.size,
      pctContratos: totalContratosGlobal > 0 ? Math.round((conteosAmbito.local.contratos.size / totalContratosGlobal) * 1000) / 10 : 0,
      volumen: volumenLocal,
      pctVolumen: pctGastoLocal,
      color: '#0d9373', // Verde Mint
      empresasDistintas: conteosAmbito.local.empresas.size,
    },
    {
      ambito: 'provincial',
      nombre: 'Provincia de Ciudad Real',
      contratos: conteosAmbito.provincial.contratos.size,
      pctContratos: totalContratosGlobal > 0 ? Math.round((conteosAmbito.provincial.contratos.size / totalContratosGlobal) * 1000) / 10 : 0,
      volumen: volumenProvincial,
      pctVolumen: totalVolumen > 0 ? Math.round((volumenProvincial / totalVolumen) * 1000) / 10 : 0,
      color: '#3b82f6', // Azul
      empresasDistintas: conteosAmbito.provincial.empresas.size,
    },
    {
      ambito: 'regional',
      nombre: 'Castilla-La Mancha (Otras provincias)',
      contratos: conteosAmbito.regional.contratos.size,
      pctContratos: totalContratosGlobal > 0 ? Math.round((conteosAmbito.regional.contratos.size / totalContratosGlobal) * 1000) / 10 : 0,
      volumen: volumenRegional,
      pctVolumen: totalVolumen > 0 ? Math.round((volumenRegional / totalVolumen) * 1000) / 10 : 0,
      color: '#f59e0b', // Ámbar
      empresasDistintas: conteosAmbito.regional.empresas.size,
    },
    {
      ambito: 'nacional',
      nombre: 'Resto de España (Nacional)',
      contratos: conteosAmbito.nacional.contratos.size,
      pctContratos: totalContratosGlobal > 0 ? Math.round((conteosAmbito.nacional.contratos.size / totalContratosGlobal) * 1000) / 10 : 0,
      volumen: Math.round(conteosAmbito.nacional.volumen * 100) / 100,
      pctVolumen: totalVolumen > 0 ? Math.round((conteosAmbito.nacional.volumen / totalVolumen) * 1000) / 10 : 0,
      color: '#e11d48', // Carmesí
      empresasDistintas: conteosAmbito.nacional.empresas.size,
    },
    {
      ambito: 'internacional',
      nombre: 'Internacional / No residentes',
      contratos: conteosAmbito.internacional.contratos.size,
      pctContratos: totalContratosGlobal > 0 ? Math.round((conteosAmbito.internacional.contratos.size / totalContratosGlobal) * 1000) / 10 : 0,
      volumen: Math.round(conteosAmbito.internacional.volumen * 100) / 100,
      pctVolumen: totalVolumen > 0 ? Math.round((conteosAmbito.internacional.volumen / totalVolumen) * 1000) / 10 : 0,
      color: '#64748b', // Slate
      empresasDistintas: conteosAmbito.internacional.empresas.size,
    },
  ];

  const evolucionAnual: EvolucionAmbitoAno[] = Object.entries(evolucionMap)
    .map(([yearStr, d]) => {
      const yearVal = Number(yearStr);
      return {
        year: yearVal,
        totalVolumen: Math.round(d.totalVol * 100) / 100,
        volumenLocal: Math.round(d.localVol * 100) / 100,
        pctLocal: d.totalVol > 0 ? Math.round((d.localVol / d.totalVol) * 1000) / 10 : 0,
        volumenProvincial: Math.round(d.provVol * 100) / 100,
        pctProvincial: d.totalVol > 0 ? Math.round((d.provVol / d.totalVol) * 1000) / 10 : 0,
        volumenRegional: Math.round(d.regVol * 100) / 100,
        pctRegional: d.totalVol > 0 ? Math.round((d.regVol / d.totalVol) * 1000) / 10 : 0,
        volumenNacional: Math.round(d.nacVol * 100) / 100,
        pctNacional: d.totalVol > 0 ? Math.round((d.nacVol / d.totalVol) * 1000) / 10 : 0,
        contratosLocales: d.localContratos.size,
        totalContratos: d.totalContratos.size,
      };
    })
    .sort((a, b) => a.year - b.year);

  const porTipoContrato = Object.entries(tipoMap)
    .map(([tipo, d]) => ({
      tipo,
      totalVolumen: Math.round(d.totalVol * 100) / 100,
      volumenLocal: Math.round(d.localVol * 100) / 100,
      pctLocal: d.totalVol > 0 ? Math.round((d.localVol / d.totalVol) * 1000) / 10 : 0,
      volumenProvincial: Math.round(d.provVol * 100) / 100,
      pctProvincial: d.totalVol > 0 ? Math.round((d.provVol / d.totalVol) * 1000) / 10 : 0,
      volumenRegional: Math.round(d.regVol * 100) / 100,
      pctRegional: d.totalVol > 0 ? Math.round((d.regVol / d.totalVol) * 1000) / 10 : 0,
      volumenNacional: Math.round(d.nacVol * 100) / 100,
      pctNacional: d.totalVol > 0 ? Math.round((d.nacVol / d.totalVol) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.totalVolumen - a.totalVolumen);

  const listaEmpresas: EmpresaGeograficaItem[] = Object.values(empresasMap).map((e) => {
    let topTipo = 'Servicios';
    let maxTipoVol = 0;
    for (const [t, v] of Object.entries(e.tipos)) {
      if (v > maxTipoVol) {
        maxTipoVol = v;
        topTipo = t;
      }
    }
    return {
      awardee: e.awardee,
      nif: e.nif,
      ambito: e.ambito,
      sede: e.sede,
      contratos: e.contratos,
      volumen: Math.round(e.volumen * 100) / 100,
      tipoPrincipal: topTipo,
    };
  });

  const topEmpresasLocales = listaEmpresas
    .filter((e) => e.ambito === 'local')
    .sort((a, b) => b.volumen - a.volumen)
    .slice(0, 25);

  const topEmpresasExternas = listaEmpresas
    .filter((e) => e.ambito === 'nacional' || e.ambito === 'internacional')
    .sort((a, b) => b.volumen - a.volumen)
    .slice(0, 25);

  const totalEmpresasLocales = conteosAmbito.local.empresas.size;
  const totalEmpresasExternas = Object.values(empresasMap).filter((e) => e.ambito !== 'local').length;
  const diagnostico = `El ${pctContratosLocales}% de los expedientes adjudicados corresponden a empresas y profesionales con domicilio registral en Alcázar de San Juan (${pctGastoLocal}% del volumen económico). Por su parte, el ${pctGastoNacTotal}% del volumen licitado se adjudicó a entidades con sede social fuera del municipio (suministros de electricidad, gestión comarcal de residuos e infraestructuras mayores). El domicilio registral clasifica la sede de la razón social adjudicataria, sin prejuzgar la contratación de empleo, delegaciones o subcontratación en el ámbito local.`;

  return {
    resumen: {
      totalVolumen: Math.round(totalVolumen * 100) / 100,
      volumenLocal,
      pctGastoLocal,
      contratosLocales: conteosAmbito.local.contratos.size,
      pctContratosLocales,
      volumenProvincialTotal: Math.round(volumenProvTotal * 100) / 100,
      pctGastoProvincialTotal: pctGastoProvTotal,
      volumenRegionalTotal: Math.round(volumenRegTotal * 100) / 100,
      pctGastoRegionalTotal: pctGastoRegTotal,
      volumenNacionalTotal: volumenNacional,
      pctGastoNacionalTotal: pctGastoNacTotal,
      totalEmpresasLocales,
      totalEmpresasExternas,
      diagnostico,
    },
    desgloseAmbitos,
    evolucionAnual,
    porTipoContrato,
    topEmpresasLocales,
    topEmpresasExternas,
  };
}
