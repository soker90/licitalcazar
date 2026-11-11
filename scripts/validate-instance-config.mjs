#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const instanceRoot = path.resolve(process.env.ADJUDICA_INSTANCE_ROOT || path.join(process.cwd(), '..'));
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(instanceRoot, relativePath), 'utf8'));

const site = readJson('site.config.json');
const authoritiesConfig = readJson('data/contracting-authorities.json');
const historical = readJson('data/historical-sources.json');

assert.equal(site.siteName, 'LicitAlcázar', 'siteName must identify the LicitAlcázar instance');
assert.equal(site.localityName, 'Alcázar de San Juan', 'localityName must match the configured municipality');
assert.equal(site.siteUrl, 'https://licitalcazar.vercel.app', 'the canonical URL must remain the current production domain');
assert.equal(site.scopePresentation?.primary?.label, 'Solo Ayuntamiento');
assert.equal(site.scopePresentation?.associated?.label, 'Comsermancha (21 municipios)');
assert.equal(site.scopePresentation?.associated?.enabled, true);
assert.equal(site.scopePresentation?.all?.label, 'Total');
assert.ok(site.homePresentation?.primary && site.homePresentation?.associated && site.homePresentation?.all,
  'homepage copy must be configured for all three scopes');
assert.equal(site.homeLatestPublicationLabel, 'Última licitación oficial');
assert.equal(site.homeTopCompaniesTitle, 'Top 10 Empresas Adjudicatarias');
assert.equal(site.homeAuthoritiesDescription, 'Gasto público acumulado por dependencias municipales y entes con sede o actuación en Alcázar');
assert.equal(site.homeRecentContractsDescription, 'Expedientes de contratación y adjudicaciones más recientes en Alcázar de San Juan');
assert.equal(site.brandPrefix, 'Licit', 'the legacy wordmark prefix must be preserved');
assert.equal(site.brandAccent, 'Alcázar', 'the legacy wordmark accent must be preserved');
assert.equal(site.headerBrandSuffix, 'v2', 'the legacy v2 brand suffix must be displayed');
assert.equal(site.instanceCreationGuide, false, 'public LicitAlcázar must not expose the instance creation guide');
assert.ok(site.homeAuditDescription?.includes('gasto público de Alcázar'),
  'the homepage audit description must use the LicitAlcázar wording');
assert.ok(site.homeAnnualEvolutionDescription?.includes('Alcázar de San Juan'));
assert.ok(site.homeTopCompaniesDescription?.includes('Alcázar de San Juan'));
assert.equal(site.analysisPresentation?.scopeLabels?.primary, 'Directa Municipal');
assert.equal(site.analysisPresentation?.methodologyLinkLabel, 'Criterio Comsermancha y Metodología');
assert.equal(site.dataPresentation?.scopeLabels?.primary, 'Directa Municipal (Ayto, Aguas, Patronato, IMD)');
assert.ok(site.scopePresentation?.primary?.noteTitle && site.scopePresentation?.associated?.noteTitle,
  'scope notes must explain the selected institutional scope');
assert.equal(site.organismsPresentation?.title, 'Organismos y Entidades Públicas de Alcázar');
assert.equal(site.organismsPresentation?.directScopeLabel, 'Control Directo Municipal');
assert.equal(site.methodology.indexTitle, 'Índice de secciones');
assert.ok(site.footerDisclaimer?.includes('iniciativa cívica e independiente'));


const authorities = authoritiesConfig.contracting_authorities ?? [];
assert.equal(authorities.length, 10, 'the LicitAlcázar authority catalogue must contain 10 authorities');
assert.equal(authorities.filter((authority) => authority.scope === 'Directa Municipal').length, 8);
assert.equal(authorities.filter((authority) => authority.scope === 'Indirecta (Mancomunidad)').length, 2);
assert.ok(authorities.some((authority) => /COMSERMANCHA/i.test(authority.name)),
  'the associated authority catalogue must include COMSERMANCHA');

const comsermanchaAuthority = authorities.find((authority) => /COMSERMANCHA/i.test(authority.name));
assert.equal(comsermanchaAuthority?.nif, 'P1300031J', 'COMSERMANCHA must use its official NIF');
const comsermanchaNotice = (site.authorityScopeNotices ?? []).find((item) => /COMSERMANCHA/i.test(item.match ?? ''));
assert.ok(comsermanchaNotice?.text.includes(comsermanchaAuthority.nif),
  'the COMSERMANCHA scope notice must display the NIF from the authority catalogue');

const authorityNames = authorities.map((authority) => authority.name.toLocaleUpperCase());
for (const item of site.authorityHistory ?? []) {
  assert.ok(item.match?.trim(), 'authority history entries must define a name match');
  assert.ok(authorityNames.some((name) => name.includes(item.match.toLocaleUpperCase())),
    `authority history match does not identify a configured authority: ${item.match}`);
  assert.ok(item.badge && item.title && item.description && item.detail,
    `authority history entry must retain its badge and explanatory copy: ${item.match}`);
}
for (const item of site.authorityScopeNotices ?? []) {
  assert.ok(item.match?.trim() && item.title?.trim() && item.text?.trim(),
    'authority scope notices must define a match, title and explanatory text');
  assert.ok(authorityNames.some((name) => name.includes(item.match.toLocaleUpperCase())),
    `authority scope notice match does not identify a configured authority: ${item.match}`);
  if (item.linkHref) assert.ok(item.linkHref.startsWith('/'), 'authority scope notice links must be local paths');
}

const sections = site.methodology?.sections ?? [];
const methodologyText = JSON.stringify(site.methodology);
assert.equal(sections.length, 20, 'the legacy methodology must retain all 20 sections');
assert.equal(site.methodology?.indexLinks?.length, 20, 'the methodology index must preserve all 20 legacy links');
assert.equal(site.methodology?.indexLinks?.[0]?.title, '1. Fuente Oficial y Sincronización');
assert.equal(site.methodology?.indexLinks?.[8]?.id, 'hhi', 'the HHI subsection must keep its direct anchor');
const methodologyAnchorIds = new Set(sections.flatMap((section) => [
  section.id,
  ...(section.blocks ?? []).map((block) => block.id),
]).filter(Boolean));
for (const item of site.methodology?.indexLinks ?? []) {
  assert.ok(methodologyAnchorIds.has(item.id), `methodology index target does not exist: #${item.id}`);
}
assert.equal(sections.at(-1)?.showInIndex, false, 'the legal sources appendix must remain outside the main index');
assert.ok(sections.some((section) => section.blocks?.some((block) => block.type === 'heading')),
  'nested methodology headings must be preserved');
assert.ok(sections.some((section) => section.blocks?.some((block) => block.type === 'listItem')),
  'methodology bullet points must be preserved');
const redFlagSection = sections.find((section) => section.id === 'banderas-rojas');
const indicatorCards = (redFlagSection?.blocks ?? []).filter((block) => block.type === 'heading' && block.card);
assert.equal(indicatorCards.length, 7, 'all seven legacy audit indicators must retain their card metadata');
assert.deepEqual(indicatorCards.map((block) => block.card.tone),
  ['amber', 'emerald', 'orange', 'blue', 'red', 'red', 'blue'],
  'audit indicator cards must preserve their original visual severity palette');
assert.deepEqual(indicatorCards.map((block) => block.card.layout),
  ['compact', 'compact', 'compact', 'compact', 'featured', 'featured', 'featured'],
  'the first four indicators must remain compact and the detailed indicators full width');
assert.equal((redFlagSection?.blocks ?? []).filter((block) => block.type === 'formula').length, 5,
  'indicator formulas must remain distinct styled blocks');
assert.equal((redFlagSection?.blocks ?? []).filter((block) => block.type === 'subcard').length, 2,
  'the PBL/VEC and competition explanations must retain their nested cards');
assert.equal((redFlagSection?.blocks ?? []).filter((block) => block.type === 'miniCard').length, 3,
  'the three corporate-aggregation explanations must retain their compact cards');
const riskGuideSection = sections.find((section) => section.id === 'factores-auditoria');
const riskGuideBlocks = riskGuideSection?.blocks ?? [];
const riskGuideHeadings = riskGuideBlocks.filter((block) => block.type === 'heading' && block.card);
assert.equal(riskGuideHeadings.length, 8, 'the citizen risk guide must retain all eight structured subsections');
assert.equal(riskGuideBlocks.filter((block) => block.type === 'miniCard' && block.columns === 5).length, 5,
  'the five analytical dimensions must remain in a five-column card group');
assert.equal(riskGuideBlocks.filter((block) => block.type === 'miniCard' && block.columns === 4).length, 4,
  'the four contract lifecycle phases must remain in a four-column card group');
assert.deepEqual(
  riskGuideBlocks.filter((block) => block.type === 'subcard' && block.columns === 3).map((block) => block.tone),
  ['blue', 'amber', 'red'],
  'the severity scale must preserve its blue, amber and red levels');
assert.deepEqual(
  riskGuideHeadings.filter((block) => block.card.eyebrow).map((block) => block.card.eyebrow),
  ['Tipología 1', 'Tipología 2', 'Tipología 3'],
  'the three alert typologies must retain their labels');
assert.equal(riskGuideBlocks.filter((block) => block.type === 'formula').length, 1,
  'the risk score formula must remain a distinct formula block');
const sourceSection = sections.find((section) => section.id === 'fuente-y-actualizacion');
assert.equal((sourceSection?.blocks ?? []).filter((block) => block.type === 'subcard').length, 3,
  'the data-source explanations and synchronization notice must retain their cards');
const coverageSection = sections.find((section) => section.id === 'cobertura-temporal');
assert.equal((coverageSection?.blocks ?? []).filter((block) => block.type === 'subcard').length, 5,
  'the historical coverage and institutional source cards must remain structured');
const comserSection = sections.find((section) => section.id === 'comsermancha');
assert.deepEqual((comserSection?.blocks ?? []).filter((block) => block.type === 'subcard').map((block) => block.tone),
  ['amber', 'emerald', 'orange'],
  'Comsermancha warning and scope cards must preserve their visual distinctions');
const uteSection = sections.find((section) => section.id === 'utes');
assert.equal((uteSection?.blocks ?? []).filter((block) => block.type === 'subcard').length, 2,
  'the UTE identification and methodological limitation must remain side-by-side cards');
const lotsSection = sections.find((section) => section.id === 'division-lotes');
assert.equal((lotsSection?.blocks ?? []).filter((block) => block.type === 'miniCard' && block.columns === 3).length, 3,
  'the three lot-division criteria must remain in a three-column group');
const flowSection = sections.find((section) => section.id === 'flujo');
assert.equal((flowSection?.blocks ?? []).filter((block) => block.type === 'miniCard').length, 8,
  'the four contract states and four economic classifications must remain card groups');
assert.deepEqual((flowSection?.blocks ?? []).filter((block) => block.type === 'miniCard').slice(0, 4).map((block) => block.tone),
  ['emerald', 'amber', 'blue', 'red'],
  'contract-flow states must preserve their semantic colors');
const legalSourcesSection = sections.find((section) => section.id === 'fuentes-juridicas');
assert.ok(!(legalSourcesSection?.blocks ?? []).some((block) => block.text?.trim() === '); }'),
  'source-code closing syntax must not leak into the legal methodology text');
const analysisCards = [
  ['contratos-vivos', 3, 3],
  ['distribucion-tiempos', 3, 3],
  ['evolucion-temporal', 3, 3],
  ['renovacion-mercado', 3, 3],
  ['calendario-electoral', 3, 3],
  ['modificados-sobrecostes', 3, 2],
  ['duracion-efectiva', 2, 2],
  ['empresas-locales', 2, 2],
  ['verificabilidad', 3, 3],
  ['vigilancia-datos', 4, 2],
];
for (const [id, expectedCount, columns] of analysisCards) {
  const section = sections.find((item) => item.id === id);
  const cards = (section?.blocks ?? []).filter((block) => block.type === 'miniCard');
  assert.equal(cards.length, expectedCount, `${id} must retain its original methodology card count`);
  assert.ok(cards.every((block) => block.columns === columns),
    `${id} cards must retain their original ${columns}-column layout`);
}
const legalCards = (legalSourcesSection?.blocks ?? []).filter((block) => block.type === 'miniCard');
assert.equal(legalCards.length, 7, 'the legal source groups must retain their seven structured source cards');
assert.equal((legalSourcesSection?.blocks ?? []).filter((block) => block.type === 'heading' && block.card).length, 6,
  'the six legal-source groups must retain their separate visual hierarchy');
const internalMethodologyLinks = [
  ['verificabilidad', '/licitaciones', '/analisis'],
  ['vigilancia-datos', '/seguimiento', '/datos'],
  ['fuentes-juridicas', '/aviso-legal', '/privacidad', '/rectificacion'],
];
for (const [id, ...routes] of internalMethodologyLinks) {
  const section = sections.find((item) => item.id === id);
  const text = (section?.blocks ?? []).map((block) => block.text ?? '').join(' ');
  for (const route of routes) {
    assert.ok(text.includes(`](${route})`), `${id} must preserve its internal navigation link to ${route}`);
  }
}
const methodologyTables = sections.flatMap((section) => section.blocks ?? []).filter((block) => block.type === 'table');
assert.equal(methodologyTables.length, 1, 'the historical coverage table must remain a structured table');
for (const table of methodologyTables) {
  assert.ok(Array.isArray(table.headers) && table.headers.length > 0, 'methodology tables must define headers');
  assert.ok(Array.isArray(table.rows) && table.rows.length > 0, 'methodology tables must define rows');
  for (const row of table.rows) {
    assert.equal(row.length, table.headers.length, 'every methodology table row must match the header count');
  }
}
const methodologyContentCount = sections.reduce((total, section) => total + (section.blocks ?? []).reduce((sectionTotal, block) => (
  sectionTotal + 1 + (block.type === 'subcard' || block.type === 'miniCard' || (block.type === 'heading' && block.card) ? 1 : 0)
), 0), 0);
assert.ok(methodologyContentCount > 300,
  'methodology text and structured card metadata must be preserved');
assert.ok(methodologyText.includes('Organismo / Entidad') && methodologyText.includes('Ayuntamiento de Alcázar'),
  'the historical coverage table content must be retained');
for (const phrase of [
  'Versión 2.1 · Actualizado 2026',
  'art. 5.1.c RGPD',
  'art. 6.1.f RGPD',
  'antiguo art. 118.3',
  'convención analítica propia del portal',
  'STS núm. 1119/2025',
]) {
  assert.ok(methodologyText.includes(phrase), `methodology is missing: ${phrase}`);
}

assert.ok(Array.isArray(historical.periods) && historical.periods.length > 0,
  'historical coverage periods must be present');
assert.ok(Array.isArray(site.localSupplierNifs) && site.localSupplierNifs.length > 0,
  'the local supplier NIF catalogue must be configured');

console.log('Instance configuration validated: LicitAlcázar, 10 authorities, 3 scopes and 20 methodology sections.');
