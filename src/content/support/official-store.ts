/**
 * Official-store and warranty copy. It describes how the store evaluates a case, not legal terms:
 * no coverage periods are stated here because none are defined yet, and every case is reviewed
 * under the Código de Protección y Defensa del Consumidor (see faq.ts, content boundary).
 */

export interface OfficialStorePoint {
  title: string;
  text: string;
}

export const OFFICIAL_STORE_BENEFITS: OfficialStorePoint[] = [
  {
    title: "Productos originales",
    text: "Vendemos periféricos de las marcas de nuestro catálogo, nunca réplicas ni copias.",
  },
  {
    title: "Unidades selladas y revisadas",
    text: "Cada pedido sale en su empaque original sellado, después de un control de calidad de nuestro equipo.",
  },
  {
    title: "Compra segura en gamerperu.com",
    text: "Pagas con Yape o Plin siguiendo las instrucciones de tu pedido, y nuestro equipo verifica cada pago antes de confirmarlo.",
  },
  {
    title: "Atención directa",
    text: "Te responde una persona del equipo, antes y después de la compra.",
  },
];

export const OFFICIAL_CHANNEL_CHECKS: OfficialStorePoint[] = [
  {
    title: "Compra en nuestro dominio",
    text: "La tienda oficial es gamerperu.com. Desconfía de páginas o perfiles que usen nuestro nombre en otro dominio.",
  },
  {
    title: "Paga solo desde tu pedido",
    text: "Las instrucciones de pago aparecen en la página de tu pedido. Nunca te pediremos pagar por un enlace o número que no venga de ahí.",
  },
  {
    title: "Escríbenos por los canales oficiales",
    text: "Usa el WhatsApp y el formulario de esta página. Si alguien te ofrece nuestros productos por otro medio, consúltanos antes de pagar.",
  },
  {
    title: "Cuidado con los revendedores no verificados",
    text: "Un precio muy por debajo del mercado o la falta de comprobante son señales de alerta: el producto puede ser una réplica o no tener respaldo.",
  },
];

export const WARRANTY_EVALUATED: string[] = [
  "Fallas de la placa (PCB) o de la conexión que impiden usar el periférico.",
  "Sensor que salta, pierde el rastreo o no responde en una superficie adecuada.",
  "Switches con doble clic, teclas que no registran o que se activan solas.",
  "Receptor o dongle de origen que no se empareja o pierde la conexión.",
  "Batería que no carga con el cable original.",
];

export const WARRANTY_EXCLUDED: string[] = [
  "Golpes, caídas o daños físicos.",
  "Contacto con líquidos o humedad.",
  "Abrir, modificar o reparar el periférico por cuenta propia.",
  "Interrumpir una actualización de firmware (desconectar el cable, batería agotada o apagar el PC).",
  "Desgaste normal por uso, como skates o superficies de mousepad.",
];

export const WARRANTY_STEPS: OfficialStorePoint[] = [
  {
    title: "Escríbenos",
    text: "Indica el número de tu pedido y describe el problema.",
  },
  {
    title: "Envía evidencia",
    text: "Fotos o un video corto del fallo nos ayudan a revisarlo más rápido.",
  },
  {
    title: "Revisamos el caso contigo",
    text: "Lo evaluamos conforme al Código de Protección y Defensa del Consumidor y te indicamos los pasos a seguir.",
  },
];
