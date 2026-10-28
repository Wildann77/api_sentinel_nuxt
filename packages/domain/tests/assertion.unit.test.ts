import { describe, expect, it } from "vitest";
import { FailureCategory } from "../src/enums/index.js";
import { ValidationException } from "../src/errors/domain-exception.js";
import { AssertionEngine, type HttpResponseData } from "../src/services/assertion-engine.js";
import { JsonPathParser } from "../src/services/json-path.js";
import { AssertionRule } from "../src/value-objects/assertion-rule.js";

describe("P2.5 — AssertionRule VO", () => {
  it("creates valid status assertion rules (single or multi-status)", () => {
    const single = AssertionRule.parse({
      type: "status",
      operator: "equals",
      expected: 200,
    });
    expect(single.type).toBe("status");
    expect(single.operator).toBe("equals");
    expect(single.expected).toEqual([200]);

    const multi = AssertionRule.parse({
      type: "status",
      operator: "equals",
      expected: [200, 204],
    });
    expect(multi.expected).toEqual([200, 204]);

    const notEquals = AssertionRule.parse({
      type: "status",
      operator: "not_equals",
      expected: [500, 502, 503],
    });
    expect(notEquals.operator).toBe("not_equals");
  });

  it("rejects invalid status codes", () => {
    expect(() =>
      AssertionRule.parse({
        type: "status",
        expected: 99,
      }),
    ).toThrow(ValidationException);

    expect(() =>
      AssertionRule.parse({
        type: "status",
        expected: 600,
      }),
    ).toThrow(ValidationException);

    expect(() =>
      AssertionRule.parse({
        type: "status",
        expected: [],
      }),
    ).toThrow(ValidationException);
  });

  it("creates valid header assertion rules with case-preserving target", () => {
    const headerExists = AssertionRule.parse({
      type: "header",
      target: "Content-Type",
      operator: "exists",
    });
    expect(headerExists.target).toBe("Content-Type");
    expect(headerExists.operator).toBe("exists");
    expect(headerExists.expected).toBeUndefined();

    const headerEquals = AssertionRule.parse({
      type: "header",
      target: "Content-Type",
      operator: "equals",
      expected: "application/json",
    });
    expect(headerEquals.expected).toBe("application/json");

    const headerContains = AssertionRule.parse({
      type: "header",
      target: "Authorization",
      operator: "contains",
      expected: "Bearer",
    });
    expect(headerContains.operator).toBe("contains");
  });

  it("rejects header assertion with missing target or invalid expected type", () => {
    expect(() =>
      AssertionRule.parse({
        type: "header",
        target: "",
        operator: "exists",
      }),
    ).toThrow(ValidationException);

    expect(() =>
      AssertionRule.parse({
        type: "header",
        target: "Content-Type",
        operator: "equals",
        expected: 123 as unknown as string,
      }),
    ).toThrow(ValidationException);
  });

  it("creates valid body-json assertion rules with strict typed expected values", () => {
    const stringRule = AssertionRule.parse({
      type: "body-json",
      target: "$.status",
      operator: "equals",
      expected: "success",
    });
    expect(stringRule.target).toBe("$.status");
    expect(stringRule.expected).toBe("success");

    const numRule = AssertionRule.parse({
      type: "body-json",
      target: "$.data.count",
      operator: "equals",
      expected: 42,
    });
    expect(numRule.expected).toBe(42);

    const boolRule = AssertionRule.parse({
      type: "body-json",
      target: "$.active",
      operator: "equals",
      expected: true,
    });
    expect(boolRule.expected).toBe(true);
  });

  it("rejects JSONPath query longer than 100 characters", () => {
    const path100 = `$['${"a".repeat(95)}']`;
    expect(path100.length).toBe(100);
    const validRule = AssertionRule.parse({
      type: "body-json",
      target: path100,
      operator: "exists",
    });
    expect(validRule.target?.length).toBe(100);

    const path101 = `$['${"a".repeat(96)}']`;
    expect(path101.length).toBe(101);
    expect(() =>
      AssertionRule.parse({
        type: "body-json",
        target: path101,
        operator: "exists",
      }),
    ).toThrow(ValidationException);
  });

  it("enforces rule limit: max 10 rules per monitor, rejects 11th rule", () => {
    const rules10 = Array.from({ length: 10 }, (_, i) => ({
      type: "status" as const,
      expected: 200 + i,
    }));
    const parsedList = AssertionRule.parseList(rules10);
    expect(parsedList.length).toBe(10);

    const rules11 = Array.from({ length: 11 }, (_, i) => ({
      type: "status" as const,
      expected: 200 + i,
    }));
    expect(() => AssertionRule.parseList(rules11)).toThrow(ValidationException);
  });
});

describe("P2.6 — AssertionEngine (Safe AST Parser & Evaluator)", () => {
  it("rejects script and filter injection expressions (mitigating CVE-2024-21534 / CVE-2025-1302)", () => {
    const maliciousPayloads = [
      "$..[?(@.constructor...)]",
      "$.data[?(@.id > 1)]",
      "$(alert(1))",
      "$.__proto__.polluted",
      "$['constructor']",
      "$.prototype.polluted",
    ];

    for (const payload of maliciousPayloads) {
      expect(() => JsonPathParser.parse(payload)).toThrow(ValidationException);
    }
  });

  it("parses valid JSONPath grammar subset into AST and evaluates correctly", () => {
    const query = "$.users[1].profile.name";
    const ast = JsonPathParser.parse(query);
    expect(ast.segments).toHaveLength(5);
    expect(ast.segments[0]?.type).toBe("root");
    expect(ast.segments[1]?.type).toBe("property");
    expect(ast.segments[2]?.type).toBe("index");
    expect(ast.segments[3]?.type).toBe("property");
    expect(ast.segments[4]?.type).toBe("property");

    const data = {
      users: [{ profile: { name: "Alice" } }, { profile: { name: "Bob" } }],
    };
    const nodes = JsonPathParser.evaluate(ast, data);
    expect(nodes).toEqual(["Bob"]);
  });

  it("evaluates wildcard [*] and recursive descent ..key", () => {
    const data = {
      items: [
        { id: 101, details: { code: "A1" } },
        { id: 102, details: { code: "B2" } },
      ],
      meta: {
        code: "ROOT_META",
      },
    };

    const wildcardAst = JsonPathParser.parse("$.items[*].id");
    const wildcardResult = JsonPathParser.evaluate(wildcardAst, data);
    expect(wildcardResult).toEqual([101, 102]);

    const recursiveAst = JsonPathParser.parse("$..code");
    const recursiveResult = JsonPathParser.evaluate(recursiveAst, data);
    expect(recursiveResult).toContain("A1");
    expect(recursiveResult).toContain("B2");
    expect(recursiveResult).toContain("ROOT_META");
  });

  it("evaluates status code rules: passes on match, fails with HTTP_STATUS_MISMATCH", () => {
    const rule = AssertionRule.parse({
      type: "status",
      operator: "equals",
      expected: [200, 201],
    });

    const successRes: HttpResponseData = {
      statusCode: 200,
      headers: {},
    };
    const successResult = AssertionEngine.evaluate([rule], successRes);
    expect(successResult.passed).toBe(true);
    expect(successResult.results[0]?.status).toBe("PASS");

    const failRes: HttpResponseData = {
      statusCode: 500,
      headers: {},
    };
    const failResult = AssertionEngine.evaluate([rule], failRes);
    expect(failResult.passed).toBe(false);
    expect(failResult.failureCategory).toBe(FailureCategory.HTTP_STATUS_MISMATCH);
    expect(failResult.failureReason).toContain("Expected status 200, 201, received 500");
  });

  it("evaluates header rules case-insensitively and handles contains/equals/exists", () => {
    const rules = [
      AssertionRule.parse({
        type: "header",
        target: "content-type",
        operator: "contains",
        expected: "application/json",
      }),
      AssertionRule.parse({
        type: "header",
        target: "X-Trace-Id",
        operator: "exists",
      }),
      AssertionRule.parse({
        type: "header",
        target: "cache-control",
        operator: "equals",
        expected: "no-store",
      }),
    ];

    const res: HttpResponseData = {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "x-trace-id": "trace-abc-123",
        "CACHE-CONTROL": "no-store",
      },
    };

    const result = AssertionEngine.evaluate(rules, res);
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(3);
    expect(result.results.every((r) => r.status === "PASS")).toBe(true);
  });

  it("reports HEADER_ASSERTION_FAILED when header does not exist or mismatch", () => {
    const rule = AssertionRule.parse({
      type: "header",
      target: "X-Required-Header",
      operator: "exists",
    });

    const res: HttpResponseData = {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
    };

    const result = AssertionEngine.evaluate([rule], res);
    expect(result.passed).toBe(false);
    expect(result.failureCategory).toBe(FailureCategory.HEADER_ASSERTION_FAILED);
    expect(result.failureReason).toContain("X-Required-Header");
  });

  it("evaluates JSON body with strict type matching (123 !== '123')", () => {
    const numberRule = AssertionRule.parse({
      type: "body-json",
      target: "$.count",
      operator: "equals",
      expected: 123,
    });

    // Body with number 123 -> PASS
    const passRes: HttpResponseData = {
      statusCode: 200,
      headers: {},
      bodyText: JSON.stringify({ count: 123 }),
    };
    expect(AssertionEngine.evaluate([numberRule], passRes).passed).toBe(true);

    // Body with string "123" -> FAIL (strict type equality)
    const failRes: HttpResponseData = {
      statusCode: 200,
      headers: {},
      bodyText: JSON.stringify({ count: "123" }),
    };
    const failResult = AssertionEngine.evaluate([numberRule], failRes);
    expect(failResult.passed).toBe(false);
    expect(failResult.failureCategory).toBe(FailureCategory.BODY_ASSERTION_FAILED);
    expect(failResult.failureReason).toContain('Expected 123, received "123"');
  });

  it("evaluates contains operator for array and string in body JSON", () => {
    const stringContainsRule = AssertionRule.parse({
      type: "body-json",
      target: "$.message",
      operator: "contains",
      expected: "sentinel",
    });

    const arrayContainsRule = AssertionRule.parse({
      type: "body-json",
      target: "$.tags",
      operator: "contains",
      expected: "production",
    });

    const res: HttpResponseData = {
      statusCode: 200,
      headers: {},
      bodyText: JSON.stringify({
        message: "welcome to api-sentinel monitoring",
        tags: ["api", "production", "monitoring"],
      }),
    };

    const result = AssertionEngine.evaluate([stringContainsRule, arrayContainsRule], res);
    expect(result.passed).toBe(true);
  });

  it("fails with BODY_JSON_INVALID when body is invalid JSON or empty", () => {
    const rule = AssertionRule.parse({
      type: "body-json",
      target: "$.data",
      operator: "exists",
    });

    const invalidJsonRes: HttpResponseData = {
      statusCode: 200,
      headers: {},
      bodyText: "<html>502 Bad Gateway</html>",
    };

    const result = AssertionEngine.evaluate([rule], invalidJsonRes);
    expect(result.passed).toBe(false);
    expect(result.failureCategory).toBe(FailureCategory.BODY_JSON_INVALID);
    expect(result.failureReason).toContain("bukan JSON valid");
  });

  it("fails with named reason when JSONPath target does not exist", () => {
    const rule = AssertionRule.parse({
      type: "body-json",
      target: "$.missing.property",
      operator: "equals",
      expected: "active",
    });

    const res: HttpResponseData = {
      statusCode: 200,
      headers: {},
      bodyText: JSON.stringify({ data: { user: "john" } }),
    };

    const result = AssertionEngine.evaluate([rule], res);
    expect(result.passed).toBe(false);
    expect(result.failureCategory).toBe(FailureCategory.BODY_ASSERTION_FAILED);
    expect(result.failureReason).toContain("tidak ditemukan pada body");
  });

  it("passes only when all active rules pass (PRD §4.7)", () => {
    const rules = [
      AssertionRule.parse({ type: "status", expected: 200 }),
      AssertionRule.parse({ type: "header", target: "X-Server", operator: "exists" }),
      AssertionRule.parse({
        type: "body-json",
        target: "$.ok",
        operator: "equals",
        expected: true,
      }),
    ];

    // Status pass, header fail, body pass -> Overall FAIL
    const mixedRes: HttpResponseData = {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      bodyText: JSON.stringify({ ok: true }),
    };

    const result = AssertionEngine.evaluate(rules, mixedRes);
    expect(result.passed).toBe(false);
    expect(result.results[0]?.status).toBe("PASS");
    expect(result.results[1]?.status).toBe("FAIL");
    expect(result.results[2]?.status).toBe("PASS");
    expect(result.failureCategory).toBe(FailureCategory.HEADER_ASSERTION_FAILED);
  });

  it("evaluates status not_equals operator and empty expected fallback", () => {
    const notEqualsRule = AssertionRule.parse({
      type: "status",
      operator: "not_equals",
      expected: [500, 502],
    });

    const passRes: HttpResponseData = { statusCode: 200, headers: {} };
    expect(AssertionEngine.evaluate([notEqualsRule], passRes).passed).toBe(true);

    const failRes: HttpResponseData = { statusCode: 500, headers: {} };
    const failResult = AssertionEngine.evaluate([notEqualsRule], failRes);
    expect(failResult.passed).toBe(false);
    expect(failResult.failureCategory).toBe(FailureCategory.HTTP_STATUS_MISMATCH);
  });

  it("evaluates header equals and contains when header is missing or header is array", () => {
    const equalsRule = AssertionRule.parse({
      type: "header",
      target: "X-Env",
      operator: "equals",
      expected: "production",
    });

    const missingRes: HttpResponseData = { statusCode: 200, headers: {} };
    const missingResResult = AssertionEngine.evaluate([equalsRule], missingRes);
    expect(missingResResult.passed).toBe(false);
    expect(missingResResult.results[0]?.message).toContain("tidak ditemukan");

    const mismatchRes: HttpResponseData = {
      statusCode: 200,
      headers: { "X-Env": "staging" },
    };
    const mismatchResult = AssertionEngine.evaluate([equalsRule], mismatchRes);
    expect(mismatchResult.passed).toBe(false);
    expect(mismatchResult.results[0]?.message).toContain(
      'Expected header "X-Env" to equal "production"',
    );

    const containsRule = AssertionRule.parse({
      type: "header",
      target: "X-Custom",
      operator: "contains",
      expected: "val2",
    });
    const missingContains = AssertionEngine.evaluate([containsRule], missingRes);
    expect(missingContains.passed).toBe(false);

    const arrayHeaderRes: HttpResponseData = {
      statusCode: 200,
      headers: { "X-Custom": ["val1", "val2"] },
    };
    expect(AssertionEngine.evaluate([containsRule], arrayHeaderRes).passed).toBe(true);

    const mismatchContainsRes: HttpResponseData = {
      statusCode: 200,
      headers: { "X-Custom": "other" },
    };
    expect(AssertionEngine.evaluate([containsRule], mismatchContainsRes).passed).toBe(false);
  });

  it("evaluates body-json not_equals operator", () => {
    const notEqualsRule = AssertionRule.parse({
      type: "body-json",
      target: "$.status",
      operator: "not_equals",
      expected: "ERROR",
    });

    const passRes: HttpResponseData = {
      statusCode: 200,
      headers: {},
      bodyText: JSON.stringify({ status: "OK" }),
    };
    expect(AssertionEngine.evaluate([notEqualsRule], passRes).passed).toBe(true);

    const failRes: HttpResponseData = {
      statusCode: 200,
      headers: {},
      bodyText: JSON.stringify({ status: "ERROR" }),
    };
    const failResult = AssertionEngine.evaluate([notEqualsRule], failRes);
    expect(failResult.passed).toBe(false);
    expect(failResult.failureCategory).toBe(FailureCategory.BODY_ASSERTION_FAILED);

    const missingRes: HttpResponseData = {
      statusCode: 200,
      headers: {},
      bodyText: JSON.stringify({ count: 10 }),
    };
    const missingResult = AssertionEngine.evaluate([notEqualsRule], missingRes);
    expect(missingResult.passed).toBe(false);
    expect(missingResult.results[0]?.message).toContain("tidak ditemukan");
  });

  it("evaluates body-json exists operator with multiple nodes and empty nodes", () => {
    const existsRule = AssertionRule.parse({
      type: "body-json",
      target: "$.items[*]",
      operator: "exists",
    });

    const multiRes: HttpResponseData = {
      statusCode: 200,
      headers: {},
      bodyText: JSON.stringify({ items: ["a", "b"] }),
    };
    const multiResult = AssertionEngine.evaluate([existsRule], multiRes);
    expect(multiResult.passed).toBe(true);
    expect(Array.isArray(multiResult.results[0]?.actual)).toBe(true);

    const emptyRes: HttpResponseData = {
      statusCode: 200,
      headers: {},
      bodyText: JSON.stringify({ items: [] }),
    };
    const emptyResult = AssertionEngine.evaluate([existsRule], emptyRes);
    expect(emptyResult.passed).toBe(false);
  });

  it("evaluates body-json contains operator when target is missing or mismatch", () => {
    const containsRule = AssertionRule.parse({
      type: "body-json",
      target: "$.message",
      operator: "contains",
      expected: "healthy",
    });

    const missingRes: HttpResponseData = {
      statusCode: 200,
      headers: {},
      bodyText: JSON.stringify({ other: "data" }),
    };
    const missingResult = AssertionEngine.evaluate([containsRule], missingRes);
    expect(missingResult.passed).toBe(false);
    expect(missingResult.results[0]?.message).toContain("tidak ditemukan");

    const mismatchRes: HttpResponseData = {
      statusCode: 200,
      headers: {},
      bodyText: JSON.stringify({ message: 12345 }),
    };
    const mismatchResult = AssertionEngine.evaluate([containsRule], mismatchRes);
    expect(mismatchResult.passed).toBe(false);
  });

  it("handles null, undefined, and empty string bodyText", () => {
    const rule = AssertionRule.parse({
      type: "body-json",
      target: "$.ok",
      operator: "exists",
    });

    const nullRes: HttpResponseData = { statusCode: 200, headers: {}, bodyText: null };
    expect(AssertionEngine.evaluate([rule], nullRes).passed).toBe(false);

    const emptyRes: HttpResponseData = { statusCode: 200, headers: {}, bodyText: "   " };
    expect(AssertionEngine.evaluate([rule], emptyRes).passed).toBe(false);
  });

  it("handles JSONPath parsing exception inside AssertionEngine", () => {
    const invalidAstRule = {
      type: "body-json",
      target: "$[invalid bracket",
      operator: "exists",
    } as unknown as AssertionRule;

    const res: HttpResponseData = {
      statusCode: 200,
      headers: {},
      bodyText: JSON.stringify({ a: 1 }),
    };

    const result = AssertionEngine.evaluate([invalidAstRule], res);
    expect(result.passed).toBe(false);
    expect(result.failureCategory).toBe(FailureCategory.BODY_ASSERTION_FAILED);
    expect(result.results[0]?.message).toContain("JSONPath parsing gagal");
  });

  it("thoroughly tests JsonPathParser syntax and AST evaluator edge cases", () => {
    // Non-string or empty query
    expect(() => JsonPathParser.parse(null as unknown as string)).toThrow(ValidationException);
    expect(() => JsonPathParser.parse("")).toThrow(ValidationException);
    expect(() => JsonPathParser.parse("A".repeat(101))).toThrow(ValidationException);
    expect(() => JsonPathParser.parse("no-dollar")).toThrow(ValidationException);
    expect(() => JsonPathParser.parse("$.")).toThrow(ValidationException);
    expect(() => JsonPathParser.parse("$..")).toThrow(ValidationException);
    expect(() => JsonPathParser.parse("$..123bad")).toThrow(ValidationException);
    expect(() => JsonPathParser.parse("$.__proto__")).toThrow(ValidationException);
    expect(() => JsonPathParser.parse("$.prototype")).toThrow(ValidationException);
    expect(() => JsonPathParser.parse("$.constructor")).toThrow(ValidationException);
    expect(() => JsonPathParser.parse("$[?(@.id == 1)]")).toThrow(ValidationException);
    expect(() => JsonPathParser.parse("$[unclosed")).toThrow(ValidationException);
    expect(() => JsonPathParser.parse("$[]")).toThrow(ValidationException);
    expect(() => JsonPathParser.parse("$['__proto__']")).toThrow(ValidationException);
    expect(() => JsonPathParser.parse("$[-5]")).toThrow(ValidationException);
    expect(() => JsonPathParser.parse("$[invalid!]")).toThrow(ValidationException);
    expect(() => JsonPathParser.parse("$['unclosed")).toThrow(ValidationException);
    expect(() => JsonPathParser.parse("$['bad'trailing]")).toThrow(ValidationException);

    // Valid bracket string properties: single quote, double quote
    const bracketSingle = JsonPathParser.parse("$['user-name']");
    expect(JsonPathParser.evaluate(bracketSingle, { "user-name": "alice" })).toEqual(["alice"]);

    const bracketDouble = JsonPathParser.parse('$["id"]');
    expect(JsonPathParser.evaluate(bracketDouble, { id: 42 })).toEqual([42]);

    // Array index
    const indexAst = JsonPathParser.parse("$.items[1]");
    expect(JsonPathParser.evaluate(indexAst, { items: ["first", "second", "third"] })).toEqual([
      "second",
    ]);
    expect(JsonPathParser.evaluate(indexAst, { items: ["only_one"] })).toEqual([]);
    expect(JsonPathParser.evaluate(indexAst, { items: "not_array" })).toEqual([]);

    // Wildcard on objects and primitives
    const wildcardAst = JsonPathParser.parse("$.data.*");
    expect(JsonPathParser.evaluate(wildcardAst, { data: { a: 1, b: 2 } })).toEqual([1, 2]);
    expect(JsonPathParser.evaluate(wildcardAst, { data: null })).toEqual([]);
    expect(JsonPathParser.evaluate(wildcardAst, { data: "primitive" })).toEqual([]);

    // Recursive on non-object root
    const recAst = JsonPathParser.parse("$..val");
    expect(JsonPathParser.evaluate(recAst, "just string")).toEqual([]);
    expect(JsonPathParser.evaluate(recAst, null)).toEqual([]);
    expect(
      JsonPathParser.evaluate(recAst, { nested: { val: 99 }, other: [1, { val: 100 }] }),
    ).toEqual([99, 100]);
  });
});
