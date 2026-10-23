export interface FlujoKpis {
  adjudicadas: { contratos: number; volumen: number; pctContratos: number; pctVolumen: number };
  desiertas: { contratos: number; volumen: number; pctContratos: number; pctVolumen: number };
  enCurso: { contratos: number; volumen: number; pctContratos: number; pctVolumen: number };
  anuladas: { contratos: number; volumen: number; pctContratos: number; pctVolumen: number };
  totalLicitaciones: number;
  totalVolumen: number;
  tasaDesiertasPct: number;
}

export interface FlujoDesgloseItem {
  authorityKey?: string;
  nombre: string;
  adjudicadas: number;
  adjudicadasVol: number;
  desiertas: number;
  desiertasVol: number;
  enCurso: number;
  enCursoVol: number;
  anuladas: number;
  anuladasVol: number;
  total: number;
  totalVol: number;
  tasaDesiertasPct: number;
}

export interface ReadjudicacionLicitacion {
  id: string;
  case_number: string;
  expediente?: string;
  object_description: string;
  objeto?: string;
  tipo: string;
  procedimiento: string;
  procedure?: string;
  organo: string;
  year: number;
  ano?: number;
  document_date: string;
  fecha?: string;
  amount: number;
  importe?: number;
  awardee?: string;
  adjudicatario?: string;
}

export interface ReadjudicacionItem {
  desierta: ReadjudicacionLicitacion;
  posterior: ReadjudicacionLicitacion;
  diasTranscurridos: number | null;
  diferenciaImporte: number;
  pctVariacionImporte: number;
  confidence: 'alta' | 'media';
  confianza?: 'alta' | 'media';
  score: number;
}

export interface FlujoStats {
  kpis: FlujoKpis;
  readjudicaciones: ReadjudicacionItem[];
  porTipo: FlujoDesgloseItem[];
  porProcedimiento: FlujoDesgloseItem[];
  porOrganismo: FlujoDesgloseItem[];
  evolucion: {
    year: number;
    adjudicadas: number;
    desiertas: number;
    enCurso: number;
    anuladas: number;
    total: number;
    tasaDesiertasPct: number;
    volumenDesiertas: number;
  }[];
}

const STOP_WORDS = new Set([
  'de', 'la', 'el', 'en', 'y', 'a', 'del', 'las', 'los', 'para', 'con', 'por', 'o', 'al', 'se', 'su',
  'servicio', 'servicios', 'contrato', 'suministro', 'suministros', 'obras', 'obra', 'adquisicion',
  'arrendamiento', 'ayuntamiento', 'alcazar', 'juan', 'mancomunidad', 'comsermancha', 'gestion',
  'ejecucion', 'realizacion', 'case_number', 'lote', 'lotes', 'municipal', 'municipio'
]);

export function cleanWords(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

export function jaccardSimilarity(wordsA: string[], wordsB: string[]): number {
  if (!wordsA.length || !wordsB.length) return 0;
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function detectarReadjudicaciones(
  desiertas: ReadjudicacionLicitacion[],
  adjudicadas: ReadjudicacionLicitacion[]
): ReadjudicacionItem[] {
  const normalize = (x: any): ReadjudicacionLicitacion => ({
    ...x,
    case_number: x.case_number ?? x.expediente,
    object_description: x.object_description ?? x.objeto,
    document_date: x.document_date ?? x.fecha ?? x.fecha_publicacion,
    amount: Number(x.amount ?? x.importe ?? x.importe_adjudicacion ?? 0),
    awardee: x.awardee ?? x.adjudicatario,
  });
  desiertas = desiertas.map(normalize);
  adjudicadas = adjudicadas.map(normalize);
  const adjudicadasWithWords = adjudicadas.map((a) => ({
    ...a,
    words: cleanWords(a.object_description),
    fechaRef: (a.document_date || '').slice(0, 10),
  }));

  const results: ReadjudicacionItem[] = [];

  for (const d of desiertas) {
    const dWords = cleanWords(d.object_description);
    const dFecha = (d.document_date || '').slice(0, 10);
    const dExp = (d.case_number || '').trim().toLowerCase();

    let bestMatch: (typeof adjudicadasWithWords)[0] | null = null;
    let bestScore = 0;

    for (const a of adjudicadasWithWords) {
      if (a.id === d.id) continue;
      if (a.organo !== d.organo) continue;
      if (dFecha && a.fechaRef && a.fechaRef < dFecha) continue;

      // Compatibility on contract type if both defined
      if (d.tipo && a.tipo && d.tipo !== a.tipo) {
        continue;
      }

      const aExp = (a.case_number || '').trim().toLowerCase();
      const expMatch =
        Boolean(dExp && aExp) &&
        (dExp === aExp ||
          (dExp.length >= 7 && aExp.includes(dExp)) ||
          (aExp.length >= 7 && dExp.includes(aExp)));

      const sim = jaccardSimilarity(dWords, a.words);

      let match = false;
      let score = 0;
      if (expMatch && sim >= 0.2) {
        match = true;
        score = 1.0 + sim;
      } else if (sim >= 0.5) {
        match = true;
        score = sim;
      }

      if (match) {
        if (
          !bestMatch ||
          score > bestScore ||
          (score === bestScore && a.fechaRef < bestMatch.fechaRef)
        ) {
          bestMatch = a;
          bestScore = score;
        }
      }
    }

    if (bestMatch) {
      let diasTranscurridos: number | null = null;
      if (dFecha && bestMatch.fechaRef) {
        const d1 = new Date(dFecha).getTime();
        const d2 = new Date(bestMatch.fechaRef).getTime();
        if (!isNaN(d1) && !isNaN(d2) && d2 >= d1) {
          diasTranscurridos = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        }
      }

      const diff = bestMatch.amount - d.amount;
      const pct = d.amount > 0 ? Math.round(((bestMatch.amount - d.amount) / d.amount) * 1000) / 10 : 0;

      results.push({
        desierta: {
          id: d.id,
          case_number: d.case_number,
          object_description: d.object_description,
          tipo: d.tipo,
          procedimiento: d.procedimiento,
          organo: d.organo,
          year: d.year,
          document_date: d.document_date,
          amount: d.amount,
        },
        posterior: {
          id: bestMatch.id,
          case_number: bestMatch.case_number,
          object_description: bestMatch.object_description,
          tipo: bestMatch.tipo,
          procedimiento: bestMatch.procedimiento,
          organo: bestMatch.organo,
          year: bestMatch.year,
          document_date: bestMatch.document_date,
          amount: bestMatch.amount,
          awardee: bestMatch.awardee,
          adjudicatario: bestMatch.awardee,
        },
        diasTranscurridos,
        diferenciaImporte: Math.round(diff * 100) / 100,
        pctVariacionImporte: pct,
        confidence: bestScore >= 1.0 || bestScore >= 0.75 ? 'alta' : 'media',
        confianza: bestScore >= 1.0 || bestScore >= 0.75 ? 'alta' : 'media',
        score: Math.round(bestScore * 100) / 100,
      });
    }
  }

  // Sort by date of deserted tender descending
  return results.sort((a, b) => (b.desierta.document_date || '').localeCompare(a.desierta.document_date || ''));
}
