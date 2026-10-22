import { describe, expect, it } from "vitest";
import {
  PERU_DEPARTMENTS,
  districtSuggestions,
  findPeruDepartment,
  provinceSuggestions,
} from "@/lib/account/peru-locations";
import { validateCreateAddressInput } from "@/lib/account/address-validation";

describe("Peru locations", () => {
  it("lists the 24 departments plus Callao", () => {
    expect(PERU_DEPARTMENTS).toHaveLength(25);
    expect(new Set(PERU_DEPARTMENTS).size).toBe(25);
  });

  it("matches departments ignoring case, accents and spaces", () => {
    expect(findPeruDepartment(" lima ")).toBe("Lima");
    expect(findPeruDepartment("ANCASH")).toBe("Áncash");
    expect(findPeruDepartment("junin")).toBe("Junín");
    expect(findPeruDepartment("Lima Metropolitana")).toBeNull();
  });

  it("suggests provinces and districts where most orders ship", () => {
    expect(provinceSuggestions("lima")).toContain("Huarochirí");
    expect(provinceSuggestions("Callao")).toEqual(["Callao"]);
    expect(districtSuggestions("Lima", "lima")).toHaveLength(43);
    expect(districtSuggestions("Callao", "Callao")).toContain("Ventanilla");
    expect(districtSuggestions("Arequipa", "Arequipa")).toEqual([]);
  });
});

describe("Address department validation", () => {
  const base = {
    recipientName: "Ana Pérez",
    phone: "987654321",
    streetAddress: "Av. Larco 123",
    province: "Lima",
    district: "Miraflores",
  };

  it("stores the INEI spelling", () => {
    const result = validateCreateAddressInput({ ...base, department: "ancash" });
    expect(result.success && result.data.department).toBe("Áncash");
  });

  it("rejects a department that is not on the list", () => {
    const result = validateCreateAddressInput({ ...base, department: "Lima Metropolitana" });
    expect(result.success).toBe(false);
  });
});
