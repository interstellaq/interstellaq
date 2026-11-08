# ADR 0003: Validación de facturas y límites de confianza

- Estado: Aceptado
- Fecha: 2026-11-08
- Relacionada con: [ADR 0002](0002-invoice-correlation.md) y [Seguridad](../SECURITY.md)

## Contexto

El MVP admite solicitudes de pago de dos fuentes que no son confiables por sí
solas: el payload de un código QR compartido y las facturas conservadas en
`localStorage`. Una comprobación de tipos básicos no basta para garantizar que
los datos mostrados al pagador y los datos usados para construir una
transacción respeten las reglas del protocolo.

El ADR 0002 fija XLM nativo, la referencia memo-safe, el almacenamiento local
por comercio y el flujo de entrega a la billetera. Esta decisión define cómo se
valida estructuralmente una factura antes de que esos datos se muestren o se
usen en el flujo de pago. No añade un backend ni un emisor de solicitudes de
confianza, para mantener el alcance no custodial del MVP.

## Decisión arquitectónica

Se centraliza la validación estructural en una única regla reutilizable para
las facturas creadas localmente, los payloads QR y las facturas leídas de
`localStorage`. La misma validación se aplica de forma defensiva antes de
construir una transacción de pago.

La validación exige:

- una cuenta pública Stellar Ed25519 válida como destinatario;
- una referencia de factura memo-safe válida;
- XLM nativo como único activo del MVP;
- un monto decimal positivo que pueda representarse exactamente en stroops;
- un identificador UUID de factura cuando el dato proviene de una solicitud o
  del almacenamiento;
- fechas seguras, ordenadas y una expiración incluida en las ventanas admitidas;
- límites de longitud para el concepto y el nombre visible del comercio cuando
  estén presentes.

La creación de facturas usa esta regla antes de persistir una solicitud. La
decodificación del fragmento QR la aplica antes de entregar el payload a la
vista. La lectura individual desde `localStorage` descarta una factura alterada
antes de mostrarla. Finalmente, el constructor de transacciones vuelve a
validar la factura antes de consultar Horizon o preparar una operación para la
billetera.

La pantalla de revisión muestra la dirección Stellar completa del destinatario,
además del activo, monto, referencia y expiración. Así el usuario conserva los
datos necesarios para reconocer el destino antes de autorizar en su billetera.

Esta decisión separa explícitamente estructura de autenticidad. Una factura o
QR que supera estas reglas está bien formado, pero no prueba quién creó la
solicitud. El MVP no firma solicitudes QR ni incorpora un origen autenticado;
por tanto, no afirma que un QR compartido sin firma sea auténtico.

## Alternativas consideradas

- Validar cada consumidor por separado: rechazada porque duplicaría reglas
  entre creación, QR, almacenamiento y pago, y permitiría divergencias.
- Confiar en los tipos de TypeScript: rechazada porque QR y `localStorage` son
  datos serializados que pueden ser manipulados fuera de la comprobación de
  tipos en tiempo de compilación.
- Validar solo antes de firmar: rechazada porque permitiría mostrar datos
  inválidos en la pantalla de revisión y deja más rutas expuestas a estados
  inconsistentes.
- Firmar criptográficamente cada solicitud QR: aplazada. Resolvería la prueba
  de origen, pero requiere definir identidad del emisor, distribución de claves,
  rotación y experiencia de verificación; no es imprescindible para el flujo
  demostrable del hackathon.
- Introducir un backend o contrato Soroban como registro autoritativo:
  rechazado para el MVP por ampliar la superficie de confianza y el alcance ya
  descartado en el ADR 0002.

## Consecuencias

- Las reglas de factura son consistentes en los límites de entrada relevantes y
  se cubren con pruebas positivas, negativas y de regresión.
- Una entrada estructuralmente inválida no llega a la vista de pago ni al
  constructor de transacciones, incluso si procede de almacenamiento local.
- El constructor conserva una defensa en profundidad frente a llamadas futuras
  que eludan la interfaz de usuario.
- La validación no modifica las reglas de correlación ni de liquidación de
  Horizon establecidas en el ADR 0002; esas reglas siguen requiriendo evidencia
  en cadena según `docs/SECURITY.md`.
- La dirección completa mejora la capacidad de revisión humana, pero no
  sustituye la confirmación de destino que presenta la billetera.

## Riesgos residuales

Un tercero todavía puede sustituir un enlace o QR compartido por otra solicitud
estructuralmente válida. La aplicación la mostrará como una solicitud bien
formada, no como una solicitud autenticada. El usuario debe revisar el
destinatario completo y la billetera debe mostrar los detalles antes de firmar.

La autenticidad de origen, revocación de facturas y persistencia compartida no
se resuelven en este MVP. Si pasan a ser requisitos, el equipo deberá adoptar
un mecanismo verificable de firma u origen confiable y documentar sus claves,
autorización y rotación antes de afirmar protección frente a la sustitución de
solicitudes.
