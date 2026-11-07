# Documento de Requisitos del Producto

## Visión

InterstellaQ permite a los comercios solicitar pagos en Stellar mediante un flujo QR sencillo, mientras los clientes conservan el control de la autorización y de sus fondos.

## Usuarios objetivo

- Comercios pequeños y en línea que aceptan pagos internacionales
- Clientes con billeteras Stellar compatibles
- Integradores que evalúan un protocolo abierto de solicitud de pago

## Problema y oportunidad

El checkout transfronterizo de comercios suele carecer de un formato de solicitud de pago interoperable y de baja fricción. La liquidación rápida de Stellar y su soporte de activos crean una oportunidad para un flujo autorizado por billetera sin custodia de activos por parte del comercio.

## Alcance del MVP (entregado)

El MVP del hackathon demuestra, sobre Stellar Testnet: registro de comercio, creación de facturas de monto fijo con expiración, presentación por QR, autorización desde la billetera del cliente y verificación de la liquidación visible para el comercio.

Decisiones fijadas durante la implementación (ver [ADR 0002](adr/0002-invoice-correlation.md)):

- **Activo**: solo XLM nativo. Los activos emitidos y las stablecoins quedan fuera del alcance del MVP.
- **Billeteras**: Stellar Wallets Kit, que incluye Freighter (junto con Albedo, xBull y otras).
- **Frontend**: React + Vite + TypeScript, generado por Scaffold Stellar.
- **Backend**: ninguno. El estado de facturas y comercios vive en el navegador (`localStorage`), y eso es lo que hace que el flujo sea sin custodia.
- **Verificación**: monitoreo automático en segundo plano cada 20 segundos mientras el panel del comercio o la página de la factura tengan una factura pendiente, más el botón manual "Verificar estado" y un chequeo justo después del envío del pago.
- **Soroban**: no se usa; el espacio de contratos queda reservado para el backlog M3.

## Fuera de alcance

Rampas de fiat, custodia, reembolsos, contracargos, operaciones KYC/AML, despliegue en producción, administración multi-comercio, conversión de tipo de cambio, una billetera propia y afirmaciones de compatibilidad universal con billeteras.

## Conformidad con la descripción original del proyecto

La descripción registrada del proyecto ("Gateway Global de Pagamentos por QR Code") lista lo siguiente. Estado del MVP entregado:

| Ítem de la descripción | Estado | Nota |
|---|---|---|
| Registro de empresa con billetera Stellar conectada | Entregado | Prueba en cadena del control de la cuenta, identidad visual almacenada localmente |
| Códigos QR con destinatario, monto y activo | Entregado | Solicitud completa incrustada en la URL del QR, más equivalente en texto |
| Integración con billetera Stellar (Freighter) | Entregado | Freighter soportado vía Stellar Wallets Kit, junto a otras billeteras |
| Liquidación en Stellar Testnet | Entregado | Operaciones de pago nativas enviadas y confirmadas en cadena |
| Verificación de pagos y actualización de estados | Entregado | Verificación en Horizon automática cada 20 s mientras la factura está pendiente, además del botón y del chequeo posterior al pago |
| Panel de comercio con historial y confirmaciones | Entregado | Lista de facturas, estados y enlaces de evidencia en stellar.expert |
| Transparencia vía exploradores | Entregado | Cada liquidación y cada registro se vincula a stellar.expert/Testnet |
| Liquidación en stablecoins / activos emitidos | No entregado | Solo XLM nativo (ADR 0002); los activos emitidos son un ítem de hoja de ruta |
| Contratos Soroban para lógica programable | No usado | Solo donde sea necesario; el MVP no los necesita, espacio reservado para M3 |
| Frontend Next.js | No entregado | React + Vite (plantilla oficial de Scaffold Stellar) |
| Backend Node.js / NestJS | No entregado | Ausente de forma deliberada: sin servidor, sin custodia, sin secretos |

Las últimas cuatro filas son desviaciones de alcance y de stack, no brechas funcionales: toda funcionalidad listada en la descripción está presente en el MVP.

## Flujos de usuario

1. El comercio conecta una cuenta de Testnet elegible y registra una identidad para mostrar.
2. El comercio crea una factura con destinatario, activo, monto, expiración y referencia.
3. Un cliente escanea su representación QR, revisa la solicitud en una billetera compatible y autoriza el pago.
4. El comercio revisa la transacción relevante en Stellar y marca la factura como liquidada solo después de que la regla de verificación seleccionada se cumple.

## Criterios de éxito

- Una demo en vivo de Testnet completa el recorrido de extremo a extremo una vez, sin firma custodial.
- La referencia, el monto, el destinatario, el activo y la expiración de la factura son visibles antes de la autorización.
- Una factura liquidada está vinculada a evidencia en cadena verificable.
- El flujo documentado identifica con claridad los casos de billetera o activo no soportados.

## Hoja de ruta futura

Validar la interoperabilidad SEP-7; añadir cotizaciones multi-activo y rutas de cambio donde corresponda; explorar estado de factura y políticas de comercio aplicadas por Soroban; definir reembolsos y disputas; buscar preparación para producción e integraciones con socios.
