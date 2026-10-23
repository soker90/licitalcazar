# Registro de Expedientes con Discrepancias Cronológicas

> Este documento recoge de forma sistemática los contratos del censo que presentan anomalías temporales en los metadatos oficiales de PLACSP. Se utiliza como lista de trabajo para auditoría documental y revisión asistida por IA.

## 1. Discrepancias Registrales Directas (Revisión Prioritaria)

Casos donde la fecha de adjudicación consta antes del cierre del plazo de ofertas, o la formalización antes de la adjudicación. Suelen corresponder a erratas de digitación del órgano de contratación en la plataforma oficial.

| Nº | Expediente | Objeto | Procedimiento | Adjudicación | Detalle Discrepancia | Ficha Local | PLACSP |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `9/2025 Servicios` | Asesoramiento Técnico Urbanístico en el Área ... | Abierto simplificado | 2025-04-16 | Adjudicación (2025-04-16) anterior al límite de ofertas (2025-04-21) | [Ver ficha](http://localhost:3000/licitaciones/17051011) | [Enlace PLACSP](https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=5rZzIDo94t7I8aL3PRS10Q%3D%3D) |
| 2 | `2025/0003P` | Servicio de reparación, mantenimiento y sumin... | Abierto simplificado | 2025-05-20 | Formalización (2025-05-12) anterior a la adjudicación (2025-05-20) | [Ver ficha](http://localhost:3000/licitaciones/16998718) | [Enlace PLACSP](https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=AaY5BamCtnTpxJFXpLZ%2B2A%3D%3D) |
| 3 | `2/2024 Obras (Mixto) PRTR` | Suministro e instalación de 9 pasos de peaton... | Abierto simplificado | 2024-03-22 | Adjudicación (2024-03-22) anterior al límite de ofertas (2024-04-01) | [Ver ficha](http://localhost:3000/licitaciones/14522879) | [Enlace PLACSP](https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=J7CSqZfg1J2qb7rCcv76BA%3D%3D) |
| 4 | `1/2024 Suministros (Mixto) PRTR` | Suministro e instalación de dos aparcamientos... | Abierto simplificado | 2024-03-22 | Adjudicación (2024-03-22) anterior al límite de ofertas (2024-03-25) | [Ver ficha](http://localhost:3000/licitaciones/14510066) | [Enlace PLACSP](https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=yjCIcLQtY%2Fs7%2B9FIQYNjeQ%3D%3D) |
| 5 | `6/2021 Patrimonial` | Concesión Administrativa de uso privativo de ... | Negociado con publicidad | 2021-09-01 | Formalización (2021-08-31) anterior a la adjudicación (2021-09-01) | [Ver ficha](http://localhost:3000/licitaciones/8229378) | [Enlace PLACSP](https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=zPDKVN8Zu6cuf4aBO%2BvQlQ%3D%3D) |
| 6 | `2021/0004` | Venta de materiales procedentes de la clasifi... | Abierto | 2021-02-05 | Adjudicación (2021-02-05) anterior al límite de ofertas (2021-02-11) | [Ver ficha](http://localhost:3000/licitaciones/6941243) | [Enlace PLACSP](https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=G6d54CSLMhOmq21uxhbaVQ%3D%3D) |
| 7 | `6/2020 servicios` | ayuda a domicilio del municipio de alcázar de... | Abierto | 2020-06-30 | Adjudicación (2020-06-30) anterior al límite de ofertas (2020-07-16) | [Ver ficha](http://localhost:3000/licitaciones/5986717) | [Enlace PLACSP](https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=ZznHsOXNpT%2Brz3GQd5r6SQ%3D%3D) |

## 2. Inconsistencias de Publicación en Feed Histórico

Se han detectado **133 contratos competitivos** (la gran mayoría de ejercicios 2018-2023) cuya fecha de publicación figura en el feed de datos abiertos con posterioridad a la fecha límite de presentación de ofertas.
Esto se debe a la arquitectura del feed ATOM de PLACSP, donde las rectificaciones de pliegos o las publicaciones de adjudicación sobrescribían en ocasiones el campo `<cbc:IssueDate>` del anuncio original.
