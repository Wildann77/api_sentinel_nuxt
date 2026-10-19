import type { AssertionRuleInput } from "@sentinel/contracts";
import { AssertionRule, ValidationException } from "@sentinel/domain";

export function isMaskedSecret(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return /^•+$/.test(trimmed) || trimmed.includes("••••") || trimmed === "__SENTINEL_UNCHANGED__";
}

export function mapAssertionRuleInput(input: AssertionRuleInput): AssertionRule {
  const target = input.target ?? input.property;
  const rawExpected = input.expected !== undefined ? input.expected : input.expectedValue;

  if (input.type === "status") {
    let expected: number | number[];
    if (typeof rawExpected === "number") {
      expected = rawExpected;
    } else if (typeof rawExpected === "string") {
      expected = Number.parseInt(rawExpected, 10);
    } else if (Array.isArray(rawExpected)) {
      expected = rawExpected.map((n) => Number(n));
    } else {
      expected = 200;
    }
    return new AssertionRule({
      type: "status",
      operator: (input.operator as "equals" | "not_equals") ?? "equals",
      expected,
    });
  }

  if (input.type === "header") {
    if (!target) {
      throw new ValidationException("Assertion header harus menyertakan nama header target", [
        { name: "target", reason: "Nama header wajib diisi." },
      ]);
    }
    return new AssertionRule({
      type: "header",
      target,
      operator: (input.operator as "exists" | "equals" | "contains") ?? "exists",
      expected: rawExpected !== undefined ? String(rawExpected) : undefined,
    });
  }

  if (input.type === "body-json") {
    if (!target) {
      throw new ValidationException("Assertion body-json harus menyertakan JSONPath target", [
        { name: "target", reason: "Target JSONPath wajib diisi." },
      ]);
    }
    return new AssertionRule({
      type: "body-json",
      target,
      operator: (input.operator as "exists" | "equals" | "not_equals" | "contains") ?? "exists",
      expected: rawExpected as string | number | boolean | undefined,
    });
  }

  throw new ValidationException(`Tipe assertion "${input.type}" tidak didukung.`, [
    { name: "type", reason: "Tipe assertion tidak valid." },
  ]);
}
