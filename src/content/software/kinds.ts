import type { SoftwareKind } from "./brand-software";

export interface SoftwareStep {
  title: string;
  text: string;
}

export interface SoftwareKindPage {
  kind: SoftwareKind;
  /** Label of the mega-menu tile that links here. */
  label: string;
  title: string;
  metaDescription: string;
  intro: string;
  /** Category to browse from this page, when the kind maps to one. */
  categorySlug?: string;
  stepsTitle: string;
  steps: SoftwareStep[];
  /** Warnings shown before the brand list, e.g. firmware precautions. */
  cautions?: string[];
}

export const SOFTWARE_KIND_PAGES: SoftwareKindPage[] = [
  {
    kind: "mouse",
    label: "Mouse",
    title: "Software para mouses",
    metaDescription:
      "Software oficial para configurar DPI, polling rate, botones y perfiles de los mouses ATK, MCHOSE y JINMS.",
    intro:
      "Cada marca configura sus mouses con su propio software: DPI, polling rate, botones, lift-off distance y perfiles. Aquí tienes el oficial de cada marca del catálogo.",
    categorySlug: "mouses",
    stepsTitle: "Antes de configurar",
    steps: [
      {
        title: "Conecta el mouse por cable o con su receptor",
        text: "El software reconoce el mouse por USB. Si es inalámbrico, conecta el receptor directamente al PC, no a un hub.",
      },
      {
        title: "Descarga solo desde el sitio de la marca",
        text: "Los instaladores de terceros pueden traer malware o versiones que no corresponden a tu modelo.",
      },
      {
        title: "Guarda tus ajustes en el mouse",
        text: "La mayoría guarda los perfiles en la memoria interna: después puedes usarlo en otro PC sin el software.",
      },
    ],
  },
  {
    kind: "teclado",
    label: "Teclado",
    title: "Software para teclados",
    metaDescription:
      "Software oficial para configurar punto de activación, rapid trigger, macros e iluminación de teclados gaming.",
    intro:
      "Los teclados magnéticos se ajustan por software: punto de activación, rapid trigger, macros e iluminación. Cuando tengamos teclados en el catálogo, aquí estará el software oficial de cada marca.",
    categorySlug: "teclados",
    stepsTitle: "Qué puedes ajustar",
    steps: [
      {
        title: "Punto de activación",
        text: "En los switches magnéticos eliges a qué profundidad se activa cada tecla.",
      },
      {
        title: "Rapid trigger",
        text: "La tecla se libera apenas empieza a subir, para detenerte y cambiar de dirección más rápido.",
      },
      {
        title: "Perfiles en el teclado",
        text: "Guarda tus ajustes en la memoria interna para usarlos en cualquier PC.",
      },
    ],
  },
  {
    kind: "dongle",
    label: "Dongle 8K",
    title: "Receptores 8K",
    metaDescription:
      "Cómo emparejar y usar un receptor 8K con tu mouse inalámbrico: conexión, requisitos del PC y emparejamiento.",
    intro:
      "Un receptor 8K permite que el mouse inalámbrico informe su posición 8000 veces por segundo. Para que funcione bien, conéctalo y emparéjalo así.",
    categorySlug: "mouses",
    stepsTitle: "Cómo emparejar tu receptor",
    steps: [
      {
        title: "Conéctalo a un puerto USB directo",
        text: "Usa un puerto trasero de la placa madre, sin hubs ni extensiones del monitor, y deja el receptor cerca del mouse.",
      },
      {
        title: "Empareja desde el software de la marca",
        text: "Si el mouse no responde, abre el software oficial y usa la opción de emparejar receptor con el mouse encendido.",
      },
      {
        title: "Elige el polling rate",
        text: "Activa 8000 Hz desde el software. Si notas tirones, prueba 4000 o 2000 Hz: 8K exige más al procesador.",
      },
      {
        title: "Revisa la batería",
        text: "A 8K la autonomía baja bastante; carga el mouse con más frecuencia o baja el polling para sesiones largas.",
      },
    ],
  },
  {
    kind: "firmware",
    label: "Firmware",
    title: "Actualizaciones de firmware",
    metaDescription:
      "Cómo actualizar el firmware de tu mouse o receptor de forma segura y qué precauciones tomar.",
    intro:
      "Una actualización de firmware puede corregir fallos o mejorar el sensor, pero si se interrumpe puede dejar el dispositivo sin funcionar. Sigue estas precauciones.",
    stepsTitle: "Cómo actualizar de forma segura",
    steps: [
      {
        title: "Actualiza solo si hace falta",
        text: "Hazlo si la marca corrige un problema que tienes o te lo recomendamos. Si todo funciona bien, no es obligatorio.",
      },
      {
        title: "Conecta por cable",
        text: "Usa el cable original en un puerto USB directo de la placa madre y carga el mouse por completo antes de empezar.",
      },
      {
        title: "No desconectes ni apagues el PC",
        text: "Espera a que el software confirme que terminó. Cierra otros programas que usen el mouse o el receptor.",
      },
      {
        title: "Usa el firmware de tu modelo exacto",
        text: "Cada versión es para un modelo y receptor concretos. Si tienes dudas, escríbenos antes de actualizar.",
      },
    ],
    cautions: [
      "Interrumpir una actualización (desconectar el cable, quedarse sin batería o apagar el PC) puede dañar el dispositivo y no se considera un defecto de fábrica.",
    ],
  },
];

export function getSoftwareKindPage(kind: string): SoftwareKindPage | undefined {
  return SOFTWARE_KIND_PAGES.find((page) => page.kind === kind);
}
