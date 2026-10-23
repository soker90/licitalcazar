# 🏛️ LicitAlcázar — Design System & Guidelines (Mintlify Brand System)

> **Documento Canónico de Diseño para Desarrolladores y Modelos de Inteligencia Artificial.**  
> Toda nueva funcionalidad, página o componente creado en este proyecto DEBE adherirse estrictamente a las especificaciones y tokens definidos en este archivo.

---

## 1. Identidad y Filosofía Visual

La interfaz de **LicitAlcázar** se basa en el sistema de diseño de **Mintlify**: una estética limpia, enfocada en la claridad técnica, legibilidad extrema y refinamiento editorial de productos developer-first.

- **Canvas Principal**: Blanco puro (`#ffffff`) y superficies muy suaves (`#f8fafb` / `#fafafa`).
- **Acento de Marca**: Verde menta Mintlify (`#00d4a4` / `#0d9373`) reservado para elementos activos, botones primarios, enlaces clave e indicadores de éxito.
- **Bordes Hairline**: Separadores y bordes de tarjetas sutiles y limpios de 1px (`#e2e8f0` / `#e5e5e5`).
- **Textos de Alto Contraste**: Títulos en carbón profundo (`#1e293b` / `#0a0a0a`) y subtítulos en pizarra neutra (`#64748b`).

---

## 2. Paleta de Colores Oficial (Tokens)

### Colores de Marca y Acento
| Token | Hex | Uso |
|---|---|---|
| `--color-brand-green` | `#00d4a4` | Verde menta vivo: acentos, botones destacados, gradientes |
| `--color-brand-green-deep` | `#00b48a` | Verde menta profundo: estados hover y activos |
| `--color-mint-dark` | `#0d9373` | Verde menta texto: enlaces, iconos y etiquetas legibles |
| `--color-mint-glow` | `#ecfdf5` | Verde menta fondo suave: píldoras, tags y avisos de éxito |
| `--color-mint-light` | `#d1fae5` | Verde menta borde suave: bordes de píldoras y tags |

### Superficies y Fondos
| Token | Hex | Uso |
|---|---|---|
| `--color-canvas` | `#ffffff` | Fondo principal de la página y tarjetas |
| `--color-snow` | `#f8fafb` | Fondo secundario de contraste suave y bloques de contenido |
| `--color-cloud` | `#f1f5f7` | Fondo hover para botones secundarios y filas de tabla |
| `--color-surface-code` | `#1c1c1e` | Fondo para snippets técnicos, códigos y tarjetas de alto contraste |

### Bordes y Separadores
| Token | Hex | Uso |
|---|---|---|
| `--color-hairline` | `#e2e8f0` | Borde por defecto para tarjetas, divisores e inputs |
| `--color-hairline-medium`| `#cbd5e1` | Borde hover de tarjetas y elementos enfocados |
| `--color-hairline-soft` | `#ededed` | Líneas tenues horizontales y guías de gráficos |

### Tipografía y Texto
| Token | Hex | Uso |
|---|---|---|
| `--color-ink` | `#0a0a0a` | Títulos principales y cifras destacadas |
| `--color-charcoal` | `#1e293b` | Encabezados de sección y texto en negrita |
| `--color-iron` | `#374151` | Cuerpo de texto estándar |
| `--color-slate` | `#64748b` | Subtítulos, metadatos y etiquetas secundarias |
| `--color-muted` | `#94a3b8` | Placeholders y textos secundarios de menor prioridad |

### Estados Funcionales
- **Información / Tag**: Azul `#3772cf` / Fondo `#eff6ff` / Borde `#dbeafe`
- **Advertencia**: Ámbar `#c37d0d` / Fondo `#fffbeb` / Borde `#fef3c7`
- **Error / Anulada**: Rojo `#dc2626` / Fondo `#fef2f2` / Borde `#fee2e2`

---

## 3. Tipografía Oficial

1. **Fuente de Interfaz (Sans-serif)**: **`Inter`** (`var(--font-sans)`)
   - Pesos: 400 (regular), 500 (medium), 600 (semibold), 700 (bold).
   - Títulos con tracking ligeramente negativo: `-0.025em` para `h1` y `h2`.
2. **Fuente de Cifras y Códigos (Monospace)**: **`Geist Mono`** o **`JetBrains Mono`** (`var(--font-mono)`)
   - Uso obligatorio para: importes presupuestarios (`€`), códigos de expediente, NIFs, fechas y porcentajes.
   - Siempre activar `font-variant-numeric: tabular-nums` para alineación perfecta de columnas numéricas.

---

## 4. Patrones de Componentes Mintlify

### Tarjetas (`.mint-card` / `.component-card`)
- Fondo blanco (`#ffffff`).
- Borde fino: `1px solid #e2e8f0`.
- Radio de esquinas: `rounded-xl` (`12px` a `16px`).
- Sombra sutil: `box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05)`.
- Estado hover: Transición suave, el borde pasa a `#cbd5e1` y una microelevación sutil.

### Píldoras y Tags (`.mint-pill`)
- Radio: `rounded-full` (`9999px`).
- Tamaño compacto: `text-[11px]` o `text-xs`, padding `px-2.5 py-0.5`.
- Tag verde Mintlify: `bg-[#ecfdf5] border border-[#d1fae5] text-[#0d9373] font-medium`.

### Botones (`.btn`)
- **Botón Primario (Black Pill)**:
  `bg-[#0a0a0a] text-white hover:bg-[#1e293b] rounded-lg px-4 py-2 text-xs font-semibold shadow-sm transition-all`
- **Botón Acento (Mint Button)**:
  `bg-[#00d4a4] text-[#0a0a0a] hover:bg-[#00b48a] rounded-lg px-4 py-2 text-xs font-bold shadow-sm transition-all`
- **Botón Secundario**:
  `bg-white text-[#1e293b] border border-[#e2e8f0] hover:bg-[#f8fafb] hover:border-[#cbd5e1] rounded-lg px-4 py-2 text-xs font-semibold shadow-xs`

### Buscador Central (Search Bar)
- Caja limpia con fondo blanco, borde `#e2e8f0`, icono de búsqueda `#94a3b8`.
- Focus state: Borde cambia a `#00d4a4` con anillo suave `ring-2 ring-[#00d4a4]/20`.

### Iluminación Atmosférica del Hero
- Fondo con lavado radial sutil en verde menta:
  `radial-gradient(circle at 50% 0%, rgba(0, 212, 164, 0.08) 0%, transparent 60%)`

---

## 5. Directrices Obligatorias para IAs y Desarrolladores

1. **NO utilizar fondos negros profundos genéricos ni degradados púrpura/neón**: La web debe proyectar la estética limpia, luminosa y profesional de Mintlify.
2. **Utilizar siempre los tokens de color definidos**: No inventar nuevos tonos de verde ni nuevos grises; usar las variables `--color-brand-green`, `--color-hairline`, etc.
3. **Mantener siempre `tabular-nums` y monoespaciado en importes**: Los importes en euros siempre deben usar `font-mono tabular-nums font-bold`.
4. **Respetar la semántica de los badges**: Estado adjudicada siempre en verde menta, en plazo en ámbar suave, resuelta en azul suave.
