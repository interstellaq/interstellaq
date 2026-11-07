# ADR 0001: Stack tecnológico propuesto

- Estado: Aceptado (las decisiones restantes se resuelven en [ADR 0002](0002-invoice-correlation.md))
- Fecha: 2026-11-06

## Contexto

InterstellaQ necesita un camino apropiado para hackathon y nativo de Stellar para demostrar una solicitud de pago de comercio sin custodia en Testnet. Esta es una elección inicial; aún no se ha creado código de ejecución.

## Decisión

Proponer Scaffold Stellar para la generación futura del proyecto; React, Vite y TypeScript para la interfaz web; las utilidades del SDK de Stellar y Testnet para la interacción con cuentas y transacciones; Rust y Soroban solo para comportamientos que requieran programabilidad en cadena; y clientes de contratos generados cuando se adopte un contrato Soroban.

## Justificación

Esta combinación se alinea con el ecosistema solicitado, soporta un prototipo rápido orientado al navegador y mantiene disponibles los pagos directos de Stellar cuando un contrato no aportaría valor al protocolo. Rust/Soroban ofrece un camino para reglas programables explícitas y auditables.

## Alternativas consideradas

- Un setup de frontend totalmente personalizado: más control, pero duplica el esfuerzo del setup oficial del framework.
- Un diseño contrato-primero: rechazado por ahora porque las solicitudes de pago básicas pueden resolverse con operaciones nativas de Stellar.
- Un backend con custodia y base de datos: rechazado porque amplía el alcance de confianza, seguridad y operaciones sin ser necesario para el flujo inicial.
- Una arquitectura compatible con EVM: rechazada porque no refleja el modelo de cuentas, transacciones y Soroban de Stellar.

## Consecuencias

El equipo debe validar la compatibilidad de billeteras, la mecánica de activos en Testnet y la correlación de transacciones antes de prometer una ruta específica de QR o billetera. Si se añade un contrato, su autorización, almacenamiento, despliegue y el ciclo de vida del cliente generado pasan a formar parte del proceso de construcción y revisión.

## Decisiones pendientes

Todas resueltas en [ADR 0002](0002-invoice-correlation.md): billeteras vía Stellar Wallets Kit (Freighter incluido) con respaldo SEP-7; solo XLM nativo; correlación por memo de texto único; `localStorage` del navegador claveado por la dirección del comercio; registro como transacción sin efecto firmada. Cabe señalar que la descripción registrada del proyecto también menciona un frontend Next.js, un backend NestJS y liquidación en stablecoins; el MVP entregado usa React + Vite, sin backend y con XLM nativo, por las razones registradas en el ADR 0002 y en docs/PRD.md.
