# Arquitectura propuesta

## Estado y principios

Este documento separa las decisiones confirmadas de las propuestas. Confirmadas: frontend React/Vite/TypeScript, Rust/Soroban donde se necesiten contratos, Scaffold Stellar como framework de desarrollo y Stellar Testnet para el MVP. La aplicación se genera en `app/` y las decisiones entregadas están registradas en [ADR 0002](adr/0002-invoice-correlation.md).

## Decisiones confirmadas

- Los clientes autorizan transferencias con su propia billetera compatible con Stellar; InterstellaQ no custodia claves de firma.
- El MVP está restringido a Stellar Testnet.
- Se prefieren las capacidades nativas de transacciones de Stellar cuando cumplen el requisito.
- El soporte SEP-7 es una consideración de diseño, no un compromiso de integración verificado.

## Flujo propuesto

1. Un frontend asocia un perfil de comercio con una cuenta pública de Stellar.
2. El comercio crea una factura: destinatario, activo, monto, expiración y referencia única.
3. El frontend codifica la solicitud en un payload QR para la entrega a la billetera.
4. La billetera del cliente construye y firma la operación o transacción de Stellar seleccionada.
5. El frontend, o una ruta mínima de solo lectura/consulta, verifica la liquidación en Testnet y registra el estado de la factura.

## Componentes propuestos

### Frontend

La aplicación React en `app/app/` proporciona las pantallas del comercio, las vistas del ciclo de vida de la factura, la visualización del QR, la entrega a la billetera y el estado. Los clientes generados por Scaffold Stellar se usarían si se introduce un contrato Soroban.

### Cuentas, activos y transferencias de Stellar

La implementación usa operaciones nativas estándar de Stellar para pagos directos, lo que preserva la semántica de correlación y verificación de facturas requerida. El MVP liquida en XLM nativo: no se necesita trustline. Los activos emitidos (incluidas las stablecoins) requieren manejo de trustlines y se diferían a la hoja de ruta.

### Contratos Soroban

Usos potenciales: estado durable de factura, reglas de liquidación programables atómicas o aplicación de políticas del comercio. El MVP no necesita ninguno, por lo que no se despliega ningún contrato; el espacio bajo `app/contracts/` queda reservado para el backlog M3. La autorización de contratos, los costos de almacenamiento y el soporte de billeteras deben evaluarse antes de adoptar esta ruta.

### Registro de comercio

Entregado como una transacción sin efecto firmada (incremento de secuencia) con un memo fijo, que demuestra el control de la clave pública en cadena, más metadatos visuales fuera de cadena en el almacenamiento del navegador. Sin registro central.

### Ciclo de vida de la factura

Estados entregados: `active`, `settled`, `expired` y `verification_failed`. La transición a `settled` se basa en evidencia verificada de Testnet, nunca en una afirmación del cliente.

### Verificación de la liquidación

Entregado: una consulta a Horizon sobre las transacciones recientes del destinatario, filtrada por el memo de texto único de la factura, y luego comparada contra destinatario, activo nativo, monto exacto en stroops y una cuenta de origen distinta del destinatario. Los chequeos fallidos dejan el estado almacenado intacto.

El chequeo se ejecuta automáticamente cada 20 segundos mientras el panel del comercio o la página de la factura tengan una factura pendiente, además del botón manual "Verificar estado" y del chequeo posterior al envío de un pago. La consulta se pausa con la pestaña oculta y nunca se superpone a sí misma.

## Preguntas de arquitectura: resueltas en ADR 0002

- ¿Qué billetera(s) y formatos de solicitud QR/URI son soportados demostrablemente? Stellar Wallets Kit (Freighter incluido) para la firma dentro de la aplicación, más un URI SEP-7 `web+stellar:pay` experimental, no verificado con ninguna billetera; el QR lleva la solicitud completa en el fragmento de la URL.
- ¿Cómo se representan y correlacionan las referencias de factura en cadena? Un memo de texto único (`ISQ` + 10 caracteres base32, dentro del límite de 28 bytes).
- ¿Se necesita almacenamiento persistente de facturas fuera de cadena? Sí, pero solo en el navegador: `localStorage` claveado por la clave pública del comercio, con el payload del QR como vía entre dispositivos.
- ¿Qué activos son prácticos para la demo de Testnet? Solo XLM nativo; los activos emitidos y las stablecoins son un ítem de hoja de ruta.
