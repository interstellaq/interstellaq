# Requisitos

## Requisitos funcionales

| ID | Requisito | Criterios de aceptación |
|---|---|---|
| FR-01 | Registro de comercio | Una cuenta de Testnet puede enviar los campos de registro requeridos; su dirección pública se muestra después de la confirmación. |
| FR-02 | Creación de factura | El comercio puede crear una factura con destinatario, identificador de activo, monto, expiración y referencia única; la entrada inválida o incompleta se rechaza. |
| FR-03 | Solicitud QR | Cada factura activa renderiza un payload QR que representa la solicitud de pago revisada. |
| FR-04 | Autorización del cliente | El flujo presenta una solicitud compatible con la billetera para la aprobación del cliente; InterstellaQ no recopila ni persiste ninguna clave privada del cliente. |
| FR-05 | Verificación de la liquidación | Una factura cambia a liquidada solo cuando la evidencia en cadena coincide con su destinatario, activo, monto y regla de correlación aprobada. |
| FR-06 | Manejo de expiración | Una factura vencida no puede presentarse como pagable y se etiqueta como expirada. |

## Requisitos no funcionales

| ID | Requisito | Criterios de aceptación |
|---|---|---|
| NFR-01 | Alcance de red | Las transacciones y consultas de la demo usan Stellar Testnet; la red se muestra en la interfaz de usuario. |
| NFR-02 | Sin custodia | Ninguna clave privada, frase semilla o secreto de firma de billetera entra en el almacenamiento, los registros o el control de versiones de la aplicación. |
| NFR-03 | Integridad | Los registros de factura conservan el destinatario, activo, monto, expiración y referencia creados, para la verificación. |
| NFR-04 | Usabilidad | Antes de la entrega a la billetera, el cliente puede leer destinatario, activo, monto y expiración. |
| NFR-05 | Observabilidad | Los fallos de verificación exponen un estado seguro y accionable sin revelar credenciales ni secretos. |
| NFR-06 | Accesibilidad | El formulario principal y el flujo de estados son operables con teclado y presentan equivalentes de texto para los datos del QR. |

## Requisitos abiertos

Resueltos durante la implementación y registrados en [ADR 0002](adr/0002-invoice-correlation.md): el payload QR canónico es la URL de la factura con la solicitud en el fragmento; el conjunto de activos soportado es XLM nativo; el almacenamiento de facturas es `localStorage` del navegador claveado por la dirección del comercio; y la correlación usa un memo de texto único comparado contra la evidencia de Horizon.
