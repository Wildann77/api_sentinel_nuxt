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
});
