import { getDb, parseScope } from './db';
import { getContratosVivosStats, ContratosVivosStats } from './contratos-vivos';
import { inCourseContractStatusSql } from './contract-status-sql';

export type FaseConvocatoria = 'plazo_abierto' | 'evaluacion_plicas';
export type UrgenciaPlazo = 'critica' | 'alta' | 'media' | 'normal' | 'evaluacion';

export interface LicitacionAbiertaItem {
  id: string;
  case_number: string;
  object_description: string;
  tipoContrato: string;
  procedimiento: string;
  organo: string;
  scope: string;
  importeSinIva: number | null;
  importeConIva: number | null;
  fechaPublicacion: string | null;
  fechaLimite: string | null;
  diasRestantes: number | null;
  diasHabilesRestantes: number | null;
  fase: FaseConvocatoria;
  urgency: UrgenciaPlazo;
  urgencia: UrgenciaPlazo;
  url: string | null;
}

export interface SeguimientoKpis {
  totalConvocatoriasActivas: number;
  totalPlazoAbierto: number;
  totalEnEvaluacion: number;
  importeTotalLicitado: number;
  contratosVencen30Dias: number;
  volumenVence30Dias: number;
  contratosVencen180Dias: number;
  volumenVence180Dias: number;
  totalContratosVivos: number;
  volumenVivoTotal: number;
}

export interface SeguimientoData {
  kpis: SeguimientoKpis;
  licitacionesAbiertas: LicitacionAbiertaItem[];
  contratosVivos: ContratosVivosStats;
  scope?: string | null;
}

/**
 * Calcula los días hábiles (lunes a viernes) entre dos fechas
 */
export function calcularDiasHabiles(startDate: Date, endDate: Date): number {
  if (endDate <= startDate) return 0;
  let count = 0;
  const cur = new Date(startDate.getTime());
  cur.setHours(0, 0, 0, 0);
  const end = new Date(endDate.getTime());
  end.setHours(0, 0, 0, 0);

  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
  }
  return count;
}

/**
 * Determina urgency y fase de una document_date límite respecto a la document_date de referencia
 */
export function clasificarPlazo(
  fechaLimiteStr: string | null | undefined,
  refDate: Date = new Date()
): {
  diasRestantes: number | null;
  diasHabilesRestantes: number | null;
  fase: FaseConvocatoria;
  urgency: UrgenciaPlazo;
  urgencia: UrgenciaPlazo;
} {
  if (!fechaLimiteStr) {
    return {
      diasRestantes: null,
      diasHabilesRestantes: null,
      fase: 'evaluacion_plicas',
      urgency: 'evaluacion',
      urgencia: 'evaluacion',
    };
  }

  const limitDate = new Date(fechaLimiteStr);
  if (isNaN(limitDate.getTime())) {
    return {
      diasRestantes: null,
      diasHabilesRestantes: null,
      fase: 'evaluacion_plicas',
      urgency: 'evaluacion',
      urgencia: 'evaluacion',
    };
  }

  const diffMs = limitDate.getTime() - refDate.getTime();
  const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diasRestantes < 0) {
    return {
      diasRestantes,
      diasHabilesRestantes: 0,
      fase: 'evaluacion_plicas',
      urgency: 'evaluacion',
      urgencia: 'evaluacion',
    };
  }

  const diasHabilesRestantes = calcularDiasHabiles(refDate, limitDate);

  let urgency: UrgenciaPlazo = 'normal';
  if (diasRestantes <= 3) {
    urgency = 'critica';
  } else if (diasRestantes <= 7) {
    urgency = 'alta';
  } else if (diasRestantes <= 15) {
    urgency = 'media';
  }

  return {
    diasRestantes,
    diasHabilesRestantes,
    fase: 'plazo_abierto',
    urgency,
    urgencia: urgency,
  };
}

/**
 * Obtiene todas las contracts en status abierta o en evaluación
 */
export function getLicitacionesAbiertas(
  scope?: string | null,
  refDate: Date = new Date()
): LicitacionAbiertaItem[] {
  const db = getDb();
  const filterScope = parseScope(scope);

  const whereParts = [inCourseContractStatusSql('')];
  const params: any[] = [];

  if (filterScope) {
    whereParts.push('scope = ?');
    params.push(filterScope);
  }

  const rows = db.prepare(`
    SELECT 
      id,
      case_number,
      object_description,
      contract_type,
      procedure AS procedimiento,
      contracting_authority_name,
      scope,
      amount_excl_vat,
      amount_incl_vat,
      publication_date,
      deadline_date,
      source_url AS url
    FROM contracts
    WHERE ${whereParts.join(' AND ')}
    ORDER BY 
      CASE WHEN deadline_date IS NULL THEN 1 ELSE 0 END ASC,
      deadline_date DESC
  `).all(...params) as any[];

  const mapped = rows.map((r) => {
    const { diasRestantes, diasHabilesRestantes, fase, urgency } = clasificarPlazo(
      r.deadline_date,
      refDate
    );

    return {
      id: r.id,
      case_number: r.case_number,
      expediente: r.case_number,
      object_description: r.object_description,
      tipoContrato: r.contract_type || 'Otros',
      procedimiento: r.procedimiento || 'Abierto',
      organo: r.contracting_authority_name || 'Ayuntamiento de Alcázar de San Juan',
      scope: r.scope,
      importeSinIva: r.amount_excl_vat,
      importeConIva: r.amount_incl_vat,
      fechaPublicacion: r.publication_date,
      fechaLimite: r.deadline_date,
      diasRestantes,
      diasHabilesRestantes,
      fase,
      urgency,
      urgencia: urgency,
      url: r.url,
    };
  });

  return mapped.sort((a, b) => {
    // 1. Priorizar siempre convocatorias con plazo abierto de presentación de ofertas
    if (a.fase === 'plazo_abierto' && b.fase !== 'plazo_abierto') return -1;
    if (a.fase !== 'plazo_abierto' && b.fase === 'plazo_abierto') return 1;

    // 2. Si ambas están abiertas, ordenar por las que cierran más pronto (urgency / días restantes)
    if (a.fase === 'plazo_abierto' && b.fase === 'plazo_abierto') {
      if (a.diasRestantes !== null && b.diasRestantes !== null) {
        return a.diasRestantes - b.diasRestantes;
      }
      return 0;
    }

    // 3. Si están en evaluación o con plazo cerrado, mostrar las cerradas más recientemente primero
    if (a.fechaLimite && b.fechaLimite) {
      return new Date(b.fechaLimite).getTime() - new Date(a.fechaLimite).getTime();
    }
    if (a.fechaLimite && !b.fechaLimite) return -1;
    if (!a.fechaLimite && b.fechaLimite) return 1;
    return 0;
  });
}

/**
 * Obtiene todos los datos agregados para la vista de Vigilancia Activa (/seguimiento)
 */
export function getSeguimientoData(
  scope?: string | null,
  refDate: Date = new Date()
): SeguimientoData {
  const contracts = getLicitacionesAbiertas(scope, refDate);
  const contratosVivos = getContratosVivosStats(getDb, scope, refDate);

  let totalPlazoAbierto = 0;
  let totalEnEvaluacion = 0;
  let importeTotalLicitado = 0;

  for (const lic of contracts) {
    if (lic.fase === 'plazo_abierto') {
      totalPlazoAbierto++;
      if (lic.importeSinIva) {
        importeTotalLicitado += lic.importeSinIva;
      }
    } else {
      totalEnEvaluacion++;
    }
  }

  const kpis: SeguimientoKpis = {
    totalConvocatoriasActivas: contracts.length,
    totalPlazoAbierto,
    totalEnEvaluacion,
    importeTotalLicitado,
    contratosVencen30Dias: contratosVivos.kpis.vencenEn30Dias,
    volumenVence30Dias: contratosVivos.kpis.volumenVence30Dias,
    contratosVencen180Dias: contratosVivos.kpis.vencenEn6Meses,
    volumenVence180Dias: contratosVivos.kpis.volumenVence6Meses,
    totalContratosVivos: contratosVivos.kpis.totalVivos,
    volumenVivoTotal: contratosVivos.kpis.volumenVivoTotal,
  };

  return {
    kpis,
    licitacionesAbiertas: contracts,
    contratosVivos,
    scope,
  };
}
