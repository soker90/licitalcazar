# 🏛️ LicitAlcázar — Inteligencia y Auditoría de Contratación Pública (V2)

> **Portal cívico independiente de datos abiertos y fiscalización de la contratación pública en Alcázar de San Juan (Ciudad Real).**  
> Basado al **100% en los registros oficiales inalterables de la Plataforma de Contratación del Sector Público (PLACSP)** y diseñado bajo la estética de **Mintlify**.

[![Version](https://img.shields.io/badge/Version-2.0.0-emerald?style=flat-square)](#)
[![Next.js 15](https://img.shields.io/badge/Next.js-15.5_(Turbopack)-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.1-blue?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11.3-orange?style=flat-square&logo=pnpm)](https://pnpm.io/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.0-38bdf8?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![SQLite FTS5](https://img.shields.io/badge/SQLite-FTS5_(node:sqlite)-003B57?style=flat-square&logo=sqlite)](https://nodejs.org/)
[![RSS 2.0](https://img.shields.io/badge/RSS-Feed_2.0-orange?style=flat-square)](public/feed.xml)

---

## 📌 Datos Clave del Ecosistema Municipal

Todos los datos se obtienen directamente de los conjuntos de datos abiertos sindicados de la **Plataforma de Contratación del Sector Público (PLACSP)**, sin intermediación de portales de transparencia municipales que puedan duplicar o endulzar la información.

| Métrica | Registro Oficial PLACSP |
|---|---|
| **Contratos Municipales Auditados** | **+2.000 contratos** (cobertura completa desde 2018 LCSP, parcial antes) |
| **Volumen Económico Adjudicado** | **128,4 M€ Total Consolidado** (*114,4 M€ Solo Ayuntamiento · 14,0 M€ Comsermancha*) |
| **Proveedores y Empresas Adjudicatarias** | **> 1.000 empresas identificadas por NIF/CIF y grupos corporativos** |
| **Señales de Auditoría Precalculadas** | **361 alertas V2** (menores recurrentes, licitador único, bajas acusadas) |
| **Tiempo Medio de Resolución Administrativa** | **33,6 días** (entre fin de ofertas y decreto de adjudicación) |
| **Baja Media Ofertada s/Precio Máximo** | **-12,4% global** (*-38,4% en licitaciones con competencia activa*) |

### Ámbitos Institucionales

- **Solo Ayuntamiento de Alcázar de San Juan**:
  - Ayuntamiento (Pleno, Junta de Gobierno y Concejalías Delegadas)
  - Aguas de Alcázar, Empresa Municipal, S.A.U. (EMSA)
  - Patronato Municipal de Cultura y Turismo
  - Instituto Municipal de Deportes (IMD)
- **Mancomunidad COMSERMANCHA**:
  - Consorcio de gestión de residuos para 21 municipios de Ciudad Real, Toledo y Cuenca con sede física en Alcázar.

---

## ✨ Funcionalidades Principales (V2)

### 1. 🛡️ Centro de Auditoría y Control Cívico (`/auditoria`)
- **361 señales analíticas precalculadas** en SQLite con triple nivel de severidad (ALTA, MEDIA, INFORMATIVA).
- Desglose de factores en **lenguaje ciudadano** (sin jerga administrativa), indicando el peso porcentual ponderado (+X% peso) y el nivel de certeza analítica (0-100%).
- Algoritmo multicriterio de **agrupación de contratos menores relacionados** para supervisar el art. 118 de la Ley 9/2017 (LCSP).
- Paginación cliente completa (15 alertas/pág) y ordenación predeterminada por mayor severidad y certeza.
- Botón directo de **exportación de señales a CSV** para Excel.

### 2. 🔭 Vigilancia Activa de Licitaciones (`/seguimiento`)
- **Licitaciones Abiertas**: Convocatorias en plazo con cálculo automático de **días hábiles reales** restantes (lunes a viernes).
- **Contratos Próximos a Vencer**: Selector de horizontes (30, 60, 90, 180 días) con análisis de régimen de prórroga conforme al **Art. 29 LCSP**.

### 3. 📂 Portal de Datos Abiertos y Exportación (`/datos`)
- Descarga en un clic de los datasets completos en **CSV con BOM UTF-8 (`\uFEFF`) y RFC 4180** (apertura nativa en Excel sin desconfiguración) y **JSON**:
  - *Licitaciones y contratos municipales* (+2.000 registros).
  - *Directorio de empresas y grupos societarios* (540+ contratistas).
  - *Catálogo de alertas de auditoría*.
- Endpoints REST programáticos (`/api/export/licitaciones`, `/api/export/empresas`, `/api/export/alertas`).

### 4. 📡 Sindicación Cívica RSS 2.0 (`/feed.xml`)
- Canal RSS 2.0 con autodescubrimiento en el navegador para suscripción en lectores (Feedly, Thunderbird, Slack o bots) con convocatorias abiertas y alertas de alta severidad.

### 5. ⏱️ Cronometría Integral y Ficha Dossier V2 (`/licitaciones/[id]`)
- Línea temporal horizontal de ciclo de vida contractual (publicación, ofertas, adjudicación, formalización, ejecución y modificaciones).
- Cronometría matemática que mide los 4 hitos del contrato (LCSP arts. 29 y 153).
- Modo dual interactivo: **Vista Ciudadana** vs **Vista Investigación** (con identificadores CODICE oficiales y descarga de XML original de PLACSP).

---

## 🛠️ Pila Tecnológica y Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                      Next.js 15 (App Router)                │
│   React 19 Server Components + Turbopack + Tailwind CSS v4  │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌──────────────────────┐              ┌──────────────────────┐
│  Páginas Públicas   │              │   API Endpoints      │
│  / (Dashboard)       │              │  /api/search-quick   │
│  /licitaciones       │              │  /api/licitaciones   │
│  /organismos         │              │  /api/empresas       │
│  /empresas           │              │  /api/organismos     │
│  /analisis           │              │  /api/stats          │
└───────────┬──────────┘              └──────────┬───────────┘
            │                                    │
            └──────────────────┬─────────────────┘
                               ▼
            ┌────────────────────────────────────┐
            │       Motor de Datos (lib/db.ts)   │
            │   evaluarRedFlags + searchQuick    │
            └──────────────────┬─────────────────┘
                               ▼
            ┌────────────────────────────────────┐
            │   SQLite FTS5 (node:sqlite nativo) │
            │      data/licitaciones_alcazar.db  │
            └────────────────────────────────────┘
```

- **Runtime**: **Node.js 100% nativo** (sin dependencias de Python ni compiladores externos de C++).
- **Driver de BD**: `node:sqlite` (`DatabaseSync`), integrado en el core de Node v22/v26.
- **Búsqueda**: Virtual Table **FTS5** con tokenizador por prefijos para autocompletado en milisegundos.
- **Sistema de Diseño**: [Mintlify Brand Package](DESIGN.md) (colores oficiales `#00d4a4`, `#0d9373`, `#ecfdf5`, `#f8fafb`, tipografías Inter y Geist Mono con cifras `tabular-nums`).

---

## 📥 Actualización de datos

Los paquetes ZIP de PLACSP son temporales: los workflows de GitHub Actions los descargan al ejecutar la sincronización y actualizan la base SQLite versionada en `data/`. No es necesario guardar ZIP en el repositorio. Para sincronizar manualmente, ejecuta `pnpm run sync -- --year=2026 --download`.

## 🚀 Instalación y Despliegue

### Requisitos Previos
- **Node.js**: v20.x o superior (recomendado v22 o v26).
- **pnpm**: v10 o v11 (`corepack enable pnpm`).

### 1. Clonar el repositorio e instalar dependencias
```bash
git clone https://github.com/soker90/licitalcazar.git
cd licitalcazar
pnpm install
```

### 2. Iniciar en Modo Desarrollo (Turbopack)
```bash
pnpm dev
```
La aplicación estará disponible en [http://localhost:3000](http://localhost:3000).

### 3. Compilación y Ejecución en Producción
```bash
pnpm build
pnpm start
```

---

## 📡 API REST Interna

El sistema expone endpoints JSON optimizados:

| Método | Endpoint | Parámetros Clave | Descripción |
|---|---|---|---|
| `GET` | `/api/search-quick` | `q` | Búsqueda global ultrarrápida (< 2 ms) para Command Palette. |
| `GET` | `/api/licitaciones` | `q`, `alerta`, `organo`, `ano`, `tipo`, `procedimiento`, `page`, `limit`, `sort` | Listado paginado de contratos con filtros y flags de alerta. |
| `GET` | `/api/licitaciones/[id]` | — | Dossier completo de una licitación, banderas rojas y contratos relacionados. |
| `GET` | `/api/empresas` | `q`, `sort`, `page`, `limit` | Ranking de empresas adjudicatarias con desglose de contratos. |
| `GET` | `/api/empresas/[id]` | — | Perfil detallado de un proveedor: contratos menores vs mayores y CIF. |
| `GET` | `/api/organismos` | — | Listado y métricas de los órganos de contratación. |
| `GET` | `/api/stats` | — | Estadísticas globales, evolución presupuestaria y resumen de alertas. |
| `GET` | `/api/filters` | — | Valores distintos para filtros facetados. |
| `GET` | `/api/sync` | — | Estado y estadísticas de la base de datos local; no ejecuta la ingesta de datos. |

---

## 📚 Documentación Adicional

- [📘 Metodología de Indicadores y Banderas Rojas](docs/INDICADORES_AUDITORIA.md): Explicación técnica y jurídica (OCDE, UE y LCSP) de cada métrica de control.
- [📙 Arquitectura Técnica y Modelo de Datos](docs/ARQUITECTURA_Y_DATOS.md): Esquema relacional SQLite, índice FTS5, flujo de ingesta y normalización de contratos menores.
- [🎨 Guía de Estilo y Sistema de Diseño](DESIGN.md): Especificación canónica de tokens, colores, tipografías y componentes Mintlify.

---

## ⚖️ Licencia y Fuentes de Datos

- **Código fuente**: Licencia **GPL-3.0**.
- **Fuente de los datos**: Registros públicos de la [Plataforma de Contratación del Sector Público](https://contrataciondelestado.es/) del Ministerio de Hacienda de España, reutilizados de conformidad con la Ley 37/2007 sobre reutilización de la información del sector público y la Ley 9/2017 (LCSP).
