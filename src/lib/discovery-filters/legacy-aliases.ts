export interface LegacyAliasResult {
  hasLegacyParams: boolean;
  targetCategorySlug?: string;
  targetPath?: string;
  translatedParams?: Record<string, string[]>;
}

export function translateLegacyCategoryUrl(
  categorySlug: string,
  rawParams: Record<string, string | string[] | undefined>
): LegacyAliasResult {
  const paramEntries = Object.entries(rawParams);
  let hasLegacy = false;
  let targetCategorySlug = categorySlug;
  const translated: Record<string, string[]> = {};

  for (const [key, rawValue] of paramEntries) {
    if (rawValue === undefined) continue;
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];

    if (categorySlug === "mouses") {
      if (key === "tipo") {
        hasLegacy = true;
        for (const v of values) {
          if (v === "ultraligeros") {
            translated["peso_max"] = [...(translated["peso_max"] ?? []), "45"];
          } else if (v === "ergonomicos") {
            translated["forma"] = [...(translated["forma"] ?? []), "ergonomico"];
          } else if (v === "simetricos") {
            translated["forma"] = [...(translated["forma"] ?? []), "simetrico"];
          } else if (v === "wireless-8k") {
            translated["polling_min"] = [...(translated["polling_min"] ?? []), "8000"];
          }
        }
      } else if (key === "sub") {
        hasLegacy = true;
        targetCategorySlug = "accesorios";
        for (const v of values) {
          if (["skates", "grip-tapes", "dongles"].includes(v)) {
            translated["tipo_accesorio"] = [...(translated["tipo_accesorio"] ?? []), v];
          }
        }
      } else {
        translated[key] = [...(translated[key] ?? []), ...values];
      }
    } else if (categorySlug === "teclados") {
      if (key === "formato") {
        for (const v of values) {
          if (v === "compactos") {
            hasLegacy = true;
            translated["formato"] = [...(translated["formato"] ?? []), "60", "65"];
          } else if (v === "tkl-75") {
            hasLegacy = true;
            translated["formato"] = [...(translated["formato"] ?? []), "75", "tkl"];
          } else if (v === "magneticos") {
            hasLegacy = true;
            translated["tipo_switch"] = [...(translated["tipo_switch"] ?? []), "magnetico"];
          } else {
            translated["formato"] = [...(translated["formato"] ?? []), v];
          }
        }
      } else if (key === "sub") {
        hasLegacy = true;
        targetCategorySlug = "accesorios";
        for (const v of values) {
          if (["switches", "keycaps", "modding"].includes(v)) {
            translated["tipo_accesorio"] = [...(translated["tipo_accesorio"] ?? []), v];
          }
        }
      } else {
        translated[key] = [...(translated[key] ?? []), ...values];
      }
    } else if (categorySlug === "audio") {
      if (key === "tipo") {
        hasLegacy = true;
        for (const v of values) {
          if (v === "iems") {
            translated["tipo_audio"] = [...(translated["tipo_audio"] ?? []), "iem"];
          } else if (v === "open-back") {
            translated["tipo_audio"] = [...(translated["tipo_audio"] ?? []), "open-back"];
          } else if (v === "dacs") {
            translated["tipo_audio"] = [...(translated["tipo_audio"] ?? []), "dac"];
          }
        }
      } else {
        translated[key] = [...(translated[key] ?? []), ...values];
      }
    } else if (categorySlug === "accesorios") {
      if (key === "tipo") {
        hasLegacy = true;
        for (const v of values) {
          if (
            [
              "cables",
              "bungees",
              "soportes",
              "herramientas",
              "dongles",
              "skates",
              "grip-tapes",
              "switches",
              "keycaps",
              "modding",
            ].includes(v)
          ) {
            translated["tipo_accesorio"] = [...(translated["tipo_accesorio"] ?? []), v];
          }
        }
      } else {
        translated[key] = [...(translated[key] ?? []), ...values];
      }
    } else {
      translated[key] = [...(translated[key] ?? []), ...values];
    }
  }

  if (!hasLegacy) {
    return { hasLegacyParams: false };
  }

  return {
    hasLegacyParams: true,
    targetCategorySlug,
    targetPath: `/categorias/${targetCategorySlug}`,
    translatedParams: translated,
  };
}
