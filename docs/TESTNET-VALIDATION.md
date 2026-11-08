# Validación reproducible del MVP en Stellar Testnet

Este procedimiento distingue las comprobaciones locales, que no firman ni
envían transacciones, de la demostración manual autorizada en Testnet. No debe
usarse como autorización para utilizar claves privadas, frases semilla o fondos
que no pertenezcan al operador de la demo.

## Estado de la cobertura

| Escenario | Evidencia local | Evidencia Testnet necesaria |
| --- | --- | --- |
| Crear una factura XLM con referencia y expiración válidas | `expiry.test.ts` | No para la validación estructural; sí en la demo completa. |
| Generar y leer el payload QR | `handoff.test.ts` | Escanear el QR con un segundo dispositivo o navegador. |
| Rechazar QR o almacenamiento manipulados | `handoff.test.ts` y `persistence.test.ts` | No; son casos negativos simulados. |
| Conectar una cartera Stellar y revisar el pago | No automatizado | Sí, con una cartera Testnet controlada por el demostrador. |
| Firmar y enviar un pago XLM nativo | No se ejecuta automáticamente | Sí, con autorización explícita del pagador. |
| Verificar Horizon y marcar `settled` | `settlement.test.ts` usa evidencias simuladas | Sí, tras integrar la corrección de liquidación de la issue #3. |
| Persistir y mostrar historial | `persistence.test.ts` cubre lectura estructural | Sí, tras liquidar una factura en el navegador del comercio. |
| Rechazar memo, monto, destino o expiración incorrectos | `settlement.test.ts` usa evidencias simuladas | Se recomienda al menos un caso manual controlado; no declarar esta cobertura como on-chain sin esa evidencia. |

Los tests E2E de `app/e2e/tests/` son artefactos de Scaffold Stellar (contrato
de adivinar número y explorador). No cubren el flujo de InterstellaQ y no deben
presentarse como evidencia de esta validación.

## Comprobación local sin red ni pagos

Desde `app/`, instalar exactamente las dependencias del lockfile y ejecutar:

```sh
npm ci
npm run validate:local
```

`validate:local` ejecuta typecheck, lint, unitarias, build y formato. No llama
a Friendbot, Horizon ni a una cartera y no firma ni envía transacciones.

No ejecutar `npm run test:net` como parte de CI ni de la comprobación local:
esa suite crea cuentas efímeras mediante Friendbot y firma/envía pagos Testnet.
Solo puede utilizarse después de una autorización explícita para esos pagos;
su resultado no sustituye el procedimiento manual siguiente.

## Demostración manual autorizada en Testnet

### Precondiciones

- La corrección de liquidación de la issue #3 está integrada y sus pruebas
  están aprobadas. Esta guía no duplica ni sustituye esa lógica.
- Hay dos cuentas Testnet distintas, una de comercio y otra de pagador, ambas
  controladas por el demostrador y con saldo suficiente para reserva y comisión.
- La cartera del pagador está configurada para Stellar Testnet.
- Se dispone de acceso público a Horizon Testnet y a Stellar Expert Testnet.
- El demostrador acepta explícitamente firmar y enviar el pago de prueba.

### Flujo positivo

1. Abrir la aplicación y conectar la cuenta del comercio. Completar el registro
   de comercio si la interfaz lo requiere y conservar el enlace de evidencia.
2. Crear una factura de XLM nativo con importe conocido, concepto opcional y
   expiración de al menos 15 minutos. Anotar el destinatario completo, monto,
   referencia y hora de expiración.
3. Comprobar que la factura aparece en el historial del comercio y que el QR o
   enlace contiene la misma solicitud.
4. Abrir el QR/enlace en otro navegador o dispositivo. Confirmar visualmente
   destinatario completo, activo XLM, monto, memo y expiración. Un QR bien
   formado no acredita por sí solo quién lo creó; comparar el destinatario con
   el dato comunicado por el comercio.
5. Conectar la cartera del pagador. Verificar que no es la misma cuenta que el
   destinatario y revisar en la cartera los mismos destino, monto y memo antes
   de firmar.
6. Solo tras la aprobación explícita, firmar y enviar el pago XLM nativo.
   Guardar el hash que muestra la aplicación y el enlace de Stellar Expert.
7. Esperar la indexación de Horizon y usar la verificación de la factura. Debe
   pasar a `settled`; recargar la vista del comercio para confirmar que el
   historial persiste el estado y el hash.
8. Registrar como evidencia el hash, enlace Horizon/Stellar Expert, referencia
   de la factura, cuentas públicas involucradas, importe, hora y resultado.

### Escenarios negativos

Ejecutar cada caso con una factura nueva; no reutilizar una factura ya
liquidada.

- **Memo incorrecto:** enviar un pago autorizado con el mismo destino e importe
  pero otra referencia. La factura debe permanecer sin liquidar.
- **Importe incorrecto:** enviar XLM al destino y memo esperados, pero con un
  importe distinto. La factura debe permanecer sin liquidar.
- **Destinatario incorrecto:** enviar el importe y memo a otra cuenta Testnet.
  La factura debe permanecer sin liquidar.
- **Expiración:** dejar vencer una factura sin pago y confirmar que deja de
  presentarse como pagable. Para un pago confirmado antes del vencimiento y
  verificado después, seguir la política que implemente y pruebe la issue #3.

Para cada caso negativo, conservar el hash y el enlace de Horizon. No marcar
la factura como liquidada manualmente ni interpretar una ausencia temporal de
Horizon como prueba de rechazo.

## Registro de resultados

Registrar en la evidencia de la entrega: versión o SHA de la aplicación,
resultado de `validate:local`, fecha/hora, red Testnet, hashes/enlaces públicos
de los escenarios autorizados y los casos que no se ejecutaron. Si no hubo una
transacción real autorizada, declarar la cobertura de cartera, envío, Horizon y
`settled` como **no verificada en Testnet**.
