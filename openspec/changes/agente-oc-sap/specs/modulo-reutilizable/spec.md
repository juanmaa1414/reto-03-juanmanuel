# Spec Delta

## Purpose

Empaqueta el agente conversacional como un módulo reutilizable e independiente que puede integrarse en otras plataformas de agentes sin depender del servidor HTTP. Permite que otros sistemas utilicen las herramientas de órdenes de compra SAP directamente, manteniendo consistencia con la aplicación principal.

## ADDED Requirements

### Requirement: Estructura de módulo independiente
El proyecto SHALL incluir una carpeta `modulo/` con tres componentes: `agent.md` (definición del agente con frontmatter), `tools/oc.ts` (herramientas importables sin servidor), y `skill/ordenes-compra/SKILL.md` (conocimiento del proceso empaquetado como skill). Estos tres archivos SHALL ser las mismas definiciones que usa la aplicación principal, sin copias divergentes.

#### Scenario: Estructura de módulo
- **WHEN** se inspecciona la carpeta modulo/
- **THEN** contiene agent.md, tools/oc.ts, y skill/ordenes-compra/SKILL.md

#### Scenario: Sin dependencias del servidor
- **WHEN** se importan las herramientas desde modulo/tools/oc.ts
- **THEN** funcionan sin requerir el servidor HTTP ni configuración de Express/Hono

### Requirement: Definición del agente en agent.md
El archivo `modulo/agent.md` SHALL tener frontmatter con: `description` (descripción del agente), `mode: primary`, y `permission: { edit: deny, bash: deny }`. El cuerpo del archivo SHALL ser el mismo system prompt que usa la aplicación principal (contenido de `agent/prompt.md`).

#### Scenario: Frontmatter válido
- **WHEN** se parsea el frontmatter de agent.md
- **THEN** contiene description, mode: primary, y permission con edit: deny y bash: deny

#### Scenario: Contenido del prompt
- **WHEN** se compara agent.md con agent/prompt.md
- **THEN** el cuerpo (sin frontmatter) es idéntico al system prompt de la aplicación

### Requirement: Herramientas importables en modulo/tools
El archivo `modulo/tools/oc.ts` SHALL exportar las mismas herramientas que `src/tools/oc.ts`, con el mismo contrato `{ description, args (zod), execute(args, ctx) }`. Las herramientas SHALL ser importables directamente desde TypeScript sin configurar servidor.

#### Scenario: Importación directa
- **WHEN** se importa `leer_paquete` desde `modulo/tools/oc.ts`
- **THEN** funciona sin requerir configuración de servidor ni dependencias de red

#### Scenario: Mismo contrato
- **WHEN** se comparan las herramientas de src/tools/oc.ts y modulo/tools/oc.ts
- **THEN** tienen la misma estructura, schemas zod, y lógica de ejecución

#### Scenario: Sin servidor requerido
- **WHEN** se ejecuta una herramienta desde modulo/tools/oc.ts en un script standalone
- **THEN** funciona correctamente sin levantar servidor HTTP

### Requirement: Skill de conocimiento del proceso
El archivo `modulo/skill/ordenes-compra/SKILL.md` SHALL tener frontmatter con `name` y `description`. El cuerpo SHALL ser el mismo conocimiento del proceso que vive en `src/knowledge/ordenes-compra.md`, empaquetado como skill reutilizable.

#### Scenario: Frontmatter de skill
- **WHEN** se parsea el frontmatter de SKILL.md
- **THEN** contiene name: "ordenes-compra" y una description del conocimiento

#### Scenario: Contenido del conocimiento
- **WHEN** se compara SKILL.md con src/knowledge/ordenes-compra.md
- **THEN** el cuerpo (sin frontmatter) es idéntico al conocimiento de la aplicación

#### Scenario: Skill usable por otros agentes
- **WHEN** otro sistema de agentes carga SKILL.md como skill
- **THEN** obtiene el conocimiento completo del proceso de órdenes de compra SAP

### Requirement: Consistencia entre aplicación y módulo
Las tres piezas del módulo reutilizable (agent.md, tools/oc.ts, SKILL.md) SHALL ser las mismas que usa la aplicación principal. NO SHALL existir divergencia entre lo que corre en la aplicación y lo que se empaqueta en el módulo. Un cambio en la aplicación SHALL reflejarse en el módulo.

#### Scenario: Cambio en prompt se refleja
- **WHEN** se modifica agent/prompt.md
- **THEN** modulo/agent.md se actualiza automáticamente o se documenta que debe sincronizarse

#### Scenario: Cambio en herramientas se refleja
- **WHEN** se modifica src/tools/oc.ts
- **THEN** modulo/tools/oc.ts se actualiza para mantener consistencia

#### Scenario: Cambio en conocimiento se refleja
- **WHEN** se modifica src/knowledge/ordenes-compra.md
- **THEN** modulo/skill/ordenes-compra/SKILL.md se actualiza para mantener consistencia

### Requirement: Documentación del módulo
El README.md SHALL incluir una sección explicando cómo usar el módulo reutilizable, incluyendo: estructura de archivos, cómo importar las herramientas, cómo integrar agent.md en otras plataformas, y ejemplos de uso standalone.

#### Scenario: Documentación de uso
- **WHEN** un desarrollador lee el README
- **THEN** encuentra sección "Módulo reutilizable (bonus)" con instrucciones de integración

#### Scenario: Ejemplo de importación
- **WHEN** se lee la documentación del módulo
- **THEN** incluye ejemplo de cómo importar y usar las herramientas desde TypeScript
