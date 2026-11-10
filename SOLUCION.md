# SOLUCIÓN — Agente de Órdenes de Compra SAP

## 1. Problema en una frase

La analista administrativa digita a mano en SAP los datos que ya vienen en el correo de compra, lo que consume tiempo, produce errores costosos (centros de costo mal digitados que se corrigen en cierre contable) y no deja control sistemático sobre topes de aprobación ni medición de órdenes retroactivas.

Le duele a la analista (trabajo repetitivo), a contabilidad (errores y retrabajo), a la dirección (no puede medir el desvío de proceso) y a auditoría (evidencia dispersa).

## 2. Arquitectura

```
┌──────────────────────────────┐
│ Frontend React + Vite        │
│ - historial y streaming SSE  │
│ - tool calls colapsables     │
│ - confirmación destacada     │
│ - sidebar de casos + descargas│
└──────────────┬───────────────┘
               │ HTTP / SSE
┌──────────────▼───────────────┐
│ Backend Hono                 │
│ - POST /api/chat             │
│ - ciclo del agente           │
│ - sesiones en archivos       │
│ - API de casos y archivos    │
└───────┬──────────────┬───────┘
        │              │
┌───────▼──────┐ ┌─────▼──────────────────────┐
│ LLMAdapter   │ │ Herramientas zod            │
│ DeepSeek     │ │ leer / validar / payload /  │
│ (AI SDK)     │ │ evidencia / crear           │
└──────────────┘ └─────┬──────────────┬───────┘
                       │              │
                fixtures/ (ro)    out/ (rw)
                                   ├── <caso>/trazabilidad.json
                                   ├── <caso>/aprobacion.txt|pdf
                                   ├── sap/ordenes.jsonl
                                   ├── control.csv
                                   ├── log.jsonl
                                   └── sessions/*.json
```

Dónde vive cada cosa:

- **Comportamiento**: `agent/prompt.md` (system prompt en Markdown, cargado al iniciar el servidor).
- **Conocimiento**: `src/knowledge/ordenes-compra.md` (actores, flujo, RC1–RC10, excepciones).
- **Ejecución**: `src/tools/` (herramientas tipadas con zod, importables sin servidor).
- **Presentación**: `web/` (React + Vite).
- **Empaquetado reutilizable**: `modulo/` (agent.md, tools/oc.ts, SKILL.md).

## 3. Ciclo del agente

Implementé un loop propio en `src/agent/loop.ts`, no el loop automático del framework:

1. Se envía al adaptador LLM el historial y el registro de herramientas.
2. Si el modelo responde con `toolCalls`, se ejecutan **en paralelo** con `Promise.all`, validando argumentos con zod antes de cada ejecución (`validateAndExecute`).
3. Cada resultado se agrega al historial como mensaje `tool` y se registra en `out/log.jsonl` y en el historial visible del chat.
4. El loop continúa hasta que el modelo responde sin tool calls o se alcanza `MAX_ITERATIONS` (25 por defecto). Al llegar al tope devuelve un resumen de lo hecho y lo pendiente, sin romper la sesión.
5. Se aplica un tope de tokens por sesión (`MAX_TOKENS_PER_SESSION`).

**Confirmación humana (CA3)**: cuando `oc_validar` devuelve `confirmaciones`, el loop marca `needsConfirmation: true` y el turno termina con una pregunta. En el siguiente turno, el loop solo permite que `oc_crear` reciba `confirmado: true` si el último mensaje del usuario es una confirmación explícita (`confirmo`, `sí`, `adelante`, etc.). Si el modelo intenta crear sin esa confirmación, la herramienta responde “confirmaciones pendientes” y registra el intento como `pendiente` en `out/control.csv`.

**Abstracción del proveedor**: `LLMAdapter.enviar(mensajes, herramientas)` aísla el ciclo. Cambiar a Anthropic u otro proveedor implica solo una nueva implementación del adaptador; el loop y las herramientas no cambian.

## 4. Elección del modelo

- **Proveedor**: DeepSeek.
- **Modelo**: `deepseek-flash` (configurable con `MODEL_ID`).
- **Integración**: Vercel AI SDK (`ai`) con `@ai-sdk/openai` apuntando a `https://api.deepseek.com`, formato compatible con OpenAI.
- **Por qué**: buena relación costo/calidad para tool calling, API compatible con OpenAI (permite reutilizar ecosistema), latencia adecuada para un chat operativo y bajo costo por caso. El adaptador permite cambiarlo sin tocar el agente.
- **Costo estimado**: un caso típico usa ~20–30 mil tokens de entrada y ~3–5 mil de salida entre lecturas, validación, payload y evidencia. Con precios de referencia de DeepSeek, el costo es **menor a USD 0,01 por caso**; el demo y los tests no consumen tokens porque no usan LLM.

## 5. Matriz de controles

| # | Regla | Implementación | Tipo | Evidencia en tests |
|---|---|---|---|---|
| RC1 | Proveedor existe (NIT o nombre normalizado) y está activo | Búsqueda por NIT tolerando dígito de verificación, luego por nombre normalizado; chequeo de `activo` | Bloqueo | `sol-002`, proveedor inactivo |
| RC2 | Aprobación existe, contiene “Aprobado” y viene de aprobador del centro | Parseo del cuerpo con regex `\bAprobado\b`; búsqueda del email en `centros-costo.json` | Bloqueo | `sol-003` |
| RC3 | `valor_total` ≤ tope del aprobador | Comparación contra `aprobadores[].tope` del centro | Bloqueo | Caso construido sobre `sol-003` con aprobador válido y monto alto |
| RC4 | Subárea pertenece al centro | Comparación normalizada (sin acentos ni mayúsculas) | Bloqueo | `sol-001` con subárea cambiada |
| RC5 | Cotización vs solicitud ≤ 2 %; sin cotización también confirma | Diferencia relativa; mensaje con ambos valores | Confirmación | `sol-004`, cotización ausente |
| RC6 | IVA ausente → derivar del proveedor | `indicador_iva_default` del maestro a `derivados`, más confirmación | Confirmación + derivado | `sol-006` |
| RC7 | Condiciones de pago ausentes → derivar | `condiciones_pago_default` a `derivados`, sin confirmación | Derivado | `sol-001` sin condiciones |
| RC8 | Factura anterior a solicitud → retroactiva | Comparación de fechas YYYY-MM-DD; marca `retroactiva=true` | Confirmación | `sol-005` |
| RC9 | Fecha de aprobación ≥ fecha de solicitud | Comparación de fechas; confirmación si es anterior | Confirmación | `sol-001` con aprobación adelantada |
| RC10 | `cantidad × unitario = total` (±1) | Comparación numérica con tolerancia de 1 | Bloqueo | `sol-001` con total alterado |

La regla **más difícil** fue **RC5**: hay que distinguir entre “dato sospechoso” (confirmación) y “dato inválido” (bloqueo), redactar el mensaje con ambos valores para que la analista decida, y evitar falsos positivos por redondeos. La resolví con diferencia relativa y tolerancia del 2 %, dejando el valor de cotización y solicitud en el mensaje. RC8 también exigió cuidado: la factura trae fecha sin hora y la solicitud fecha sin hora; comparar strings YYYY-MM-DD evita problemas de zona horaria.

## 6. Diseño del adaptador SAP real

**Opción elegida: OData `API_PURCHASEORDER_PROCESS_SRV`** (SAP S/4HANA / Gateway). Motivos: es una API estándar, REST/JSON, documentada, con operaciones CRUD y sin necesidad de instalar RFC SDK; encaja con Node.js y permite reintentos idempotentes desde el backend.

**Mapeo del payload** (sección 7.4 del PRD):

| Payload local | OData |
|---|---|
| `sociedad` | `CompanyCode` |
| `organizacion_compras` | `PurchasingOrganization` |
| `proveedor.codigo_sap` | `Supplier` |
| `moneda` | `DocumentCurrency` |
| `condiciones_pago` | `PaymentTerms` (header o posición según configuración) |
| `posiciones[]` | `to_PurchaseOrderItem` |
| `posiciones[].descripcion` | `PurchaseOrderItemText` (máx. 40) |
| `posiciones[].cantidad` | `OrderQuantity` |
| `posiciones[].unidad` | `PurchaseOrderQuantityUnit` |
| `posiciones[].precio_unitario` | `NetPriceAmount` |
| `posiciones[].centro_costo` / `subarea` | `CostCenter` / cuenta de mayor o dimensión equivalente |
| `posiciones[].indicador_iva` | `TaxCode` |
| `referencia.solicitud_id` | campo de referencia externa (`SupplierRespSalesPersonName` o extensión custom) |

**Autenticación**: OAuth 2.0 client credentials o SAML bearer contra SAP Gateway; las credenciales viven en un vault/secret manager (Railway Variables, Azure Key Vault, etc.), nunca en el agente ni en el prompt. El backend obtiene un token de corta duración y lo renueva.

**Idempotencia frente a reintentos**: antes del POST se consulta por la referencia externa (`solicitud_id`); si existe, se devuelve el número de OC. Además se envía un `Idempotency-Key`/correlation id y se aplica backoff exponencial solo a errores transitorios (429, 5xx, timeout). Un timeout no se reintenta a ciegas: primero se vuelve a consultar por referencia.

**Errores parciales**: OData puede crear el header y fallar una posición. La estrategia es usar `$batch` con change set transaccional; si el sistema no lo soporta, se hace rollback lógico (borrar/actualizar el documento borrador) y se reporta al usuario con el detalle de la posición fallida. Nunca se marca el caso como exitoso hasta confirmar el número de OC.

**Plan B si la conexión no es viable**: el agente genera la OC lista para pegar en SAP GUI (tabla con todos los campos) y un archivo de carga masiva (CSV/Excel con el layout de importación), además de la evidencia y la trazabilidad. El ahorro de tiempo y la validación previa se mantienen aunque la creación sea manual.

## 7. Lectura del proceso: OC retroactivas

Las OC retroactivas son un síntoma, no la causa. Cuando la factura llega antes de que exista la orden, la organización está comprando sin una aprobación formal previa y el control se convierte en un trámite posterior. El problema tiene dos caras:

1. **Riesgo de control**: se salta la cotización y la verificación de topes; el gasto ya ocurrió.
2. **Ineficiencia**: la analista crea la OC contra reloj para poder radicar la factura, con más probabilidad de error.

Mi recomendación a la dirección es **medir primero y luego cambiar la política**. El agente ya marca `retroactiva = true` en `out/control.csv`, con `solicitud_id`, fecha y número de OC. Con dos o tres meses de datos se puede saber qué porcentaje del gasto es retroactivo, qué centros/proveedores concentran el problema y si la causa es falta de previsión, urgencias reales o proveedores que facturan antes de la OC.

Propuesta de proceso:

- **Regla operativa**: toda compra debe tener OC antes de la factura; la excepción retroactiva requiere una justificación y una aprobación adicional del líder.
- **Alerta temprana**: si el agente detecta que la factura ya llegó (o que el caso es retroactivo), lo escala al líder y a compras en lugar de crear silenciosamente.
- **Tablero mensual**: porcentaje de OC retroactivas por centro de costo y proveedor, con meta de reducción.
- **Acuerdo con proveedores**: comunicar que no se radicarán facturas sin OC, salvo excepción aprobada.

El agente no decide la política: la visibiliza y deja la evidencia para que la dirección decida si tolera, corrige o rechaza.

## 8. Decisiones y trade-offs

1. **Loop propio vs loop del framework**.
   - Elegido: loop propio.
   - Alternativa descartada: `generateText` con `maxSteps`/loop automático del AI SDK.
   - Por qué: el reto evalúa comprensión del ciclo del agente; el loop propio permite controlar tope de iteraciones, confirmación humana, ejecución paralela de herramientas, logging y errores con precisión. El costo es más código y mantenimiento.

2. **Sesiones en archivos JSON vs base de datos**.
   - Elegido: archivos en `out/sessions/` con escritura atómica (tmp + rename).
   - Alternativa descartada: SQLite/Postgres.
   - Por qué: el alcance es una demo de un solo usuario; los archivos son inspeccionables, no requieren infraestructura y persisten entre reinicios. El costo es que no escala a concurrencia alta ni multiusuario; se mitiga con escritura atómica y se migraría a una DB si el producto crece.

3. **Hono vs Express/Fastify**.
   - Elegido: Hono + `@hono/node-server`.
   - Alternativa descartada: Express.
   - Por qué: TypeScript-first, liviano, SSE nativo y fácil de testear con `app.request()` sin levantar un puerto. El costo es un ecosistema más chico que Express.

4. **Adaptador SAP mock sobre archivos vs integración real**.
   - Elegido: mock con JSONL y números secuenciales.
   - Alternativa descartada: intentar OData real sin acceso a SAP.
   - Por qué: el PRD pide diseñar la integración real, no implementarla; el mock permite probar idempotencia, CSV y flujo completo de forma determinística. El costo es que la integración real queda como diseño documentado.

5. **Derivación de unidad de medida por heurística**.
   - Elegido: `H` si la descripción habla de horas, `MES` si habla de mes/mensual, `UN` por defecto.
   - Alternativa descartada: pedir la unidad al usuario siempre.
   - Por qué: los fixtures no traen unidad explícita y la heurística cubre los casos; se informa como derivado. El costo es que un caso atípico podría requerir corrección manual; por eso la unidad queda en la trazabilidad.

## 9. Supuestos

- Los maestros de los fixtures son completos y representan la fuente de verdad para el reto.
- El correo de aprobación es evidencia suficiente; en producción auditoría podría exigir firma digital.
- La solicitud normalizada en JSON representa fielmente el Excel original; leer `.xlsx` real es P1 opcional y no se implementó.
- La cotización en texto plano contiene proveedor, NIT, total, moneda y validez con el formato de los fixtures.
- Una sola posición por OC es suficiente para los casos del reto; el esquema y el payload ya soportan `posiciones[]` para extenderlo.
- El usuario del chat es la analista administrativa; no hay autenticación ni multiusuario en el alcance.
- El SAP simulado es local y no requiere credenciales reales.
- Los importes están en COP salvo que el documento indique USD.

## 10. Cobertura

| Historia | Estado | Detalle |
|---|---|---|
| HU-1 Leer paquete | Hecho | `oc_leer_paquete` normaliza correo, solicitud, cotización, aprobación y factura; adjuntos ausentes → `null`; caso inexistente → error legible. |
| HU-2 Validar RC1–RC10 | Hecho | `oc_validar` devuelve `apta`, `bloqueos`, `confirmaciones`, `derivados`, `retroactiva`; tests para las 10 reglas. |
| HU-3 Construir payload | Hecho | `oc_construir_payload` valida con zod, trunca a 40 caracteres y escribe `trazabilidad.json` con fuente por campo. |
| HU-4 Evidencia | Hecho | P0 `aprobacion.txt` con encabezados y SHA-256; P1 `aprobacion.pdf` con pdf-lib. |
| HU-5 Crear OC | Hecho | `oc_crear` exige apta y confirmación cuando corresponde; números desde `4500000001`; JSONL; idempotencia; CSV de control. |
| HU-6 Errores | Hecho | Resultados `{ ok:false, error }`, mensajes claros en el chat, sesión viva, redacción de secretos. |
| Frontend de chat | Hecho | Historial, streaming SSE, tool calls colapsables, indicador “Pensando…”, confirmación resaltada, sidebar y descargas. |
| Sesiones persistentes | Hecho | JSON atómico en `out/sessions/`, recuperación tras reinicio. |
| Demo sin modelo | Hecho | Procesa los 6 casos, idempotencia de `sol-001` y confirmación simulada de `sol-004`. |
| Docker/Railway | Hecho | Dockerfile multi-stage, compose, `railway.json` y documentación. |
| Módulo reutilizable (bonus) | Hecho | `modulo/agent.md`, `modulo/tools/oc.ts`, `modulo/skill/ordenes-compra/SKILL.md` con test de consistencia. |
| Link público | Pendiente | Se completa al desplegar en Railway; mientras tanto se corre local con Docker. |
| Lectura de `.xlsx` real (P1 opcional) | No hecho | El sistema funciona con los fixtures normalizados; se documenta como extensión. |

## 11. Uso de IA

Usé **OpenCode** como entorno de agente y un modelo **DeepSeek V4.1 Flash** para construir la solución. Tareas en las que colaboró:

- Generación del esqueleto TypeScript, esquemas zod, tipos y herramientas de negocio.
- Redacción inicial del system prompt y del conocimiento del proceso.
- Implementación del loop del agente, adaptador DeepSeek, sesiones, API Hono y frontend React.
- Generación de tests de integración y del demo sin modelo.
- Redacción de esta documentación y del README.

Qué revisé y descarté:

- Descarté usar el loop automático del AI SDK porque el reto pide demostrar el ciclo del agente; lo reemplacé por el loop propio con tope y confirmación.
- Descarté un `fallback` de prompt embebido en el servidor: el system prompt debe vivir solo en `agent/prompt.md`.
- Ajusté la heurística de unidad de medida para no clasificar “vigencia 12 meses” como servicio mensual.
- Corregí la detección de confirmaciones para aceptar “sí, adelante” con acentos.
- Revisé que ninguna respuesta ni log exponga `DEEPSEEK_API_KEY`; los tests lo verifican.
- Validé cada regla RC1–RC10 contra los fixtures y agregué casos construidos para RC3, RC4, RC9 y RC10, que no tienen un fixture propio fallido.

## 12. Riesgos de producción y mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El modelo “invente” o altere un monto | OC incorrecta | Los montos salen de herramientas; el payload se valida con zod; el modelo no puede modificar el resultado de `oc_validar`. |
| Concurrencia sobre la misma sesión/archivo | Pérdida o duplicación de datos | Escritura atómica tmp+rename; idempotencia por `solicitud_id`; a futuro, lock o cola por sesión. |
| Rate limit o caída de DeepSeek | Chat no responde | Timeout, mensaje claro, sesión viva, backoff; el demo y los tests no dependen del proveedor. |
| SAP real no disponible o sin permisos | No se crea la OC | Plan B: OC lista para pegar + archivo de carga masiva; se mantiene validación y evidencia. |
| Datos maestros desactualizados | Bloqueos/derivados erróneos | En producción los maestros se consultan en SAP en tiempo real, no desde fixtures. |
| Evidencia sin firma digital | Auditoría la rechaza | Hash SHA-256 y PDF; a futuro, firma electrónica y almacenamiento inmutable (WORM). |
| Crecimiento de `out/` | Disco lleno | Rotación/limpieza por antigüedad; sesiones y logs a object storage. |
| Multiusuario y autenticación | Acceso indebido | Fuera de alcance; en producción, SSO, autorización por centro de costo y auditoría de accesos. |
| Prompt injection desde documentos | Acciones no autorizadas | Las herramientas no ejecutan shell; la confirmación humana y el tope de iteraciones acotan el daño; validar contenido no confiable. |
