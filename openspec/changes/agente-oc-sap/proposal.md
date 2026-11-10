# Propuesta

## Por qué

Periferia IT Group necesita automatizar la creación de órdenes de compra en SAP. Actualmente, las analistas digitan manualmente la información de solicitudes, cotizaciones y aprobaciones que llegan por correo, lo que genera errores costosos (centros de costo mal digitados que se corrigen en cierre contable), consumo de tiempo en tareas repetitivas, y falta de control sistemático sobre límites de aprobación y validación de aprobadores. Además, no hay medición de cuántas órdenes se crean retroactivamente (después de recibir la factura), un desvío de proceso que la dirección quiere visibilizar.

Este reto técnico resuelve el problema construyendo un agente conversacional que lee el paquete completo (solicitud, cotización, aprobación), valida contra maestros de datos (proveedores, centros de costo, matriz de aprobación, indicadores IVA, condiciones de pago), construye el payload de la orden, genera evidencia en PDF, y crea la orden en un SAP simulado. Las excepciones no se fuerzan: se clasifican en bloqueos (impiden crear), confirmaciones (requieren permiso humano) y derivados (se completan automáticamente y se informan).

## Qué cambia

- **Nuevo agente conversacional completo**: interfaz de chat React + backend Node.js con ciclo del agente, herramientas tipadas con zod, y conexión a DeepSeek API (compatible con OpenAI) a través de Vercel AI SDK
- **Cinco herramientas de negocio**: lectura de paquete, validación contra maestros y reglas de control (RC1-RC10), construcción de payload de orden de compra, generación de evidencia (txt P0 + pdf P1 con pdf-lib), y creación de orden en SAP simulado con idempotencia
- **Adaptador SAP mock**: implementación sobre archivos que asigna números secuenciales, escribe en JSONL, y mantiene trazabilidad; incluye diseño documentado para implementación real
- **Frontend de chat con historial de casos**: interfaz React que muestra llamadas a herramientas, resalta confirmaciones, soporta streaming, y lista casos procesados anteriormente con acceso descargable a archivos resultado
- **Gestión de sesiones en archivos**: persistencia de conversaciones en `out/` para que persistan entre reinicios
- **Demo sin modelo**: `demo.ts` ejecuta las herramientas directamente sobre los 6 casos de prueba (sol-001 a sol-006) sin requerir API key, demostrando idempotencia y confirmaciones
- **Tests de integración con Vitest**: cobertura de herramientas, ciclo del agente, y reglas de control
- **Contenedores con Docker Compose**: entorno local reproducible con variables de entorno en `.env`
- **Módulo reutilizable (bonus)**: agente empaquetado como skill independiente con `agent.md`, herramientas importables, y `SKILL.md` para integración en otras plataformas
- **Preparación para Railway**: estructura lista para deploy en Railway con secrets, priorizando funcionamiento local primero

## Capacidades

### Nuevas capacidades
- `agente-conversacional`: ciclo del agente con loop de herramientas, tope de iteraciones, confirmación humana, gestión de sesiones, y adaptador LLM propio sobre Vercel AI SDK
- `herramientas-oc`: herramientas de negocio para lectura de paquete, validación (RC1-RC10), construcción de payload con trazabilidad, generación de evidencia (txt/pdf), y creación de orden con idempotencia
- `adaptador-sap`: interfaz SapAdapter, implementación mock sobre archivos, y diseño documentado para integración real (OData, RFC/BAPI, o carga masiva)
- `chat-frontend`: interfaz React con historial de conversación, visualización de tool calls, streaming, estado de confirmación, y panel lateral de casos procesados con descarga de archivos
- `demo-y-tests`: ejecución de demo sin modelo (`demo.ts`) y suite de tests de integración con Vitest
- `modulo-reutilizable`: empaquetado del agente como skill independiente para integración en otras plataformas (bonus)

### Capacidades modificadas
(ninguna, es un proyecto nuevo)

## Impacto

**Código nuevo**: estructura completa según PRD sección 6.5 con `agent/`, `src/` (server, llm, tools, sap, knowledge), `web/`, `modulo/`, y archivos raíz (`demo.ts`, `.env.example`, `README.md`, `SOLUCION.md`, `docker-compose.yml`)

**Dependencias principales**: 
- `ai` (Vercel AI SDK) para integración LLM
- `openai` (SDK de OpenAI, reutilizado para DeepSeek)
- `zod` para schemas de herramientas
- `pdf-lib` para generación de PDFs
- `react` y `react-dom` para frontend
- `vitest` para tests
- `tsx` o `bun` para ejecución TypeScript

**APIs y contratos**:
- API HTTP mínima: `POST /api/chat`, `GET /api/sessions/:id`, `GET /api/health`
- Contrato de herramientas con formato `{ description, args (zod), execute(args, ctx) }`
- Interfaz `SapAdapter` con `consultarProveedor`, `crearOrden`, `buscarOrdenPorReferencia`
- Tipos TypeScript para `Paquete`, `OrdenCompra`, y resultados de herramientas

**Sistema de archivos**:
- `fixtures/reto-03/`: solo lectura, datos de prueba (no modificar)
- `out/`: escritura de resultados (trazabilidad, evidencia, órdenes, log, sesiones)
- `.env`: variables de entorno locales (API keys, configuración)

**Infraestructura**:
- Docker Compose para desarrollo local
- Preparación para Railway (secrets, variables de entorno)
- Deploy local primero, Railway después

**Archivos entregables**:
- Repositorio Git con historial de commits
- Link público para prueba (o demo local en defensa)
- `SOLUCION.md` con estructura obligatoria de 12 secciones
- `README.md` con instrucciones de uso
- `demo.ts` ejecutable sin API key
