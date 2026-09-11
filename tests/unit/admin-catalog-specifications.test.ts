import { describe, expect, it } from "vitest";
import {
  expandScientificNotation,
  validateDeterministicNumberStep,
  validateProductSpecificationValues,
} from "@/lib/admin/catalog/specifications";
import type { SpecificationFieldDefinition } from "@/db/schema";

describe("Admin Catalog Specifications Contract", () => {
  describe("Deterministic Number Step Validation", () => {
    it("validates exact decimal rational steps correctly (canonical contract cases)", () => {
      // min = 0, step = 0.1, value = 0.3 -> valid
      expect(validateDeterministicNumberStep(0.3, 0.1, 0)).toBe(true);

      // min = 0.1, step = 0.2, value = 0.5 -> (0.5 - 0.1) = 0.4 / 0.2 = 2 -> valid
      expect(validateDeterministicNumberStep(0.5, 0.2, 0.1)).toBe(true);

      // min undefined (base 0), step = 5, value = 15 -> valid
      expect(validateDeterministicNumberStep(15, 5)).toBe(true);

      // min undefined (base 0), step = 5, value = 12 -> 12 % 5 != 0 -> invalid
      expect(validateDeterministicNumberStep(12, 5)).toBe(false);

      // min = 10, step = 5, value = 15 -> (15 - 10) % 5 == 0 -> valid
      expect(validateDeterministicNumberStep(15, 5, 10)).toBe(true);
    });

    it("handles scientific notation strings expand accurately", () => {
      expect(expandScientificNotation("1e-5")).toBe("0.00001");
      expect(expandScientificNotation("2.5e-3")).toBe("0.0025");
      expect(expandScientificNotation("1.25e+2")).toBe("125");
      expect(expandScientificNotation("12.5")).toBe("12.5");
    });

    it("rejects non-positive steps or non-finite values", () => {
      expect(validateDeterministicNumberStep(10, 0)).toBe(false);
      expect(validateDeterministicNumberStep(10, -1)).toBe(false);
      expect(validateDeterministicNumberStep(Infinity, 1)).toBe(false);
      expect(validateDeterministicNumberStep(NaN, 1)).toBe(false);
    });
  });

  describe("Product Specification Values Validation", () => {
    const mockSchemaFields: SpecificationFieldDefinition[] = [
      {
        key: "sensor_type",
        label: "Tipo de Sensor",
        dataType: "enum",
        filterable: true,
        filterKind: "ENUM_MULTI",
        publicParam: "sensor",
        displayOrder: 1,
        options: [
          { value: "optical", label: "Óptico" },
          { value: "laser", label: "Láser" },
        ],
      },
      {
        key: "dpi_max",
        label: "DPI Máximo",
        dataType: "number",
        filterable: true,
        filterKind: "NUMBER_RANGE",
        publicParam: "dpi",
        displayOrder: 2,
        min: 100,
        max: 30000,
        step: 100,
      },
      {
        key: "wireless",
        label: "Inalámbrico",
        dataType: "boolean",
        filterable: true,
        filterKind: "BOOLEAN",
        publicParam: "wireless",
        displayOrder: 3,
      },
      {
        key: "cable_length",
        label: "Longitud del cable",
        dataType: "string",
        filterable: false,
        filterKind: "ENUM_MULTI",
        publicParam: "cable",
        displayOrder: 4,
      },
    ];

    it("accepts valid specification values matching field definitions", () => {
      const result = validateProductSpecificationValues(mockSchemaFields, {
        sensor_type: "optical",
        dpi_max: 26000,
        wireless: true,
        cable_length: "1.8 m",
      });

      expect(result.success).toBe(true);
      expect(result.specValues).toEqual({
        sensor_type: "optical",
        dpi_max: 26000,
        wireless: true,
        cable_length: "1.8 m",
      });
    });

    it("permits partial/missing fields (no invented required fields)", () => {
      const result = validateProductSpecificationValues(mockSchemaFields, {
        sensor_type: "laser",
      });

      expect(result.success).toBe(true);
      expect(result.specValues).toEqual({
        sensor_type: "laser",
      });
    });

    it("normalizes null and undefined as unset fields (omits them)", () => {
      const result = validateProductSpecificationValues(mockSchemaFields, {
        sensor_type: "optical",
        dpi_max: null,
        wireless: undefined,
      });

      expect(result.success).toBe(true);
      expect(result.specValues).toEqual({
        sensor_type: "optical",
      });
    });

    it("strictly rejects unknown keys not in schema definitions", () => {
      const result = validateProductSpecificationValues(mockSchemaFields, {
        sensor_type: "optical",
        unauthorized_key: "value",
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe("UNKNOWN_SPECIFICATION_KEY");
      expect(result.field).toBe("unauthorized_key");
    });

    it("rejects invalid enum options", () => {
      const result = validateProductSpecificationValues(mockSchemaFields, {
        sensor_type: "mechanical",
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe("INVALID_ENUM_OPTION");
    });

    it("rejects numbers violating min, max, or step", () => {
      // Below min
      const belowMin = validateProductSpecificationValues(mockSchemaFields, {
        dpi_max: 50,
      });
      expect(belowMin.success).toBe(false);
      expect(belowMin.code).toBe("NUMBER_BELOW_MIN");

      // Above max
      const aboveMax = validateProductSpecificationValues(mockSchemaFields, {
        dpi_max: 35000,
      });
      expect(aboveMax.success).toBe(false);
      expect(aboveMax.code).toBe("NUMBER_ABOVE_MAX");

      // Invalid step
      const invalidStep = validateProductSpecificationValues(mockSchemaFields, {
        dpi_max: 1050, // step is 100, min is 100 -> (1050 - 100) = 950 % 100 != 0
      });
      expect(invalidStep.success).toBe(false);
      expect(invalidStep.code).toBe("INVALID_STEP_VALUE");
    });

    it("rejects non-object rawSpecValues", () => {
      expect(validateProductSpecificationValues(mockSchemaFields, null).success).toBe(false);
      expect(validateProductSpecificationValues(mockSchemaFields, "not an object").success).toBe(
        false
      );
      expect(validateProductSpecificationValues(mockSchemaFields, [1, 2, 3]).success).toBe(false);
    });

    describe("True Plain JSON Object Enforcement (Defect A / BR3)", () => {
      it("accepts empty plain object {} where empty/partial specs are allowed", () => {
        const res = validateProductSpecificationValues(mockSchemaFields, {});
        expect(res.success).toBe(true);
        expect(res.specValues).toEqual({});
      });

      it("accepts ordinary plain object subject to field validation", () => {
        const res = validateProductSpecificationValues(mockSchemaFields, {
          sensor_type: "optical",
        });
        expect(res.success).toBe(true);
        expect(res.specValues).toEqual({ sensor_type: "optical" });
      });

      it("accepts Object.create(null) subject to field validation (canonical null-prototype policy)", () => {
        const nullProto = Object.create(null);
        nullProto.sensor_type = "optical";
        const res = validateProductSpecificationValues(mockSchemaFields, nullProto);
        expect(res.success).toBe(true);
        expect(res.specValues).toEqual({ sensor_type: "optical" });
      });

      it("rejects Array []", () => {
        const res = validateProductSpecificationValues(mockSchemaFields, []);
        expect(res.success).toBe(false);
        expect(res.code).toBe("INVALID_SPEC_VALUES_TYPE");
      });

      it("rejects new Date() and does not interpret zero-entry Date as {}", () => {
        const res = validateProductSpecificationValues(mockSchemaFields, new Date());
        expect(res.success).toBe(false);
        expect(res.code).toBe("INVALID_SPEC_VALUES_TYPE");
      });

      it("rejects new Map() and does not interpret zero-entry Map as {}", () => {
        const res = validateProductSpecificationValues(mockSchemaFields, new Map());
        expect(res.success).toBe(false);
        expect(res.code).toBe("INVALID_SPEC_VALUES_TYPE");
      });

      it("rejects new Set() and does not interpret zero-entry Set as {}", () => {
        const res = validateProductSpecificationValues(mockSchemaFields, new Set());
        expect(res.success).toBe(false);
        expect(res.code).toBe("INVALID_SPEC_VALUES_TYPE");
      });

      it("rejects RegExp /regex/ and does not interpret it as {}", () => {
        const res = validateProductSpecificationValues(mockSchemaFields, /test_regex/i);
        expect(res.success).toBe(false);
        expect(res.code).toBe("INVALID_SPEC_VALUES_TYPE");
      });

      it("rejects custom class instance and does not interpret zero-entry instance as {}", () => {
        class CustomSpecPayload {}
        const res = validateProductSpecificationValues(mockSchemaFields, new CustomSpecPayload());
        expect(res.success).toBe(false);
        expect(res.code).toBe("INVALID_SPEC_VALUES_TYPE");
      });

      it("rejects null", () => {
        const res = validateProductSpecificationValues(mockSchemaFields, null);
        expect(res.success).toBe(false);
        expect(res.code).toBe("INVALID_SPEC_VALUES_TYPE");
      });
    });
  });
});
