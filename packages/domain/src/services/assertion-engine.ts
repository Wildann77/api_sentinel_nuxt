import { FailureCategory } from "../enums/index.js";
import type {
  AssertionOperator,
  AssertionRule,
  AssertionRuleType,
} from "../value-objects/assertion-rule.js";
import { JsonPathParser } from "./json-path.js";

export interface HttpResponseData {
  readonly statusCode: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly bodyText?: string | null;
}

export interface AssertionExecutionResult {
  readonly ruleType: AssertionRuleType;
  readonly target?: string;
  readonly operator: AssertionOperator;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly status: "PASS" | "FAIL";
  readonly message?: string;
}

export interface AssertionEngineResult {
  readonly passed: boolean;
  readonly results: readonly AssertionExecutionResult[];
  readonly failureReason?: string;
  readonly failureCategory?: FailureCategory;
}

export function evaluateAssertions(
  rules: readonly AssertionRule[],
  response: HttpResponseData,
): AssertionEngineResult {
  const results: AssertionExecutionResult[] = [];

  let jsonParsed = false;
  let parsedJsonValue: unknown;
  let jsonParseError: string | null = null;

  const parseJsonOnce = (): void => {
    if (jsonParsed) return;
    jsonParsed = true;

    const raw = response.bodyText;
    if (raw === null || raw === undefined || raw.trim().length === 0) {
      jsonParseError = "Body respons kosong atau tidak tersedia";
      return;
    }

    try {
      parsedJsonValue = JSON.parse(raw);
    } catch (err) {
      jsonParseError = `Body respons bukan JSON valid: ${(err as Error).message}`;
    }
  };

  for (const rule of rules) {
    if (rule.type === "status") {
      const expectedCodes = (rule.expected as readonly number[] | undefined) ?? [];
      const actual = response.statusCode;

      if (rule.operator === "equals") {
        const match = expectedCodes.includes(actual);
        results.push({
          ruleType: "status",
          operator: "equals",
          expected: expectedCodes,
          actual,
          status: match ? "PASS" : "FAIL",
          message: match
            ? undefined
            : `Expected status ${expectedCodes.join(", ")}, received ${actual}`,
        });
      } else if (rule.operator === "not_equals") {
        const match = !expectedCodes.includes(actual);
        results.push({
          ruleType: "status",
          operator: "not_equals",
          expected: expectedCodes,
          actual,
          status: match ? "PASS" : "FAIL",
          message: match
            ? undefined
            : `Expected status not in [${expectedCodes.join(", ")}], received ${actual}`,
        });
      }
    } else if (rule.type === "header") {
      const targetHeaderName = rule.target ?? "";
      const targetLower = targetHeaderName.toLowerCase();

      const matchingKey = Object.keys(response.headers).find(
        (k) => k.toLowerCase() === targetLower,
      );
      const rawHeaderVal = matchingKey !== undefined ? response.headers[matchingKey] : undefined;
      const headerValStr = Array.isArray(rawHeaderVal)
        ? rawHeaderVal.join(", ")
        : typeof rawHeaderVal === "string"
          ? rawHeaderVal
          : undefined;

      if (rule.operator === "exists") {
        const exists = headerValStr !== undefined;
        results.push({
          ruleType: "header",
          target: targetHeaderName,
          operator: "exists",
          expected: undefined,
          actual: headerValStr,
          status: exists ? "PASS" : "FAIL",
          message: exists ? undefined : `Header "${targetHeaderName}" tidak ditemukan pada respons`,
        });
      } else if (rule.operator === "equals") {
        const expected = rule.expected as string;
        const equals = headerValStr === expected;
        results.push({
          ruleType: "header",
          target: targetHeaderName,
          operator: "equals",
          expected,
          actual: headerValStr,
          status: equals ? "PASS" : "FAIL",
          message: equals
            ? undefined
            : headerValStr === undefined
              ? `Header "${targetHeaderName}" tidak ditemukan pada respons`
              : `Expected header "${targetHeaderName}" to equal "${expected}", received "${headerValStr}"`,
        });
      } else if (rule.operator === "contains") {
        const expected = rule.expected as string;
        const contains = headerValStr?.includes(expected) ?? false;
        results.push({
          ruleType: "header",
          target: targetHeaderName,
          operator: "contains",
          expected,
          actual: headerValStr,
          status: contains ? "PASS" : "FAIL",
          message: contains
            ? undefined
            : headerValStr === undefined
              ? `Header "${targetHeaderName}" tidak ditemukan pada respons`
              : `Expected header "${targetHeaderName}" to contain "${expected}", received "${headerValStr}"`,
        });
      }
    } else if (rule.type === "body-json") {
      parseJsonOnce();

      if (jsonParseError !== null) {
        results.push({
          ruleType: "body-json",
          target: rule.target,
          operator: rule.operator,
          expected: rule.expected,
          actual: undefined,
          status: "FAIL",
          message: jsonParseError,
        });
        continue;
      }

      let nodes: readonly unknown[];
      try {
        const ast = JsonPathParser.parse(rule.target ?? "$");
        nodes = JsonPathParser.evaluate(ast, parsedJsonValue);
      } catch (err) {
        results.push({
          ruleType: "body-json",
          target: rule.target,
          operator: rule.operator,
          expected: rule.expected,
          actual: undefined,
          status: "FAIL",
          message: `JSONPath parsing gagal: ${(err as Error).message}`,
        });
        continue;
      }

      if (rule.operator === "exists") {
        const exists = nodes.length > 0;
        results.push({
          ruleType: "body-json",
          target: rule.target,
          operator: "exists",
          expected: undefined,
          actual: exists ? (nodes.length === 1 ? nodes[0] : nodes) : undefined,
          status: exists ? "PASS" : "FAIL",
          message: exists ? undefined : `Nilai JSONPath "${rule.target}" tidak ditemukan pada body`,
        });
      } else if (rule.operator === "equals") {
        if (nodes.length === 0) {
          results.push({
            ruleType: "body-json",
            target: rule.target,
            operator: "equals",
            expected: rule.expected,
            actual: undefined,
            status: "FAIL",
            message: `Nilai JSONPath "${rule.target}" tidak ditemukan pada body`,
          });
        } else {
          const matchNode = nodes.find((n) => n === rule.expected);
          const passed = matchNode !== undefined;
          results.push({
            ruleType: "body-json",
            target: rule.target,
            operator: "equals",
            expected: rule.expected,
            actual: passed ? matchNode : nodes[0],
            status: passed ? "PASS" : "FAIL",
            message: passed
              ? undefined
              : `Expected ${JSON.stringify(rule.expected)}, received ${JSON.stringify(nodes[0])}`,
          });
        }
      } else if (rule.operator === "not_equals") {
        if (nodes.length === 0) {
          results.push({
            ruleType: "body-json",
            target: rule.target,
            operator: "not_equals",
            expected: rule.expected,
            actual: undefined,
            status: "FAIL",
            message: `Nilai JSONPath "${rule.target}" tidak ditemukan pada body`,
          });
        } else {
          const hasEqual = nodes.some((n) => n === rule.expected);
          results.push({
            ruleType: "body-json",
            target: rule.target,
            operator: "not_equals",
            expected: rule.expected,
            actual: nodes[0],
            status: !hasEqual ? "PASS" : "FAIL",
            message: !hasEqual
              ? undefined
              : `Expected not ${JSON.stringify(rule.expected)}, but received matching value`,
          });
        }
      } else if (rule.operator === "contains") {
        if (nodes.length === 0) {
          results.push({
            ruleType: "body-json",
            target: rule.target,
            operator: "contains",
            expected: rule.expected,
            actual: undefined,
            status: "FAIL",
            message: `Nilai JSONPath "${rule.target}" tidak ditemukan pada body`,
          });
        } else {
          const matchNode = nodes.find((n) => {
            if (typeof n === "string" && typeof rule.expected === "string") {
              return n.includes(rule.expected);
            }
            if (Array.isArray(n)) {
              return n.some((item) => item === rule.expected);
            }
            return false;
          });
          const passed = matchNode !== undefined;
          results.push({
            ruleType: "body-json",
            target: rule.target,
            operator: "contains",
            expected: rule.expected,
            actual: passed ? matchNode : nodes[0],
            status: passed ? "PASS" : "FAIL",
            message: passed
              ? undefined
              : `Expected "${rule.target}" to contain ${JSON.stringify(rule.expected)}, but found ${JSON.stringify(nodes[0])}`,
          });
        }
      }
    }
  }

  const firstFailed = results.find((r) => r.status === "FAIL");
  if (!firstFailed) {
    return {
      passed: true,
      results: Object.freeze(results),
    };
  }

  let failureCategory: FailureCategory;
  if (firstFailed.ruleType === "status") {
    failureCategory = FailureCategory.HTTP_STATUS_MISMATCH;
  } else if (firstFailed.ruleType === "header") {
    failureCategory = FailureCategory.HEADER_ASSERTION_FAILED;
  } else {
    if (firstFailed.message?.startsWith("Body respons bukan JSON valid")) {
      failureCategory = FailureCategory.BODY_JSON_INVALID;
    } else {
      failureCategory = FailureCategory.BODY_ASSERTION_FAILED;
    }
  }

  return {
    passed: false,
    results: Object.freeze(results),
    failureReason: firstFailed.message,
    failureCategory,
  };
}

export const AssertionEngine = {
  evaluate: evaluateAssertions,
} as const;
export type AssertionEngine = typeof AssertionEngine;
