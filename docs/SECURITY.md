# Seguridad

## Postura de seguridad

InterstellaQ está diseñado como no custodial: la autorización del cliente ocurre en la billetera del cliente, y el protocolo nunca debe solicitar, recibir, registrar ni almacenar claves privadas ni frases semilla.

## Activos y límites de confianza

Los activos incluyen fondos del cliente, cuentas de recepción del comercio, datos de la factura, payloads QR, datos de entrega a la billetera y evidencia de liquidación. Los límites de confianza existen entre el navegador y la billetera, entre el navegador y la red/proveedor de consultas de Stellar, entre la entrada del comercio y la factura mostrada, y entre cualquier contrato o servicio de almacenamiento futuro.

## Modelo de amenazas inicial

| Amenaza | Control inicial |
|---|---|
| Sustitución o manipulación del QR | Mostrar destinatario, activo, monto y expiración en forma legible antes de la autorización en la billetera; vincular la verificación a los campos inmutables de la factura. |
| Suplantación de la cuenta del comercio | Exigir una prueba de control apropiada para el flujo de billetera/firma elegido; no tratar un nombre visual como prueba de propiedad. |
| Reproducción de facturas o pago duplicado | Usar referencias únicas de factura, estado de ciclo de vida explícito, expiración y verificación idempotente; definir cualquier política de pago repetido. |
| Resultado de liquidación obsoleto o fabricado | Consultar la evidencia autoritativa de transacciones de Testnet y validar la ejecución exitosa y todos los campos esperados. |
| Manipulación de estado en el cliente | Tratar el estado del navegador como no confiable hasta derivarlo independientemente de la evidencia en cadena. |
| Fuga de secretos | Excluir los secretos de la recopilación en la interfaz, los registros, la analítica, el control de versiones y los mensajes de error. |

## Requisitos de autorización

- Las firmas del cliente deben ser creadas por la billetera del cliente.
- Las acciones del comercio deben estar vinculadas al control de la cuenta de comercio declarada antes de que su registro sea de confianza.
- Cualquier capacidad administrativa de Soroban debe ser explícita, mínima y documentada antes del despliegue.

## Invariantes de pago

Una factura solo puede marcarse como liquidada si la evidencia exitosa seleccionada de Testnet coincide con su destinatario, activo, monto, política de expiración y regla de correlación. Las facturas vencidas no deben presentarse como pagables. Una transacción para un destinatario, activo o monto distinto nunca liquida la factura.

## Protección contra replay

Cada factura necesita un identificador único y una expiración. La verificación debe ser idempotente y evitar que una transacción satisfaga silenciosamente varias facturas, salvo que esa asignación sea una regla de protocolo explícita y probada. El formato de correlación en cadena está resuelto en [ADR 0002](adr/0002-invoice-correlation.md): un memo de texto único por factura, verificado contra la evidencia de Horizon.

## Decisiones abiertas

La validación de capacidades de billeteras, la confianza en proveedores externos, el modelo de autorización de contratos y los procedimientos de reporte de incidentes requieren revisión antes de un despliegue en producción. La codificación de la referencia y la prueba de control del comercio están resueltas en [ADR 0002](adr/0002-invoice-correlation.md).
