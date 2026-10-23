import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { getDb } from './db';
import { formatNif, maskDniNie, isPersonaFisicaNif } from './format';
import { 
  getLicitacionesExportData, 
  getEmpresasExportData, 
  getAlertasExportData,
  LICITACIONES_CSV_COLUMNS,
  EMPRESAS_CSV_COLUMNS,
  ALERTAS_CSV_COLUMNS
} from './export';
import { LEGAL_CONFIG } from './config';

describe('Verificación de Cumplimiento Legal y Metodológico (Fases 1 a 10)', () => {
  const db = getDb();

  // Test 1: Ausencia de expresiones prohibidas en alertas precalculadas en BD
  describe('Control de lenguaje prudente y ausencia de términos lesivos en BD', () => {
    it('no contiene términos prohibidos (a dedo, ilegal, amaño, corrupción, delito, favorecida) en títulos ni descripciones', () => {
      const rows = db.prepare('SELECT id, title AS titulo, description AS descripcion FROM alerts').all() as any[];
      expect(rows.length).toBeGreaterThan(0);

      const forbiddenTerms = [
        'a dedo',
        'contrato ilegal',
        'fraccionamiento ilegal',
        'adjudicación irregular',
        'amaño',
        'empresa favorecida',
        'corrupción',
        'delito',
        'responsabilidad del alcalde',
        'responsabilidad del concejal',
        'responsabilidad del funcionario',
        'baja temeraria',
      ];

      for (const row of rows) {
        const textToCheck = `${row.title} ${row.description}`.toLowerCase();
        for (const term of forbiddenTerms) {
          expect(
            textToCheck.includes(term),
            `Alerta ${row.id} contiene el término prohibido "${term}": ${row.titulo}`
          ).toBe(false);
        }
      }
    });

    it('incluye la fórmula legal garantista obligatoria en todas las alertas de contratos menores', () => {
      const rows = db.prepare("SELECT id, description AS descripcion FROM alerts WHERE type = 'CONTRATOS_RELACIONADOS'").all() as any[];
      expect(rows.length).toBeGreaterThan(0);

      for (const r of rows) {
        expect(r.descripcion).toContain(
          'Se ha detectado una acumulación de contratos menores con elementos coincidentes en el periodo analizado'
        );
        expect(r.descripcion).toContain(
          'Este resultado es una señal analítica y no acredita por sí mismo un fraccionamiento indebido'
        );
      }
    });

    it('incluye la fórmula legal garantista obligatoria en alertas de oferta única', () => {
      const rows = db.prepare("SELECT id, description AS descripcion FROM alerts WHERE type = 'OFERTA_UNICA'").all() as any[];
      expect(rows.length).toBeGreaterThan(0);

      for (const r of rows) {
        expect(r.descripcion).toContain(
          'Se ha registrado una única oferta admitida'
        );
        expect(r.descripcion).toContain(
          'no acredita por sí mismo una restricción indebida de la competencia'
        );
      }
    });

    it('incluye la fórmula legal garantista obligatoria en alertas de descuento significativo / baja acusada', () => {
      const rows = db.prepare("SELECT id, description AS descripcion FROM alerts WHERE type = 'BAJA_ACUSADA'").all() as any[];
      expect(rows.length).toBeGreaterThan(0);

      for (const r of rows) {
        expect(r.descripcion).toContain(
          'Se ha detectado un descuento significativo'
        );
        expect(r.descripcion).toContain(
          'no determina por sí solo que una oferta sea anormal'
        );
      }
    });
  });

  // Test 2: Anonimización de DNI/NIE conforme a la Disposición Adicional 7ª de la LOPDGDD
  describe('Protección de datos y enmascaramiento de personas físicas (DA 7ª LOPDGDD)', () => {
    it('distingue correctamente personas físicas (DNI/NIE) de personas jurídicas (CIF societario)', () => {
      expect(isPersonaFisicaNif('05678912A')).toBe(true);
      expect(isPersonaFisicaNif('70812345Z')).toBe(true);
      expect(isPersonaFisicaNif('X1234567B')).toBe(true);
      expect(isPersonaFisicaNif('Y9876543C')).toBe(true);
      expect(isPersonaFisicaNif('***4567**')).toBe(true);

      // Personas jurídicas
      expect(isPersonaFisicaNif('B13589012')).toBe(false);
      expect(isPersonaFisicaNif('A13019872')).toBe(false);
      expect(isPersonaFisicaNif('U13999888')).toBe(false);
      expect(isPersonaFisicaNif('Q1300001A')).toBe(false);
    });

    it('enmascara DNI conservando únicamente 4 dígitos con asteriscos', () => {
      const masked = maskDniNie('05678912A');
      expect(masked).toBe('***6789**');
      expect(masked).not.toContain('05678912A');
    });

    it('enmascara NIE conservando únicamente 4 dígitos con asteriscos', () => {
      const masked = maskDniNie('X1234567B');
      expect(masked).toBe('***2345**');
      expect(masked).not.toContain('X1234567B');
    });

    it('preserva el CIF íntegro y en mayúsculas para personas jurídicas', () => {
      expect(formatNif('b13589012')).toBe('B13589012');
      expect(formatNif('a82003815')).toBe('A82003815');
      expect(formatNif('u13999888')).toBe('U13999888');
    });

    it('aplica el enmascaramiento en las exportaciones de licitaciones y empresas', () => {
      const licitaciones = getLicitacionesExportData();
      for (const lic of licitaciones.slice(0, 100)) {
        if (lic.nif_adjudicatario && isPersonaFisicaNif(lic.nif_adjudicatario)) {
          expect(lic.nif_adjudicatario).toContain('*');
        }
      }

      const empresas = getEmpresasExportData();
      for (const emp of empresas.slice(0, 100)) {
        if (emp.cif && isPersonaFisicaNif(emp.cif)) {
          expect(emp.cif).toContain('*');
        }
      }
    });
  });

  // Test 3: Trazabilidad y Metadatos en Exportaciones (Fase 8 y 10)
  describe('Trazabilidad, fuentes oficiales y metadatos en exportaciones', () => {
    it('incluye fuente oficial y versión metodológica en licitaciones exportables', () => {
      const rows = getLicitacionesExportData();
      expect(rows.length).toBeGreaterThan(0);
      const row = rows[0];
      expect(row.fuente_origen).toBe('Plataforma de Contratación del Sector Público (PLACSP)');
      expect(row.version_metodologia).toBe('v2.1');
      expect(LICITACIONES_CSV_COLUMNS.some((c) => c.key === 'fuente_origen')).toBe(true);
      expect(LICITACIONES_CSV_COLUMNS.some((c) => c.key === 'version_metodologia')).toBe(true);
    });

    it('incluye fuente oficial y versión metodológica en empresas exportables', () => {
      const rows = getEmpresasExportData();
      expect(rows.length).toBeGreaterThan(0);
      const row = rows[0];
      expect(row.fuente_origen).toBe('Plataforma de Contratación del Sector Público (PLACSP)');
      expect(row.version_metodologia).toBe('v2.1');
      expect(EMPRESAS_CSV_COLUMNS.some((c) => c.key === 'fuente_origen')).toBe(true);
      expect(EMPRESAS_CSV_COLUMNS.some((c) => c.key === 'version_metodologia')).toBe(true);
    });

    it('incluye categoría de resultado, fuente y aviso legal en alertas exportables', () => {
      const rows = getAlertasExportData();
      expect(rows.length).toBeGreaterThan(0);
      const row = rows[0];
      expect(row.categoria_resultado).toBeDefined();
      expect(row.fuente_origen).toBe('Plataforma de Contratación del Sector Público (PLACSP)');
      expect(row.aviso_legal).toContain('No constituye imputación de irregularidad');
      expect(ALERTAS_CSV_COLUMNS.some((c) => c.key === 'categoria_resultado')).toBe(true);
      expect(ALERTAS_CSV_COLUMNS.some((c) => c.key === 'aviso_legal')).toBe(true);
    });
  });

  // Test 4: Esquema técnico real de la tabla alertas en SQLite
  describe('Esquema técnico real de la base de datos (tabla alertas)', () => {
    it('la tabla alertas contiene exactamente 24 columnas reales y no nulas según definición', () => {
      const columns = db.prepare('PRAGMA table_info(alerts)').all() as any[];
      expect(columns.length).toBe(24);

      const columnNames = columns.map(c => c.name);
      const expectedColumns = [
        'id', 'category', 'type', 'severity', 'level', 'scale_score', 'confidence',
        'title', 'description', 'target_data', 'source', 'source_url',
        'extracted_at', 'applied_rule', 'methodology_version', 'limitations',
        'alternative_explanation', 'requires_human_review', 'evidence',
        'factors_json', 'continuity_pattern', 'explanations_json', 'documents_json', 'created_at'
      ];

      for (const col of expectedColumns) {
        expect(columnNames.includes(col), `columna ${col} presente en BD`).toBe(true);
      }

      const rows = db.prepare(`
        SELECT 
          id, category AS categoria, type AS tipo, severity AS severidad, level AS nivel, scale_score AS score_escala, confidence AS confianza,
          title AS titulo, description AS descripcion, target_data AS dato_objetivo, source AS fuente, source_url AS url_fuente,
          extracted_at AS fecha_extraccion, applied_rule AS regla_aplicada, methodology_version AS version_metodologia, limitations AS limitaciones,
          alternative_explanation AS explicacion_alternativa, requires_human_review AS requiere_revision_humana
        FROM alerts
      `).all() as any[];

      expect(rows.length).toBeGreaterThan(0);

      const validCategories = new Set(['A', 'B', 'C', 'D', 'E']);
      const validNiveles = new Set(['alta', 'media', 'informativa', 'ALTA', 'MEDIA', 'INFORMATIVA']);

      for (const r of rows) {
        expect(r.id, 'id presente').toBeTruthy();
        expect(validCategories.has(r.categoria), `categoría válida A-E (got ${r.categoria})`).toBe(true);
        expect(r.tipo, 'tipo presente').toBeTruthy();
        expect(r.titulo, 'titulo presente').toBeTruthy();
        expect(r.descripcion, 'descripcion presente').toBeTruthy();
        expect(r.dato_objetivo, 'dato_objetivo presente').toBeTruthy();
        expect(r.fuente, 'fuente presente').toBeTruthy();
        expect(r.url_fuente, 'url_fuente presente').toBeTruthy();
        expect(r.fecha_extraccion, 'fecha_extraccion presente').toBeTruthy();
        expect(r.regla_aplicada, 'regla_aplicada presente').toBeTruthy();
        expect(r.version_metodologia, 'version_metodologia presente').toBeTruthy();
        expect(r.limitaciones, 'limitaciones presente').toBeTruthy();
        expect(r.explicacion_alternativa, 'explicacion_alternativa presente').toBeTruthy();
        expect(validNiveles.has(r.nivel), `nivel válido (got ${r.nivel})`).toBe(true);
        expect(r.requiere_revision_humana === 1 || r.requiere_revision_humana === 0).toBe(true);
      }
    });
  });

  // Test 5: Parámetros de Configuración Legal (Fase 2 y 13)
  describe('Configuración legal y canales de privacidad', () => {
    it('dispone de parámetros y correos para ejercicio de derechos sin emails ficticios', () => {
      expect(LEGAL_CONFIG.plazoLegalRgpdMeses).toBe(1);
      expect(LEGAL_CONFIG.plazoLegalRgpdTexto.toLowerCase()).toContain('un mes');
      expect(LEGAL_CONFIG.plazoLegalRgpdTexto).toContain('Plazo legal');
      expect(LEGAL_CONFIG.compromisoAcuseHoras).toBe(48);
      expect(LEGAL_CONFIG.versionMetodologia).toContain('2.1');

      if (!process.env.NEXT_PUBLIC_CONTACT_EMAIL) {
        expect(LEGAL_CONFIG.isConfigured).toBe(false);
        expect(LEGAL_CONFIG.status).toBe('incomplete');
        expect(LEGAL_CONFIG.contactoEmailDisplay).toContain('pendiente de configuración');
        expect(LEGAL_CONFIG.contactoEmail).toBeNull();
      }
    });
  });

  // Test 6: Casuística completa de enmascaramiento DNI/NIE y NIF de empresas
  describe('Casuística completa de enmascaramiento de identificadores', () => {
    it('enmascara DNI, NIE X, Y, Z y deja intactos CIF societarios, nulos y vacíos', () => {
      // DNI
      expect(maskDniNie('05678912A')).toBe('***6789**');
      // NIE X
      expect(maskDniNie('X1234567B')).toBe('***2345**');
      // NIE Y
      expect(maskDniNie('Y9876543C')).toBe('***8765**');
      // NIE Z
      expect(maskDniNie('Z1122334D')).toBe('***1223**');
      // CIF de personas jurídicas
      expect(maskDniNie('B13589012')).toBe('B13589012');
      expect(maskDniNie('A82003815')).toBe('A82003815');
      expect(maskDniNie('Q1300001A')).toBe('Q1300001A');
      // Nulos y vacíos
      expect(maskDniNie('')).toBe('');
      expect(maskDniNie(null)).toBe('');
      expect(maskDniNie(undefined)).toBe('');
    });
  });

  // Test 7: Verificaciones textuales exhaustivas de la Fase 13
  describe('Pruebas exhaustivas de neutralidad, rigor y fuentes (Fase 13)', () => {
    it('no contiene "plazo estatutario", "disociación" impropia ni "revisión pericial" en la documentación pública', () => {
      const docsContent = fs.readFileSync('docs/INDICADORES_AUDITORIA.md', 'utf-8');
      expect(docsContent).not.toContain('plazo estatutario');
      expect(docsContent).not.toContain('disociación');
      expect(docsContent).not.toContain('Registro inmutable');
      expect(docsContent).not.toContain('cotejo pericial');
    });

    it('acota la STS 1119/2025 estrictamente al caso BOSCO y sin atribuirle régimen general', () => {
      const metodoContent = fs.readFileSync('src/app/metodologia/page.tsx', 'utf-8');
      expect(metodoContent).toContain('STS núm. 1119/2025, de 11 de septiembre de 2025, ECLI:ES:TS:2025:3826');
      expect(metodoContent).toContain('Resuelve una controversia sobre el acceso a la información relativa a la aplicación administrativa BOSCO y a su código fuente.');
      expect(metodoContent).not.toContain('deber de explicabilidad');
      expect(metodoContent).not.toContain('control de sistemas algorítmicos');
      expect(metodoContent).not.toContain('transparencia algorítmica general');
    });

    it('la página de privacidad incluye la fórmula obligatoria de licitud y minimización', () => {
      const privContent = fs.readFileSync('src/app/privacidad/page.tsx', 'utf-8');
      expect(privContent).toContain(
        'El código incorpora medidas de ocultación y minimización de identificadores. La licitud del tratamiento exige que el responsable determine y documente la base jurídica, la finalidad, la necesidad, la proporcionalidad, la exactitud, la conservación y las medidas de seguridad aplicables.'
      );
      expect(privContent).not.toContain('plazo estatutario');
    });

    it('la tabla alertas de SQLite coincide exactamente con las 24 columnas documentadas', () => {
      const cols = db.prepare('PRAGMA table_info(alerts)').all() as any[];
      expect(cols.length).toBe(24);
      const names = cols.map(c => c.name);
      expect(names).toEqual([
        'id', 'category', 'type', 'severity', 'level', 'scale_score', 'confidence',
        'title', 'description', 'target_data', 'source', 'source_url',
        'extracted_at', 'applied_rule', 'methodology_version', 'limitations',
        'alternative_explanation', 'requires_human_review', 'evidence',
        'factors_json', 'continuity_pattern', 'explanations_json', 'documents_json', 'created_at'
      ]);
    });
  });

  // Test 8: Verificación exhaustiva de las 9 Correcciones Jurídico-Técnicas (LCSP post-RDL 3/2020)
  describe('Verificación de las 9 Correcciones Jurídico-Técnicas (Régimen de Menores post-RDL 3/2020)', () => {
    it('1. Ausencia total de la expresión "límite anual" en código, metodología y alertas', () => {
      const files = [
        'src/app/metodologia/page.tsx',
        'src/components/ContractAlertsCard.tsx',
        'src/lib/fraccionamiento.ts',
        'scripts/build-db.js'
      ];
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        expect(content.toLowerCase()).not.toContain('límite anual');
        expect(content.toLowerCase()).not.toContain('limite anual');
      }
    });

    it('2. No cita el art. 118.3 para memorias ni justificaciones en el portal, acotándolo a la historia en 20.4', () => {
      const files = [
        'src/components/ContractAlertsCard.tsx',
        'src/lib/fraccionamiento.ts',
        'scripts/build-db.js'
      ];
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        expect(content).not.toContain('118.3');
      }

      const metodo = fs.readFileSync('src/app/metodologia/page.tsx', 'utf-8');
      const matches1183 = metodo.match(/118\.3/g) || [];
      expect(matches1183.length).toBeLessThanOrEqual(1);
      if (matches1183.length === 1) {
        expect(metodo).toContain('antiguo art. 118.3');
        const sec8 = metodo.split('id="alertas"')[1]?.split('id="flujo"')[0] || '';
        expect(sec8).not.toContain('118.3');
      }
    });

    it('3. Emplea "Umbral analítico de referencia" en alertas y no aplica "tope legal" a importes acumulados', () => {
      const cardContent = fs.readFileSync('src/components/ContractAlertsCard.tsx', 'utf-8');
      expect(cardContent).toContain('Umbral analítico de referencia');
      expect(cardContent).toContain('Exceso sobre umbral analítico');
      expect(cardContent).toContain('Supera el umbral analítico de referencia');
      expect(cardContent).toContain('informe de necesidad del expediente (art. 118.2 LCSP)');

      expect(cardContent).toContain('cifra tomada del art. 118.1');
      expect(cardContent).not.toContain('Tope cuantitativo');
      const topeMatches = cardContent.match(/Tope legal/g) || [];
      expect(topeMatches.length).toBe(1); // Exclusivamente en la celda individual de contrato próximo a umbral
    });

    it('4. Cita textualmente el art. 99.2 LCSP consolidado en Metodología', () => {
      const metodo = fs.readFileSync('src/app/metodologia/page.tsx', 'utf-8');
      const cita99_2 = 'No podrá fraccionarse un contrato con la finalidad de disminuir la cuantía del mismo y eludir así los requisitos de publicidad o los relativos al procedimiento de adjudicación que correspondan.';
      expect(metodo).toContain(cita99_2);
    });

    it('5. Cita el art. 29.8 LCSP para la prohibición legal de prórroga en contratos menores', () => {
      const metodo = fs.readFileSync('src/app/metodologia/page.tsx', 'utf-8');
      expect(metodo).toContain('Los contratos menores no admiten prórroga (art. 29.8 LCSP)');
      expect(metodo).toContain('contratos menores se marcan como de ejecución única no prorrogable (art. 29.8 LCSP)');
      expect(metodo).not.toContain('no admiten prórroga (Art. 118.2 LCSP)');
      expect(metodo).not.toContain('ejecución única no prorrogable (Art. 118 LCSP)');
    });

    it('6. Incorpora en Metodología las definiciones de Cat. A-D, Plazo total real y Fases temporales', () => {
      const metodo = fs.readFileSync('src/app/metodologia/page.tsx', 'utf-8');
      expect(metodo).toContain('Categorías Metodológicas de Indicios en Fichas de Alerta (Cat. A – Cat. D)');
      expect(metodo).toContain('Cat. A: Dato localizado');
      expect(metodo).toContain('Cat. B: Info no localizada');
      expect(metodo).toContain('Cat. C: Indicador analítico');
      expect(metodo).toContain('Cat. D: Requiere examinar expediente');
      expect(metodo).not.toContain('Cat. E: Criterio o resolución externa');
      expect(metodo).toContain('Cómputo del «Plazo Total Real» y Cronometría Contractual');
      expect(metodo).toContain('Distribución Temporal por Fases del Ciclo de Vida');
    });

    it('7. Genera identificadores deterministas (pf-<hash>) con HMAC-SHA256 para personas físicas y preserva CIFs', async () => {
      const { getOpaqueEmpresaId } = await import('./corporate');
      const idDni = getOpaqueEmpresaId('05678912A', 'JUAN GARCIA PEREZ');
      expect(idDni).toMatch(/^pf-[a-f0-9]{12}$/);

      const idDniRep = getOpaqueEmpresaId('05678912A', 'JUAN GARCIA PEREZ');
      expect(idDniRep).toBe(idDni);

      const idDniMasked = getOpaqueEmpresaId('***7161**', 'MANUEL RUBIO UTRILLA');
      expect(idDniMasked).toMatch(/^pf-[a-f0-9]{12}$/);

      expect(getOpaqueEmpresaId('B13589012', 'EMPRESA SL')).toBe('B13589012');
      expect(getOpaqueEmpresaId('A82003815', 'SOCIEDAD ANONIMA')).toBe('A82003815');
    });

    it('8. Documenta en Sección 20.1 minimización (RGPD 5.1.c), interés legítimo (6.1.f), 301 redirects y DA 7ª LOPDGDD', () => {
      const metodo = fs.readFileSync('src/app/metodologia/page.tsx', 'utf-8');
      expect(metodo).toContain('art. 5.1.c RGPD');
      expect(metodo).toContain('art. 6.1.f RGPD');
      expect(metodo).toContain('pf-[hash]');
      expect(metodo).toContain('permanentRedirect');
      expect(metodo).toContain('Disposición adicional séptima de la LOPDGDD');
    });

    it('9. Garantiza que la sal nunca se expone en variables públicas ni en componentes cliente', () => {
      // 1. Verificar ausencia de NEXT_PUBLIC_DNI_SALT en archivos de código
      const files = [
        'src/lib/corporate.ts',
        'src/lib/format.ts',
        'src/lib/db.ts',
        'src/app/empresas/[id]/page.tsx'
      ];
      for (const f of files) {
        const content = fs.readFileSync(f, 'utf-8');
        expect(content).not.toContain('NEXT_PUBLIC_DNI_SALT');
      }

      // 2. Verificar que ningún componente cliente importa getOpaqueEmpresaId
      const clientComponents = [
        'src/components/TopEmpresasSection.tsx',
        'src/components/AuditoriaClientView.tsx',
        'src/components/BajaTemerariaSection.tsx',
        'src/components/CommandPalette.tsx',
        'src/components/ContractInvestigationHub.tsx',
        'src/components/EmpresasClientView.tsx',
        'src/components/RenovacionMercadoSection.tsx',
      ];
      for (const c of clientComponents) {
        const content = fs.readFileSync(c, 'utf-8');
        expect(content).not.toContain('getOpaqueEmpresaId');
      }
    });

    it('10. Metodología figura en Versión 2.1 unificada sin notas provisionales de borrador', () => {
      const metodo = fs.readFileSync('src/app/metodologia/page.tsx', 'utf-8');
      expect(metodo).toContain('Versión 2.1 · Actualizado 2026');
      expect(metodo).not.toContain('Actualización metodológica');
      expect(metodo).not.toContain('v1.3');
    });

    it('11. Explica la reforma del RDL 3/2020 y declara la agregación como convención analítica sin anualidad', () => {
      const metodo = fs.readFileSync('src/app/metodologia/page.tsx', 'utf-8');
      expect(metodo).toContain('Disposición final primera del Real Decreto-ley 3/2020, de 4 de febrero');
      expect(metodo).toContain('antiguo art. 118.3');
      expect(metodo).toContain('convención analítica propia del portal');
      const sec20_4 = metodo.split('20.4. Régimen del Contrato Menor')[1]?.split('20.5.')[0] || '';
      expect(sec20_4).not.toContain('en el ejercicio');
      expect(sec20_4).not.toContain('límite anual');
    });
  });
});
