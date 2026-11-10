# Spec Delta

## Purpose

Proporciona verificación determinística del sistema sin depender de un modelo de lenguaje, mediante un script demo que procesa todos los casos de prueba, y una suite de tests de integración que valida el comportamiento de herramientas, ciclo del agente, y reglas de control.

## ADDED Requirements

### Requirement: Script demo sin modelo
El archivo `demo.ts` SHALL procesar los 6 casos de prueba (sol-001 a sol-006) llamando directamente a las herramientas sin invocar al modelo de lenguaje. Para cada caso SHALL imprimir: apta, bloqueos, confirmaciones, retroactiva, y número de OC o motivo de no creación. El script SHALL ejecutarse sin requerir API key de ningún proveedor.

#### Scenario: Ejecución completa
- **WHEN** se ejecuta `bun run demo.ts`
- **THEN** procesa los 6 casos en orden y muestra resultados claros para cada uno

#### Scenario: Demostración de idempotencia
- **WHEN** demo.ts ejecuta sol-001 dos veces
- **THEN** la primera ejecución crea OC 4500000001 y la segunda devuelve el mismo número con idempotente=true

#### Scenario: Demostración de confirmación
- **WHEN** demo.ts procesa sol-004
- **THEN** muestra las confirmaciones requeridas y simula una confirmación explícita para continuar

#### Scenario: Sin API key requerida
- **WHEN** se ejecuta demo.ts sin OPENCODE_API_KEY en el entorno
- **THEN** funciona correctamente sin error, procesando todos los casos

### Requirement: Tests de integración con Vitest
El proyecto SHALL incluir una suite de tests de integración usando Vitest que cubra: herramientas individuales (cada herramienta con sus casos de éxito y error), reglas de control (RC1-RC10 con los 6 casos de prueba), ciclo del agente (loop, tope de iteraciones, confirmación), y adaptador SAP (creación, idempotencia, log de control).

#### Scenario: Tests de herramientas
- **WHEN** se ejecuta `bun test` o `npm test`
- **THEN** Vitest corre todos los tests y reporta cobertura de herramientas

#### Scenario: Test de regla RC1 (proveedor inexistente)
- **WHEN** se prueba oc_validar con sol-002
- **THEN** el test verifica que devuelve apta=false con bloqueos que mencionan RC1

#### Scenario: Test de regla RC5 (discrepancia)
- **WHEN** se prueba oc_validar con sol-004
- **THEN** el test verifica que devuelve confirmaciones con ambos valores

#### Scenario: Test de idempotencia
- **WHEN** se prueba oc_crear dos veces con el mismo solicitud_id
- **THEN** el test verifica que la segunda llamada devuelve idempotente=true

#### Scenario: Tests determinísticos
- **WHEN** se ejecutan los tests múltiples veces
- **THEN** producen los mismos resultados (salvo timestamps)

### Requirement: Limpieza de out/ al inicio
El sistema SHALL limpiar el directorio `out/` al inicio de cada ejecución de demo.ts y al inicio de los tests, asegurando determinismo. Las sesiones en `out/sessions/` NO SHALL limpiarse en tests de integración que requieran persistencia.

#### Scenario: Limpieza antes de demo
- **WHEN** se ejecuta demo.ts
- **THEN** el directorio out/ se limpia excepto out/sessions/ (si existe)

#### Scenario: Limpieza antes de tests
- **WHEN** se ejecuta la suite de tests
- **THEN** out/ se limpia antes de correr los tests, excepto archivos de sesión explícitamente preservados

### Requirement: Documentación de ejecución
El README.md SHALL incluir instrucciones claras para ejecutar demo.ts y los tests, incluyendo prerequisitos (Bun o Node, variables de entorno), comandos exactos, y salida esperada.

#### Scenario: Instrucciones de demo
- **WHEN** un desarrollador lee el README
- **THEN** encuentra sección "Demo sin modelo" con comando `bun run demo.ts` y ejemplo de salida

#### Scenario: Instrucciones de tests
- **WHEN** un desarrollador lee el README
- **THEN** encuentra sección "Tests" con comando `bun test` o `npm test` y explicación de cobertura
