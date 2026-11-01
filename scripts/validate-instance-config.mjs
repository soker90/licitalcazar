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
assert.ok(!site.headerBrandSuffix, 'the discarded v2 brand suffix must not be displayed');
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
assert.ok(sections.reduce((total, section) => total + (section.blocks?.length ?? 0), 0) > 300,
  'methodology text outside paragraphs and headings must be preserved');
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
