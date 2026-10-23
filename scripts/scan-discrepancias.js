/**
 * Script de Auditoría Cronológica de Licitaciones
 * 
 * Escanea el censo completo de licitaciones y detecta aquellas con fallos,
 * incoherencias o discrepancias temporales para revisión manual con IA.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');
let db;


function parseDateMs(d) {
  if (!d) return null;
  const t = Date.parse(d);
  return isNaN(t) ? null : t;
}

function getContractSlug(id) {
  if (!id) return '';
  const clean = id.trim();
  const lastSlash = clean.lastIndexOf('/');
  if (lastSlash !== -1 && lastSlash < clean.length - 1) {
    const slug = clean.substring(lastSlash + 1);
    if (slug.length >= 5) return slug;
  }
  return encodeURIComponent(clean);
}

function validarContrato(lic) {
  const procedimiento = (lic.procedimiento || 'No especificado').trim();
  const procLower = procedimiento.toLowerCase();
  const isMenor = procLower.includes('menor');

  const pubMs = parseDateMs(lic.publication_date);
  const limMs = parseDateMs(lic.deadline_date);
  const adjMs = parseDateMs(lic.award_date);
  const formMs = parseDateMs(lic.formalization_date);

  // 1. Incompatibilidad directa: adjudicación antes de límite o formalización antes de adjudicación
  const isAdjBeforeLim = Boolean(limMs && adjMs && adjMs < limMs);
  const isFormBeforeAdj = Boolean(adjMs && formMs && formMs < adjMs);

  if (isAdjBeforeLim || isFormBeforeAdj) {
    return {
      tipo: 'DISCREPANCIA_CRONOLOGICA_REGISTRAL',
      severidad: 'MEDIA',
      motivo: isAdjBeforeLim
        ? `Adjudicación (${(lic.award_date || '').slice(0, 10)}) anterior al límite de ofertas (${(lic.deadline_date || '').slice(0, 10)})`
        : `Formalización (${(lic.formalization_date || '').slice(0, 10)}) anterior a la adjudicación (${(lic.award_date || '').slice(0, 10)})`,
      accionRecomendada: 'Revisión prioritaria con IA / Cotejo de actas oficiales para detectar errata de año/mes en PLACSP'
    };
  }

  // 2. Procedimiento competitivo con publicación posterior al límite de ofertas
  if (!isMenor && limMs && pubMs && pubMs > limMs) {
    const diffDias = Math.round((pubMs - limMs) / (1000 * 86400));
    return {
      tipo: 'FUENTE_HISTORICA_INCOMPLETA',
      severidad: 'INFORMATIVA',
      motivo: `Publicación en PLACSP registrada ${diffDias} días después del límite de ofertas (típico de enmiendas de pliegos o volcado histórico)`,
      accionRecomendada: 'Verificar en PLACSP si existió un anuncio de licitación primigenio que fue sobrescrito'
    };
  }

  return null;
}

function main() {
  db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
  const rows = db.prepare(`
    SELECT id, case_number, object_description, procedure, contracting_authority_name, awardee,
           amount_excl_vat, awarded_amount, publication_date, deadline_date,
           award_date, formalization_date, source_url
    FROM contracts
    ORDER BY year DESC, publication_date DESC
  `).all();

  const discrepancias = [];

  for (const r of rows) {
    const val = validarContrato(r);
    if (val) {
      discrepancias.push({
        ...r,
        slug: getContractSlug(r.id),
        ...val
      });
    }
  }

  const graves = discrepancias.filter(d => d.tipo === 'DISCREPANCIA_CRONOLOGICA_REGISTRAL');
  const historicas = discrepancias.filter(d => d.tipo === 'FUENTE_HISTORICA_INCOMPLETA');

  console.log(`\n🔍 Auditoría Cronológica de LicitAlcázar`);
  console.log(`=======================================================`);
  console.log(`Total contratos analizados: ${rows.length}`);
  console.log(`🚨 Discrepancias registrales directas: ${graves.length}`);
  console.log(`ℹ️  Publicaciones posteriores en feed histórico: ${historicas.length}`);
  console.log(`=======================================================\n`);

  console.log(`LISTADO DE LAS ${graves.length} DISCREPANCIAS REGISTRALES DIRECTAS:`);
  graves.forEach((g, i) => {
    console.log(`\n[${i + 1}] Expediente: ${g.case_number} (${g.procedure})`);
    console.log(`    Objeto: ${g.object_description?.slice(0, 70)}...`);
    console.log(`    Adjudicatario: ${g.awardee || 'Desconocido'} | Importe: ${g.awarded_amount || g.amount_excl_vat} €`);
    console.log(`    Motivo: ${g.motivo}`);
    console.log(`    Ficha Local: http://localhost:3000/contracts/${g.slug}`);
    console.log(`    PLACSP: ${g.source_url}`);
  });

  // Generar reporte en Markdown
  const mdLines = [
    '# Registro de Expedientes con Discrepancias Cronológicas',
    '',
    '> Este documento recoge de forma sistemática los contratos del censo que presentan anomalías temporales en los metadatos oficiales de PLACSP. Se utiliza como lista de trabajo para auditoría documental y revisión asistida por IA.',
    '',
    '## 1. Discrepancias Registrales Directas (Revisión Prioritaria)',
    '',
    'Casos donde la fecha de adjudicación consta antes del cierre del plazo de ofertas, o la formalización antes de la adjudicación. Suelen corresponder a erratas de digitación del órgano de contratación en la plataforma oficial.',
    '',
    '| Nº | Expediente | Objeto | Procedimiento | Adjudicación | Detalle Discrepancia | Ficha Local | PLACSP |',
    '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |'
  ];

  graves.forEach((g, i) => {
    mdLines.push(`| ${i + 1} | \`${g.case_number}\` | ${g.object_description?.replace(/\|/g, '/').slice(0, 45)}... | ${g.procedure} | ${(g.award_date || '').slice(0, 10)} | ${g.motivo} | [Ver ficha](http://localhost:3000/contracts/${g.slug}) | [Enlace PLACSP](${g.source_url}) |`);
  });

  mdLines.push('');
  mdLines.push('## 2. Inconsistencias de Publicación en Feed Histórico');
  mdLines.push('');
  mdLines.push(`Se han detectado **${historicas.length} contratos competitivos** (la gran mayoría de ejercicios 2018-2023) cuya fecha de publicación figura en el feed de datos abiertos con posterioridad a la fecha límite de presentación de ofertas.`);
  mdLines.push('Esto se debe a la arquitectura del feed ATOM de PLACSP, donde las rectificaciones de pliegos o las publicaciones de adjudicación sobrescribían en ocasiones el campo `<cbc:IssueDate>` del anuncio original.');
  mdLines.push('');

  const reportPath = path.resolve(__dirname, '../docs/DISCREPANCIAS_TEMPORALES.md');
  fs.writeFileSync(reportPath, mdLines.join('\n'), 'utf-8');
  console.log(`\n📄 Reporte generado con éxito en: ${reportPath}`);
  } finally {
    db?.close();
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Error al auditar discrepancias cronológicas:', error);
    process.exitCode = 1;
  }
}

module.exports = { parseDateMs, getContractSlug, validarContrato, main };
