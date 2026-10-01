import { COMPANY } from "@/config/company";
import type { LegalDocument } from "./types";

export const PRIVACY_POLICY: LegalDocument = {
  slug: "privacidad",
  eyebrow: "Legal",
  title: "Política de privacidad",
  summary: `Qué datos personales trata ${COMPANY.legalName} cuando usas ${COMPANY.tradeName}, para qué los usa y cómo puedes ejercer tus derechos.`,
  updatedAt: "2026-10-01",
  sections: [
    {
      id: "responsable",
      heading: "1. Quién es responsable de tus datos",
      paragraphs: [
        `${COMPANY.legalName} (en adelante, "${COMPANY.tradeName}") es responsable del tratamiento de los datos personales que se recogen a través de esta tienda, conforme a la Ley N.° 29733, Ley de Protección de Datos Personales, y su reglamento.`,
      ],
    },
    {
      id: "datos",
      heading: "2. Qué datos tratamos",
      items: [
        "Datos de cuenta: nombre, correo electrónico, teléfono y documento de identidad, cuando creas una cuenta o completas tu perfil.",
        "Datos de entrega: las direcciones que guardas o indicas al comprar.",
        "Datos de pedidos: productos, montos, estado del pedido y la captura del comprobante de Yape o Plin que subes para verificar tu pago.",
        "Mensajes: lo que nos envías mediante los formularios de Contacto o Distribuidores.",
        "Datos técnicos: los necesarios para que la tienda funcione y sea segura, como las cookies de sesión y carrito, y registros de errores sin datos que te identifiquen directamente.",
      ],
    },
    {
      id: "finalidades",
      heading: "3. Para qué los usamos",
      items: [
        "Gestionar tu cuenta e iniciar sesión, incluido el acceso con Google si lo eliges.",
        "Procesar tus pedidos: verificar el pago, prepararlos, enviarlos y avisarte de su estado.",
        "Responder tus consultas y solicitudes.",
        "Mantener la seguridad de la tienda y prevenir fraudes.",
        "Cumplir obligaciones legales, tributarias y contables.",
      ],
      paragraphs: ["No vendemos tus datos ni los usamos para publicidad de terceros."],
    },
    {
      id: "proveedores",
      heading: "4. Con quién los compartimos",
      paragraphs: [
        "Para operar la tienda usamos proveedores que tratan datos por encargo nuestro y solo para prestarnos su servicio: alojamiento y almacenamiento (Cloudflare), base de datos y autenticación (Supabase), envío de correos (Resend), monitoreo de errores (Sentry) e inicio de sesión con Google, si lo usas. Algunos de estos proveedores pueden almacenar datos fuera del Perú.",
        "También podemos compartir los datos necesarios con quien realice la entrega de tu pedido, y con autoridades cuando la ley lo exija.",
      ],
    },
    {
      id: "conservacion",
      heading: "5. Cuánto tiempo los conservamos",
      paragraphs: [
        "Conservamos los datos de tu cuenta mientras esté activa. Los datos de pedidos y pagos se conservan durante el tiempo que exigen las normas tributarias y contables. Los mensajes de contacto se conservan solo el tiempo necesario para atender tu consulta.",
      ],
    },
    {
      id: "derechos",
      heading: "6. Tus derechos",
      paragraphs: [
        "Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición (derechos ARCO) escribiéndonos desde la página de Contacto e indicando tu solicitud y el correo asociado a tu cuenta. Puedes actualizar varios datos directamente en Mi cuenta → Datos personales.",
        "Si consideras que no atendimos tu solicitud, puedes acudir a la Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia y Derechos Humanos.",
      ],
    },
    {
      id: "seguridad",
      heading: "7. Seguridad",
      paragraphs: [
        "Aplicamos medidas técnicas y organizativas para proteger tus datos: conexiones cifradas, acceso restringido al personal autorizado y almacenamiento privado de los comprobantes de pago.",
      ],
    },
    {
      id: "cambios",
      heading: "8. Cambios a esta política",
      paragraphs: [
        "Si actualizamos esta política, publicaremos la nueva versión en esta página con su fecha de actualización.",
      ],
    },
  ],
};
