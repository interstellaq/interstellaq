# Backlog de implementación

La prioridad es un flujo de pago en Testnet completo y demostrable dentro del hackathon, con la validación de seguridad por delante de la expansión opcional.

## Progreso (2026-11-07)

- Los estados de progreso registran implementación y documentación existentes; no sustituyen la verificación reproducible de todos los criterios de aceptación.
- **M0 implementado y documentado**: scaffold generado en `app/` (commit después de la etiqueta `kickoff`), ruta de billetera en Testnet registrada con el Stellar Wallets Kit y un pago en vivo, correlación decidida en [ADR 0002](adr/0002-invoice-correlation.md). La compatibilidad de billetera y formato de solicitud requiere evidencia verificable.
- **M1 implementado**: registro con prueba en cadena, creación de facturas con expiración, solicitud QR con payload incrustado, autorización desde la billetera, verificación en Horizon con enlaces de evidencia en stellar.expert y monitoreo automático de pagos (una consulta a Horizon cada 20 s mientras hay una factura pendiente). La aceptación integral permanece sujeta a verificación frente a sus criterios.
- **M2 implementado y documentado parcialmente**: casos negativos y de expiración registrados en la suite unitaria más un chequeo en vivo con monto incorrecto (`npm run test:net`), revisión de seguridad reflejada en ADR 0002 y docs/SECURITY.md, guion de demo en [docs/PITCH.md](PITCH.md) y en el README, y alcance entregado declarado frente a la descripción registrada del proyecto en [docs/PRD.md](PRD.md). La cobertura completa de criterios requiere verificación adicional.
- **M3 pendiente**: evaluación del contrato de facturas en Soroban diferida; los contratos de ejemplo del scaffold siguen en `app/contracts/` para esa evaluación.

## M0 — Fundamentos

| ID | Tarea | Depende de | Criterios de aceptación |
|---|---|---|---|
| M0-01 | Generar la aplicación oficial de Scaffold Stellar | Inicialización del repositorio | La aplicación generada se ejecuta sin alterar el alcance declarado en esta documentación. |
| M0-02 | Validar la billetera y el formato de solicitud en Testnet | M0-01 | Una ruta de billetera/solicitud elegida está documentada y probada manualmente en Testnet. |
| M0-03 | Decidir el diseño de correlación de pagos | M0-02 | Un ADR o una actualización de arquitectura definen la codificación de la referencia y los campos de verificación. |

## M1 — Solicitud de pago demostrable

| ID | Tarea | Depende de | Criterios de aceptación |
|---|---|---|---|
| M1-01 | Implementar conexión y registro de la cuenta del comercio | M0-01, M0-02 | El comercio puede demostrar el control de la cuenta de Testnet elegida y ver su estado de registro. |
| M1-02 | Implementar creación de facturas y expiración | M0-03, M1-01 | Una factura válida de monto fijo tiene destinatario, activo, monto, referencia y expiración inmutables. |
| M1-03 | Renderizar la solicitud QR y la pantalla de revisión | M1-02 | El QR y los detalles en texto coinciden exactamente con la factura activa. |
| M1-04 | Añadir la entrega de autorización a la billetera | M1-03, M0-02 | El cliente autoriza un pago en Testnet sin compartir ningún secreto. |
| M1-05 | Verificar la liquidación y el estado | M1-04, M0-03 | Un pago coincidente y exitoso cambia la factura a liquidada con evidencia inspeccionable. |

## M2 — Endurecer la demo

| ID | Tarea | Depende de | Criterios de aceptación |
|---|---|---|---|
| M2-01 | Probar casos negativos y de expiración | M1-05 | Monto incorrecto, destinatario incorrecto, pagos fallidos, duplicados y vencidos no liquidan una factura. |
| M2-02 | Revisión de seguridad | M2-01 | La lista de verificación de seguridad cubre límites de confianza, autorización, replay y manejo de secretos. |
| M2-03 | Guion de demo y documentación | M2-02 | Un revisor nuevo puede reproducir el flujo de Testnet a partir de los prerrequisitos documentados. |

## M3 — Evaluar extensiones programables

| ID | Tarea | Depende de | Criterios de aceptación |
|---|---|---|---|
| M3-01 | Evaluar el contrato de facturas en Soroban | M2-03 | La decisión registra por qué las operaciones nativas son insuficientes o rechaza el contrato. |
| M3-02 | Añadir el cliente de contratos generado, si se adopta | M3-01 | Las llamadas del cliente se generan, se prueban y son coherentes con las reglas de autorización del contrato. |
