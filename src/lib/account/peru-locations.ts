/**
 * Peru's 24 departments plus the Constitutional Province of Callao, as INEI lists them. Provinces
 * and districts stay free text, with suggestions where most orders ship (Lima and Callao); a full
 * district list needs the official INEI ubigeo file.
 */
export const PERU_DEPARTMENTS = [
  "Amazonas",
  "Áncash",
  "Apurímac",
  "Arequipa",
  "Ayacucho",
  "Cajamarca",
  "Callao",
  "Cusco",
  "Huancavelica",
  "Huánuco",
  "Ica",
  "Junín",
  "La Libertad",
  "Lambayeque",
  "Lima",
  "Loreto",
  "Madre de Dios",
  "Moquegua",
  "Pasco",
  "Piura",
  "Puno",
  "San Martín",
  "Tacna",
  "Tumbes",
  "Ucayali",
] as const;

export type PeruDepartment = (typeof PERU_DEPARTMENTS)[number];

const PROVINCE_SUGGESTIONS: Partial<Record<PeruDepartment, readonly string[]>> = {
  Lima: [
    "Lima",
    "Barranca",
    "Cajatambo",
    "Canta",
    "Cañete",
    "Huaral",
    "Huarochirí",
    "Huaura",
    "Oyón",
    "Yauyos",
  ],
  Callao: ["Callao"],
};

const DISTRICT_SUGGESTIONS: Record<string, readonly string[]> = {
  "Lima/Lima": [
    "Ancón",
    "Ate",
    "Barranco",
    "Breña",
    "Carabayllo",
    "Chaclacayo",
    "Chorrillos",
    "Cieneguilla",
    "Comas",
    "El Agustino",
    "Independencia",
    "Jesús María",
    "La Molina",
    "La Victoria",
    "Lima",
    "Lince",
    "Los Olivos",
    "Lurigancho",
    "Lurín",
    "Magdalena del Mar",
    "Miraflores",
    "Pachacámac",
    "Pucusana",
    "Pueblo Libre",
    "Puente Piedra",
    "Punta Hermosa",
    "Punta Negra",
    "Rímac",
    "San Bartolo",
    "San Borja",
    "San Isidro",
    "San Juan de Lurigancho",
    "San Juan de Miraflores",
    "San Luis",
    "San Martín de Porres",
    "San Miguel",
    "Santa Anita",
    "Santa María del Mar",
    "Santa Rosa",
    "Santiago de Surco",
    "Surquillo",
    "Villa El Salvador",
    "Villa María del Triunfo",
  ],
  "Callao/Callao": [
    "Bellavista",
    "Callao",
    "Carmen de la Legua Reynoso",
    "La Perla",
    "La Punta",
    "Mi Perú",
    "Ventanilla",
  ],
};

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
}

/** The canonical department for a typed or saved value, ignoring case and accents. */
export function findPeruDepartment(value: string): PeruDepartment | null {
  const folded = fold(value);
  return PERU_DEPARTMENTS.find((department) => fold(department) === folded) ?? null;
}

export function provinceSuggestions(department: string): readonly string[] {
  const canonical = findPeruDepartment(department);
  return canonical ? (PROVINCE_SUGGESTIONS[canonical] ?? []) : [];
}

export function districtSuggestions(department: string, province: string): readonly string[] {
  const canonical = findPeruDepartment(department);
  if (!canonical) return [];
  const provinceMatch = provinceSuggestions(canonical).find(
    (name) => fold(name) === fold(province)
  );
  return provinceMatch ? (DISTRICT_SUGGESTIONS[`${canonical}/${provinceMatch}`] ?? []) : [];
}
