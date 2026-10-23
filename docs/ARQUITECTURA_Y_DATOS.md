# 📙 Arquitectura Técnica y Modelo de Datos

> **Documento de Referencia Técnica para Desarrolladores y Administradores.**  
> Este documento detalla la infraestructura, el modelo relacional, el motor de indexación FTS5 y el flujo de ingesta de datos de **LicitAlcázar**.

---

## 1. Principio Rector de Datos: PLACSP como Única Fuente de Verdad

Uno de los pilares del proyecto es **la neutralidad e inalterabilidad de los datos**:

- **Fuente Oficial**: Los datos proceden exclusivamente de los feeds sindicados y volcados de datos abiertos de la **Plataforma de Contratación del Sector Público (PLACSP)** dependiente del Ministerio de Hacienda de España.
- **Por qué NO se extraen datos directamente de webs municipales**:
  1. **Prevención de duplicidades**: Los portales locales a menudo publican anuncios provisionales que no se corresponden con el expediente definitivo.
  2. **Datos no auditados o endulzados**: El portal municipal puede omitir contratos menores, modificar estados o no reflejar reclamaciones o recursos ante el Tribunal Administrativo de Recursos Contractuales (TACRC).
  3. **Trazabilidad jurídica**: Cada contrato en LicitAlcázar conserva su identificador URI canónico oficial de la PLACSP, permitiendo comprobar en cualquier momento el documento original.

---

## 2. Esquema de Base de Datos SQLite

La base de datos física reside en `data/licitaciones_alcazar.db`.

### Tabla Principal: `licitaciones`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | URI oficial canónico del contrato en la PLACSP. |
| `expediente` | `TEXT` | Código del expediente administrativo municipal (ej. `11/2025 Obras PRTR`). |
| `objeto` | `TEXT NOT NULL` | Descripción del objeto del contrato. |
| `contracting_authority_name` | `TEXT NOT NULL` | Denominación completa del órgano de contratación. |
| `contracting_authority_name` | `TEXT NOT NULL` | Entidad normalizada (ej. *Ayuntamiento*, *Aguas de Alcázar*, *Patronato*). |
| `contracting_authority_nif` | `TEXT NOT NULL` | NIF institucional de la entidad pública contratante. |
| `tipo_contrato` | `TEXT NOT NULL` | Obras, Servicios, Suministros, Concesión de servicios, Patrimonial. |
| `procedimiento` | `TEXT NOT NULL` | Abierto, Contrato menor, Basado en sistema dinámico, Negociado con publicidad. |
| `estado` | `TEXT NOT NULL` | Resuelta, Adjudicada, Formalizada, Anulada, Desierta. |
| `importe_sin_iva` | `REAL` | Presupuesto Base de Licitación (PBL) sin impuestos. |
| `importe_con_iva` | `REAL` | Presupuesto Base de Licitación con IVA. |
| `importe_adjudicacion` | `REAL` | Importe de adjudicación publicado. Su interpretación económica depende de `tipo_importe_adjudicacion`. |
| `importe_adj_con_iva` | `REAL` | Importe de adjudicación con IVA cuando la fuente lo proporciona; su interpretación depende de `tipo_importe_adjudicacion`. |
| `tipo_importe_adjudicacion` | `TEXT` | Semántica del importe de adjudicación: `total`, `unitario`, `desconocido` o `NULL` para datos legacy. |
| `adjudicatario` | `TEXT` | Razón social o denominación de la empresa adjudicataria. |
| `nif_adjudicatario` | `TEXT` | CIF/NIF del contratista. |
| `num_ofertas` | `INTEGER` | Número de empresas o proposiciones presentadas. |
| `es_pyme` | `INTEGER` | `1` si el adjudicatario es PYME, `0` si es gran empresa. |
| `cpv_principal` | `TEXT` | Código de la nomenclatura común de contratos públicos (CPV). |
| `duracion` | `TEXT` | Plazo de ejecución del contrato. |
| `duracion_unidad` | `TEXT` | Unidad del plazo (`MON` meses, `ANN` años, `DAY` días). |
| `financiacion_ue` | `TEXT` | `1` o `EU` si cuenta con aportación comunitaria; `NO-EU` o `0` si no. |
| `fecha_limite` | `TEXT` | Fecha y hora límite para presentar proposiciones. |
| `fecha_adjudicacion` | `TEXT` | Fecha del acuerdo formal de adjudicación. |
| `fecha_publicacion` | `TEXT` | Fecha de publicación en la PLACSP. |
| `url` | `TEXT` | Enlace permanente a la sede electrónica de la PLACSP. |
| `conjunto` | `TEXT` | `licitaciones` (mayores) o `menores` (contratos menores). |
| `year` | `INTEGER` | Año natural del ejercicio de tramitación (cobertura completa desde 2018 LCSP, parcial antes). |
| `scope` | `TEXT` | `Directa Municipal` o `Indirecta (Mancomunidad)`. |

### Semántica económica de los importes de adjudicación

`importe_adjudicacion` no debe interpretarse automáticamente como un importe total comparable con el PBL. La columna `tipo_importe_adjudicacion` clasifica su semántica:

- **`total`**: importe total de adjudicación; puede utilizarse en comparaciones económicas con el PBL.
- **`unitario`**: precio unitario, tarifa o canon periódico; no debe tratarse como valor total del contrato.
- **`desconocido`**: la semántica económica no está suficientemente determinada; no debe utilizarse en cálculos económicos comparables.
- **`NULL`**: dato legacy anterior a la clasificación; por compatibilidad se trata como comparable con `total` mientras no exista evidencia que indique lo contrario.

Regla canónica para cálculos económicos comparables:

```sql
award_amount_type IS NULL OR award_amount_type = 'total'
```

Los valores `unitario` y `desconocido` pueden conservarse y mostrarse como datos publicados, pero no deben alimentar porcentajes de baja, ahorro, volumen económico, sobrecostes u otras métricas que presupongan un importe total comparable.

### Índices B-Tree de Alto Rendimiento

Para garantizar respuestas en menos de 5 milisegundos en todas las consultas:

```sql
CREATE INDEX IF NOT EXISTS idx_lic_organo_agr ON licitaciones(contracting_authority_name);
CREATE INDEX IF NOT EXISTS idx_lic_adjudicatario ON licitaciones(adjudicatario);
CREATE INDEX IF NOT EXISTS idx_lic_nif_adj ON licitaciones(nif_adjudicatario);
CREATE INDEX IF NOT EXISTS idx_lic_fecha ON licitaciones(coalesce(fecha_publicacion, fecha_adjudicacion) DESC);
CREATE INDEX IF NOT EXISTS idx_lic_importe ON licitaciones(coalesce(importe_adjudicacion, importe_sin_iva, 0) DESC);
CREATE INDEX IF NOT EXISTS idx_lic_ano ON licitaciones(year);
CREATE INDEX IF NOT EXISTS idx_lic_conjunto ON licitaciones(conjunto);
```

### Motor de Búsqueda de Texto Completo: Virtual Table `licitaciones_fts`

Permite la búsqueda instantánea por cualquier fragmento o término:

```sql
CREATE VIRTUAL TABLE licitaciones_fts USING fts5(
  id UNINDEXED, 
  expediente, 
  objeto, 
  contracting_authority_name, 
  adjudicatario, 
  cpv_principal,
  content=licitaciones, 
  content_rowid=rowid
);
```

---

## 3. Capa de Datos (`src/lib/db.ts`)

La capa de acceso a datos aprovecha el módulo **`node:sqlite` nativo** (`DatabaseSync`), sin necesidad de compilaciones en C++ ni dependencias de terceros como `better-sqlite3`.

### Función de Desacoplamiento RSC: `toPlain<T>`
Next.js y React Server Components requieren que los datos transferidos entre el servidor y los componentes cliente sean objetos planos con prototipo estándar de JavaScript (`Object.prototype`). `toPlain` transforma recursivamente las estructuras devueltas por el motor SQLite para evitar errores de serialización.

### Funciones Principales

1. `getLicitaciones(opts: FilterOptions)`:
   - Aplica filtros dinámicos (búsqueda FTS5, organismo, año, tipo, procedimiento, importes y banderas rojas).
   - Realiza paginación server-side y cálculo de total de registros.
2. `getLicitacionById(id: string)`:
   - Devuelve la ficha completa, contratos relacionados del mismo organismo, cálculo de días de resolución y la evaluación individualizada de banderas rojas.
3. `evaluarRedFlags(lic: any)`:
   - Algoritmo en memoria que analiza el expediente y devuelve el array de alertas aplicables con su nivel de gravedad.
4. `searchQuick(query: string)`:
   - Ejecuta una consulta combinada FTS5 + `LIKE` simultánea sobre licitaciones (máx. 5), empresas (máx. 4) y organismos (máx. 3) en menos de 2 ms para alimentar el Command Palette.
5. `getRedFlagsStats()`:
   - Calcula las cifras agregadas de alertas y los expedientes más significativos para el panel de `/analisis`.

---

## 4. Estructura de Páginas y Componentes

```
src/
├── app/
│   ├── layout.tsx             # Root layout con Navbar, Footer y CommandPalette
│   ├── page.tsx               # Dashboard central con KPIs y rankings
│   ├── licitaciones/
│   │   ├── page.tsx           # Explorador facetado con píldoras de alertas y CSV
│   │   └── [id]/page.tsx      # Ficha técnica de detalle con Auditoría Red Flags
│   ├── organismos/
│   │   ├── page.tsx           # Directorio de órganos de contratación
│   │   └── [id]/page.tsx      # Perfil institucional y evolución del organismo
│   ├── empresas/
│   │   ├── page.tsx           # Ranking de adjudicatarios y buscador CIF
│   │   └── [id]/page.tsx      # Ficha de empresa (menores vs mayores)
│   ├── analisis/
│   │   └── page.tsx           # Panel de auditoría, radar de menores y concurrencia
│   └── api/                   # Rutas REST serverless
│       ├── search-quick/
│       ├── licitaciones/
│       ├── empresas/
│       ├── organismos/
│       ├── stats/
│       ├── filters/
│       └── sync/
├── components/
│   ├── CommandPalette.tsx     # Buscador flotante modal (Ctrl+K)
│   ├── Navbar.tsx             # Cabecera con selector de paleta y estado de sync
│   ├── Footer.tsx             # Pie con atribución legal y enlaces oficiales
│   └── Badge.tsx              # Componentes visuales de estado, tipo y procedimiento
└── lib/
    ├── db.ts                  # Núcleo de base de datos SQLite y auditoría
    └── format.ts              # Formateadores monetarios (EUR) y de fechas
```

---

## 5. Scripts de Mantenimiento

Los scripts auxiliares se encuentran en el directorio `scripts/`:

- **`scripts/build-db.js`**: Optimiza la base de datos ejecutando `VACUUM`, `ANALYZE` y recreando los índices FTS5.
- **`scripts/filter-municipal-data.js`**: Aísla con precisión quirúrgica el perímetro municipal de Alcázar de San Juan frente a licitaciones externas o regionales.
- **`scripts/sync.js`**: Comprueba y sincroniza de forma incremental los nuevos contratos volcados en la Plataforma del Estado.
