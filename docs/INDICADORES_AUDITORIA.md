# 📘 Metodología de Indicadores Analíticos y Señales de Riesgo

> **Guía Técnica y Conceptual para Ciudadanos, Periodistas e Investigadores.**  
> Este documento describe la fundamentación legal, económica y metodológica de las señales analíticas de riesgo implementadas en **LicitAlcázar**, alineadas con las recomendaciones de la **OCDE**, la **Comisión Europea** y la **Ley 9/2017 de Contratos del Sector Público (LCSP)**.

---

## 1. Principios Fundamentales de la Contratación Pública

La contratación del sector público representa aproximadamente el **10-15% del PIB en España**. De acuerdo con el artículo 1 de la Ley 9/2017 (LCSP), la contratación pública debe regirse por:
1. **Libertad de acceso a las licitaciones**.
2. **Publicidad y transparencia** de los procedimientos.
3. **No discriminación e igualdad de trato** entre los licitadores.
4. **Eficiencia en la utilización de los fondos públicos**, garantizando una adecuada relación calidad-precio.

Cuando alguno de estos principios se debilita, surgen señales de riesgo conocidas en la literatura de gobernanza internacional como **«Banderas Rojas» (Red Flags)**. Una bandera roja no constituye por sí misma una prueba de irregularidad ni de ilícito, sino una **señal analítica y estadística** que aconseja una revisión pormenorizada del expediente administrativo.

---

## 2. Categorización Taxativa de Alertas (Modelo A-E)

Para salvaguardar la neutralidad y evitar juicios jurídicos automáticos, todo resultado analítico en LicitAlcázar se encuadra en una de las siguientes cinco categorías:
* **Cat. A · Dato localizado en la fuente consultada:** Parámetro o magnitud localizado directamente en una fuente oficial identificable (PLACSP o perfil de contratante).
* **Cat. B · Información no localizada en la fuente consultada:** Ausencia de documento o dato en el perfil de contratante público consultado en la fecha de extracción, sin afirmar su inexistencia en el expediente administrativo.
* **Cat. C · Indicador estadístico o analítico:** Señal cuantitativa, estadística o analítica que orienta la consulta sin calificar la legalidad del contrato.
* **Cat. D · Posible incidencia que requiere examinar el expediente:** Señal formal o acumulación cuantitativa que requiere necesariamente examinar el expediente administrativo completo.
* **Cat. E · Criterio o resolución externa:** Resoluciones, informes, dictámenes o sentencias emitidas por órganos externos competentes, distinguidas según su naturaleza:
  * **E1:** Sentencia firme, solo si la firmeza consta.
  * **E2:** Sentencia cuyo estado de firmeza no consta o no es firme.
  * **E3:** Resolución administrativa o de órgano de recursos.
  * **E4:** Informe externo de fiscalización.
  * **E5:** Criterio o recomendación no vinculante cuando esa naturaleza conste.

---

## 3. Esquema Técnico Real de la Base de Datos (Tabla `alertas`)

La estructura de datos implementada en la base de datos relacional SQLite (`data/licitaciones_alcazar.db`) comprende **24 columnas reales**, diseñadas para satisfacer los requisitos de gobernanza algorítmica, neutralidad y trazabilidad:

| # | Columna SQLite | Tipo | Nullable | Función en el sistema | Control y salvaguarda metodológica |
|---|---|---|---|---|---|
| 1 | `id` | TEXT | NO (PK) | Identificador unívoco del resultado (ej. `REL_...`, `UNICA_...`, `BAJA_...`) | Trazabilidad unívoca |
| 2 | `categoria` | TEXT | NO | Categoría del modelo (`A`, `B`, `C`, `D`, `E`) | Taxonomía neutral; prohíbe calificaciones de ilegalidad |
| 3 | `tipo` | TEXT | NO | Código tipológico del indicador | Clasificación técnica analítica |
| 4 | `severidad` | TEXT | NO | Prioridad de revisión (`ALTA`, `MEDIA`, `INFORMATIVA`) | Compatibilidad visual de interfaz |
| 5 | `nivel` | TEXT | NO | Nivel analítico normalizado (`alta`, `media`, `informativa`) | Escala homogénea de priorización |
| 6 | `score_escala` | REAL | NO | Puntuación interna de priorización | Métrica estadística, no juicio legal |
| 7 | `confianza` | REAL | NO | Métrica interna de consistencia o completitud analítica | Evaluación de consistencia de los datos |
| 8 | `titulo` | TEXT | NO | Enunciado descriptivo de la señal | Redacción objetiva libre de términos incriminatorios |
| 9 | `descripcion` | TEXT | NO | Explicación detallada con fórmulas garantistas | Incorpora advertencia preceptiva de no presunción |
| 10 | `dato_objetivo` | TEXT | NO | Magnitud o hecho aritmético contrastable | Dato empírico extraído de PLACSP |
| 11 | `fuente` | TEXT | NO | Denominación de la fuente oficial | PLACSP / Perfil de contratante |
| 12 | `url_fuente` | TEXT | NO | Enlace canónico al expediente oficial | «Enlace oficial no disponible...» si no existe |
| 13 | `fecha_extraccion` | TEXT | NO | Marca temporal ISO de captura del dato | Trazabilidad cronológica de los datos |
| 14 | `regla_aplicada` | TEXT | NO | Precepto identificado o regla metodológica aplicada | Cita de norma sustantiva aplicable |
| 15 | `version_metodologia` | TEXT | NO | Versión del marco analítico (`v2.1`) | Versionado y reproducibilidad |
| 16 | `limitaciones` | TEXT | NO | Advertencia de límites inherentes a los datos | Evita inferencias no fundadas |
| 17 | `explicacion_alternativa`| TEXT | NO | Hipótesis legítima operativa o de mercado | Garantía de neutralidad y tutela reputacional |
| 18 | `requiere_revision_humana`| INTEGER | NO | Indicación técnica de que se recomienda revisar la documentación disponible y, cuando proceda, el expediente | Impide automatismos sancionadores |
| 19 | `evidencia` | TEXT | NO | Resumen de los datos utilizados para el cálculo | Base de datos utilizados para el cálculo |
| 20 | `factores_json` | TEXT | NO | Desglose en formato JSON de factores analizados | Explicabilidad del cálculo |
| 21 | `patron_continuidad` | TEXT | SÍ | Subclasificación de recurrencia | Distingue recurrencia ordinaria de posibles patrones |
| 22 | `explicaciones_json` | TEXT | SÍ | Lista JSON de explicaciones alternativas | Desglose pormenorizado de hipótesis |
| 23 | `documentos_json` | TEXT | SÍ | Documentos localizados o recomendados para consulta, según el contenido disponible | Orientación para el examen del expediente |
| 24 | `fecha_creacion` | TEXT | NO | Fecha registrada de generación | Registro temporal interno |

---

## 4. Catálogo Sistemático de los 17 Indicadores Analíticos

Cada uno de los 17 indicadores se desarrolla conforme a las siete dimensiones metodológicas exigidas:
1. Denominación descriptiva y neutral.
2. Hecho objetivo que detecta.
3. Base legal aplicable (norma vigente con rango y artículo).
4. Criterio técnico / umbral cuantitativo.
5. Explicaciones alternativas legítimas.
6. Documentos del expediente administrativo que deben consultarse.
7. Texto estandarizado de la alerta.

---

### Indicador 1: Acumulación Cuantitativa de Contratos Menores (`CONTRATOS_RELACIONADOS`)
* **Categoría:** Cat. D (Posible incidencia que requiere examinar el expediente).
* **Hecho objetivo:** Un mismo proveedor acumula contratos menores ante el mismo órgano de contratación cuya suma en una ventana deslizante de 365 días supera los umbrales cuantitativos de referencia del art. 118 LCSP.
* **Base legal:** Artículos 118 y 99.2 de la Ley 9/2017 (LCSP). Modificación de doctrina por el RDL 3/2020 y Criterios interpretativos de la OIRESCON.
* **Criterio técnico:** Suma acumulada en ventana deslizante de 365 días $\ge 15.000$ € (servicios/suministros) o $\ge 40.000$ € (obras) con análisis de similitud léxica/CPV entre prestaciones.
* **Explicaciones alternativas:** Prestaciones con sustantividad propia y objeto netamente diferenciado; necesidades sobrevenidas imprevisibles; contratos tramitados en ejercicios presupuestarios independientes; falta transitoria de licitación abierta por recursos en tramitación.
* **Documentos a consultar:** Memoria justificativa del órgano de contratación sobre la necesidad; informes de intervención municipal; Plan Anual de Contratación; decreto de aprobación del gasto.
* **Texto estandarizado:**
  > *«Se ha detectado una acumulación de contratos menores con elementos coincidentes durante el periodo analizado. La coincidencia temporal, la similitud del objeto, la repetición del proveedor o la suma de importes son parámetros de priorización analítica. No permiten concluir por sí solos que exista fraccionamiento indebido. La valoración exige examinar la unidad funcional, la previsibilidad de la necesidad, la planificación, la homogeneidad de las prestaciones y el expediente completo.»*

---

### Indicador 2: Oferta Única en Concurso Público (`OFERTA_UNICA`)
* **Categoría:** Cat. A (Dato localizado en una fuente identificable) / Cat. C (Indicador estadístico o analítico).
* **Hecho objetivo:** Concurrencia limitada a una única oferta admisible registrada en un procedimiento competitivo abierto o restringido.
* **Base legal:** Artículos 132 y 157 de la Ley 9/2017 (LCSP). Directiva 2014/24/UE y directrices de la OCDE sobre competencia en la contratación pública.
* **Criterio técnico:** Procedimiento competitivo con número de ofertas admitidas igual a 1 en estado adjudicada, formalizada o resuelta.
* **Explicaciones alternativas:** Alta especialización tecnológica o científica del objeto; estrechez de mercado en la comarca; exigencias rigurosas pero proporcionadas de solvencia técnica; concurrencia de licitaciones simultáneas en el sector.
* **Documentos a consultar:** Pliegos de Cláusulas Administrativas Particulares (PCAP) y de Prescripciones Técnicas (PPT); acta de la mesa de contratación con recepción de plicas; informe técnico de valoración de criterios.
* **Texto estandarizado:**
  > *«Se ha registrado una única oferta admitida en el procedimiento. Este dato puede justificar la consulta de los pliegos, del plazo de licitación y de las condiciones de solvencia, pero no acredita por sí mismo una restricción indebida de la competencia.»*

---

### Indicador 3: Descuento Significativo / Baja Acusada respecto al PBL (`BAJA_ACUSADA`)
* **Categoría:** Cat. C (Indicador estadístico o analítico).
* **Hecho objetivo:** Adjudicación con una rebaja porcentual relevante sobre el Presupuesto Base de Licitación (PBL).
* **Base legal:** Artículo 149 de la Ley 9/2017 (LCSP) (*Ofertas con valores anormales o desproporcionados*).
* **Criterio técnico:** Descuento $\ge 25\%$ (prioridad media) o $\ge 40\%$ (prioridad alta) respecto al PBL en procedimientos no menores.
* **Explicaciones alternativas:** Economías de escala del operador económico; optimización logística o digitalización de procesos; costes de aprovisionamiento ventajosos; presupuesto base formulado con holgura respecto a los precios de mercado.
* **Documentos a consultar:** Parámetros de anormalidad fijados en el PCAP; informe técnico de la mesa solicitando justificación de costes (art. 149.4 LCSP); alegaciones del licitador y resolución motivada de aceptación.
* **Texto estandarizado:**
  > *«Se ha detectado un descuento significativo respecto al presupuesto base de licitación. El porcentaje utilizado es un parámetro estadístico interno y no determina por sí solo que la oferta sea anormal. Deben consultarse los parámetros fijados en los pliegos y, en su caso, la justificación de la oferta.»*

---

### Indicador 4: Procedimiento Negociado sin Publicidad Previa
* **Categoría:** Cat. A (Dato localizado en una fuente identificable) / Cat. D (Posible incidencia que requiere examinar el expediente).
* **Hecho objetivo:** Adjudicación mediante procedimiento negociado sin previa publicación de anuncio de licitación.
* **Base legal:** Artículos 166 a 171 de la Ley 9/2017 (LCSP).
* **Criterio técnico:** Modalidad de procedimiento clasificada como negociado sin publicidad en los metadatos de PLACSP.
* **Explicaciones alternativas:** Derechos exclusivos de propiedad intelectual o industrial; exclusividad técnica debidamente justificada; imperiosa urgencia sobrevenida no atribuible al órgano; desierto previo de un procedimiento abierto.
* **Documentos a consultar:** Informe técnico justificativo del supuesto legal habilitante; invitaciones cursadas y actas de la negociación económica.
* **Texto estandarizado:**
  > *«Se ha utilizado un procedimiento sin publicidad previa. Debe consultarse el expediente para verificar el supuesto legal habilitante conforme a los arts. 166-171 LCSP.»*

---

### Indicador 5: Tramitación de Urgencia
* **Categoría:** Cat. A (Dato localizado en una fuente identificable).
* **Hecho objetivo:** El expediente ha sido declarado de urgencia, con reducción a la mitad de los plazos ordinarios de tramitación.
* **Base legal:** Artículo 119 de la Ley 9/2017 (LCSP).
* **Criterio técnico:** Campo oficial de tramitación consignado como urgente en PLACSP.
* **Explicaciones alternativas:** Necesidad sobrevenida que no permite dilación procesal sin grave perjuicio del interés público; vencimiento inminente de plazos de cofinanciación condicionada; continuidad de un servicio público esencial.
* **Documentos a consultar:** Resolución motivada del órgano de contratación justificando la necesidad inaplazable o la necesidad de acelerar la adjudicación.
* **Texto estandarizado:**
  > *«El expediente se ha tramitado por la vía de urgencia. La apreciación de la necesidad inaplazable o del deber de acelerar la adjudicación corresponde al órgano de contratación conforme al art. 119 LCSP.»*

---

### Indicador 6: Tramitación de Emergencia
* **Categoría:** Cat. A (Dato localizado en una fuente identificable) / Cat. C (Indicador estadístico o analítico).
* **Hecho objetivo:** Contratación directa excepcional sin expediente ordinario previo bajo el régimen del artículo 120 LCSP.
* **Base legal:** Artículo 120 de la Ley 9/2017 (LCSP).
* **Criterio técnico:** Tramitación clasificada como de emergencia en la plataforma oficial.
* **Explicaciones alternativas:** Catástrofes naturales, siniestros graves, emergencias sanitarias o situaciones de grave peligro para la seguridad ciudadana.
* **Documentos a consultar:** Acuerdo de libramiento de fondos y orden de inicio; dación de cuenta preceptiva al Pleno municipal en el plazo legal de 30 días.
* **Texto estandarizado:**
  > *«El contrato se ha tramitado por emergencia (art. 120 LCSP). Esta vía excepcional no requiere expediente ordinario previo; su justificación descansa en situaciones de catástrofe, grave peligro o necesidades de defensa nacional.»*

---

### Indicador 7: Prórrogas Contractuales
* **Categoría:** Cat. A (Dato localizado en una fuente identificable) / Cat. D (Posible incidencia que requiere examinar el expediente).
* **Hecho objetivo:** Ampliación del plazo de vigencia del contrato acordada con posterioridad a la duración inicial.
* **Base legal:** Artículo 29 de la Ley 9/2017 (LCSP).
* **Criterio técnico:** Registro oficial de acuerdo de prórroga que amplía el plazo de ejecución estipulado en el pliego inicial.
* **Explicaciones alternativas:** Ejercicio de la prórroga ordinaria expresamente prevista en el pliego; prórroga forzosa excepcional mientras se sustancia el nuevo concurso público (art. 29.4 LCSP).
* **Documentos a consultar:** Cláusula de prórrogas del PCAP inicial; decreto o acuerdo formal de prórroga con informe de conformidad del responsable del contrato.
* **Texto estandarizado:**
  > *«El contrato ha sido objeto de prórroga. Procede verificar si estaba prevista en los pliegos y si respeta los límites temporales del art. 29 LCSP.»*

---

### Indicador 8: Modificaciones Contractuales y Sobrecostes
* **Categoría:** Cat. D (Posible incidencia que requiere examinar el expediente).
* **Hecho objetivo:** Alteración de las condiciones económicas o prestaciones pactadas en el contrato adjudicado durante su fase de ejecución.
* **Base legal:** Artículos 204 y 205 de la Ley 9/2017 (LCSP).
* **Criterio técnico:** Aprobación de modificado con variación de precio o plazo respecto al contrato originario.
* **Explicaciones alternativas:** Circunstancias técnicas imprevisibles surgidas durante la ejecución de obras; aplicación de cláusulas de modificación previstas de forma clara e inequívoca en los pliegos iniciales.
* **Documentos a consultar:** Memoria técnica del director facultativo o responsable del contrato; dictamen del Consejo Consultivo de Castilla-La Mancha (cuando proceda por cuantía); informes jurídicos y de intervención.
* **Texto estandarizado:**
  > *«Se ha registrado una modificación contractual. Debe consultarse si estaba prevista en el pliego inicial (art. 204 LCSP) o si concurrieron circunstancias imprevistas conforme al art. 205 LCSP.»*

---

### Indicador 9: Ausencia de Formalización Publicada
* **Categoría:** Cat. B (Información no localizada en la fuente consultada).
* **Hecho objetivo:** No consta la publicación del documento de formalización en el perfil de contratante tras el acuerdo de adjudicación.
* **Base legal:** Artículos 153 y 154 de la Ley 9/2017 (LCSP).
* **Criterio técnico:** Expediente con adjudicación resuelta que no dispone de documento de formalización cargado en PLACSP una vez superado el plazo normativo.
* **Explicaciones alternativas:** Retraso administrativo en la carga telemática de documentos; incidencia informática en la pasarela de interoperabilidad del perfil del contratante; formalización en soporte papel pendiente de publicación.
* **Documentos a consultar:** Expediente electrónico municipal para verificar la fecha efectiva de suscripción del documento contractual.
* **Texto estandarizado:**
  > *«No consta la publicación del documento de formalización en la plataforma. Este dato puede obedecer a retrasos en la carga de datos o a incidencias técnicas, sin que implique necesariamente la inexistencia del documento.»*

---

### Indicador 10: Adjudicación al Precio Máximo Presupuestado / 0% de Rebaja (`baja_cero`)
* **Categoría:** Cat. A (Dato localizado en una fuente identificable) / Cat. C (Indicador estadístico o analítico).
* **Hecho objetivo:** El precio adjudicado coincide con el 100,0% del Presupuesto Base de Licitación sin ningún descuento económico ofertado.
* **Base legal:** Artículo 100 de la LCSP.
* **Criterio técnico:** `importe_adjudicacion == importe_sin_iva` en procedimientos competitivos con PBL superior a cero.
* **Explicaciones alternativas:** Precios fijados por tarifas públicas reguladas o convenio colectivo vinculante; procedimientos donde los criterios de adjudicación se valoraron exclusivamente por parámetros cualitativos o mejoras técnicas sin puja económica.
* **Documentos a consultar:** Cuadro de criterios de ponderación del PCAP; desglose de la oferta y memoria de costes del adjudicatario.

---

### Indicador 11: Contratos Menores Próximos al Umbral Legal (`alerta_menor`)
* **Categoría:** Cat. C (Indicador estadístico o analítico).
* **Hecho objetivo:** El **valor estimado del contrato (VEC)** se sitúa en el 90% o más, pero por debajo del límite legal cuantitativo (13.500 € a 14.999 € en servicios/suministros; 36.000 € a 39.999 € en obras).
* **Base legal:** Artículos 101 y 118 de la LCSP.
* **Criterio técnico:** Solo se activa cuando el campo VEC está disponible y se encuentra entre el 90% y el 99,9% del umbral de su tipología. La ausencia de VEC no se sustituye por el PBL ni por el importe adjudicado; en ese caso el indicador queda sin determinar.
* **Explicaciones alternativas:** Presupuesto cerrado ajustado con precisión a precios de mercado; necesidad unitaria sin posibilidad técnica de fraccionamiento ni ampliación.
* **Documentos a consultar:** Factura proforma o presupuesto previo; memoria justificativa del gasto aprobada por el órgano.

---

### Indicador 12: Cofinanciación con Fondos de la Unión Europea (`fondos_ue`)
* **Categoría:** Cat. A (Dato localizado en una fuente identificable).
* **Hecho objetivo:** El contrato cuenta con financiación del mecanismo PRTR / NextGenerationEU, FEDER o Fondo Social Europeo.
* **Base legal:** Orden HFP/1030/2021 y Reglamentos comunitarios antifraude.
* **Criterio técnico:** Indicador de financiación comunitaria activo en los metadatos de PLACSP.
* **Explicaciones alternativas:** El indicador es estrictamente informativo y delimita el marco de supervisión reforzada, autoevaluación de riesgos de conflicto de interés (DACI) y control mediante la herramienta MINERVA.
* **Documentos a consultar:** Declaraciones de ausencia de conflicto de interés (DACI); informes de cumplimiento de hitos del PRTR.

---

### Indicador 13: Concentración Empresarial en Adjudicaciones
* **Categoría:** Cat. C (Indicador estadístico o analítico).
* **Hecho objetivo:** Un número reducido de adjudicatarios concentra una cuota elevada del importe total adjudicado por un órgano de contratación en un ejercicio o sector.
* **Base legal:** Criterios metodológicos de competencia de la CNMC y de la Comisión Europea (Índice Herfindahl-Hirschman - HHI y ratio CR5).
* **Criterio técnico:** Índice HHI superior a 2.500 puntos o ratio CR5 superior al 60% del volumen anual.
* **Explicaciones alternativas:** Tejido productivo local reducido; pocos operadores con solvencia técnica o habilitación legal para obras hidráulicas, eléctricas o de saneamiento en la comarca.
* **Documentos a consultar:** Registros de licitadores y planes de dinamización del tejido empresarial comarcal.

---

### Indicador 14: Dilación Procesal en la Adjudicación
* **Categoría:** Cat. C (Indicador estadístico o analítico).
* **Hecho objetivo:** El periodo transcurrido entre el cierre del plazo de ofertas y la adjudicación formal supera sustancialmente los plazos de referencia del art. 158 LCSP.
* **Base legal:** Artículo 158 de la Ley 9/2017 (LCSP).
* **Criterio técnico:** Transcurso de más de 90 días en procedimientos simplificados o más de 180 días en abiertos ordinarios sin resolución expresa.
* **Explicaciones alternativas:** Complejidad del informe técnico de valoración de muestras o prototipos; interposición de recursos especiales ante el tribunal administrativo de contratos con suspensión cautelar; solicitud de aclaraciones o subsanaciones documentales.
* **Documentos a consultar:** Actas sucesivas de la mesa de contratación y notificaciones de requerimientos de aclaración a los licitadores.

---

### Indicador 15: Desviación entre Duración Efectiva y Plazo Previsto en Pliegos
* **Categoría:** Cat. C (Indicador estadístico o analítico).
* **Hecho objetivo:** El plazo real transcurrido entre la formalización del contrato y la recepción final supera en más de un 50% el plazo inicial fijado en los pliegos.
* **Base legal:** Artículos 29, 195 y 210 de la LCSP.
* **Criterio técnico:** Duración computable que excede significativamente del plazo de ejecución contratado.
* **Explicaciones alternativas:** Suspensiones temporales de obra acordadas por inclemencias meteorológicas o interferencias geotécnicas no previstas; suspensiones por tramitación de licencias sectoriales.
* **Documentos a consultar:** Actas de suspensión y reanudación de los trabajos; informes de la dirección facultativa.

---

### Indicador 16: Licitación en Periodo Vacacional con Plazo Reducido
* **Categoría:** Cat. C (Indicador estadístico o analítico).
* **Hecho objetivo:** La convocatoria de la licitación y el cómputo del plazo de presentación transcurren íntegramente en periodos festivos o vacacionales señalados (mes de agosto o fiestas navideñas) ajustados al plazo mínimo legal estricto.
* **Base legal:** Artículo 136 de la LCSP y jurisprudencia administrativa sobre plazos hábiles y concurrencia efectiva.
* **Criterio técnico:** Periodo de presentación que coincide en más de un 70% con el mes de agosto o festividades sin ampliación prudencial del plazo.
* **Explicaciones alternativas:** Necesidad urgente ligada al calendario escolar, al inicio del curso lectivo o a la preparación de infraestructuras de temporada.
* **Documentos a consultar:** Anuncio de licitación y memoria sobre la oportunidad temporal del inicio del expediente.

---

### Indicador 17: Concurrencia Reiterada de Mismos Licitadores
* **Categoría:** Cat. C (Indicador estadístico o analítico).
* **Hecho objetivo:** Coincidencia sistemática de los mismos operadores económicos como licitadores en procedimientos con invitación o restringidos del mismo órgano.
* **Base legal:** Artículos 132 y 150 LCSP; directrices de la CNMC para la prevención de colusión en licitaciones.
* **Criterio técnico:** Repetición en más del 60% de procedimientos de un sector de las mismas combinaciones de empresas licitadoras.
* **Explicaciones alternativas:** Ausencia objetiva de más operadores acreditados en el ámbito territorial; especialización singular del servicio requerido.
* **Documentos a consultar:** Registro de solicitudes de participación e invitaciones cursadas por el órgano de contratación.

---

## 5. Resumen de Garantías y Principio de Neutralidad

* **No declaración de ilicitud:** Ninguna señal analítica o estadística equivale por sí misma a una constatación de infracción legal, delito, fraude o nulidad contractual.
* **Cotejo preceptivo:** Para alcanzar cualquier juicio técnico o jurídico fundado, es imprescindible consultar el expediente administrativo íntegro en poder de la administración contratante.
* **Canal de rectificación:** Cualquier licitador, entidad o persona interesada dispone del [Canal de Rectificación](/rectificacion) para aportar información oficial que aclare o corrija cualquier discordancia.



## Comparabilidad del importe de adjudicación

PLACSP puede publicar en algunos expedientes un **precio unitario** en el campo de importe de adjudicación mientras el PBL está expresado como importe total del contrato. OIReScon documenta expresamente esta limitación y, en sus análisis de reducción económica, excluye las observaciones cuya reducción aparente supera el 80 % para limitar esa distorsión.

Licitalcázar conserva el valor publicado por PLACSP, pero añade `award_amount_type`:

- `total`: comparable con el PBL; puede utilizarse para calcular la baja y los agregados económicos.
- `unitario`: posible precio unitario detectado con una reducción aparente superior al 80 % y vocabulario explícito de precio/tarifa/unidad en el objeto. No se utiliza para calcular una baja contra el PBL total.
- `desconocido`: no se puede garantizar que ambos importes sean comparables. Tampoco se utiliza para calcular una baja.

No se sustituye el importe publicado por el PBL ni se infiere un importe total que no conste en la fuente.
