import { expect, it } from "vitest";
import { validateExpectedPhysicalCount } from "@/lib/inventory/validation";
import { computeInventoryAdjustmentFingerprint } from "@/lib/inventory/crypto";
it("impide sobrescribir el stock de otro operador con una lectura antigua", () => {
  expect(validateExpectedPhysicalCount(3, 4)).toContain("cambió");
  expect(validateExpectedPhysicalCount(4, 4)).toBeNull();
  expect(validateExpectedPhysicalCount(-1, 4)).toContain("no es válida");
  expect(validateExpectedPhysicalCount(undefined, 4)).toBeNull();
});
it("mantiene las huellas anteriores y distingue los conteos con una versión física", () => {
  const input = {
    variantId: "v",
    commandKind: "PHYSICAL_COUNT",
    countedQuantity: 5,
    reason: "Conteo",
    referenceId: "REF",
    actorId: "actor",
    authorityBindingDigest: "digest",
  };
  expect(computeInventoryAdjustmentFingerprint(input)).toBe(
    computeInventoryAdjustmentFingerprint({ ...input, expectedOnHand: undefined })
  );
  expect(computeInventoryAdjustmentFingerprint({ ...input, expectedOnHand: 3 })).not.toBe(
    computeInventoryAdjustmentFingerprint({ ...input, expectedOnHand: 4 })
  );
});
