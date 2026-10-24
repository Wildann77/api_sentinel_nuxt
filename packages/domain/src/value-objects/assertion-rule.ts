import { ValidationException } from "../errors/domain-exception.js";
import { JsonPathParser } from "../services/json-path.js";

export type AssertionRuleType = "status" | "header" | "body-json";
export type AssertionOperator = "exists" | "equals" | "not_equals" | "contains";

export const ASSERTION_RULE_TYPES = ["status", "header", "body-json"] as const;
export const ASSERTION_OPERATORS = ["exists", "equals", "not_equals", "contains"] as const;

export interface BaseAssertionRuleProps {
  readonly type: AssertionRuleType;
  readonly operator: AssertionOperator;
  readonly target?: string;
  readonly expected?: unknown;
}

export interface StatusAssertionRuleProps {
  readonly type: "status";
  readonly operator?: "equals" | "not_equals";
  readonly expected: number | readonly number[];
}

export interface HeaderAssertionRuleProps {
  readonly type: "header";
  readonly target: string;
  readonly operator: "exists" | "equals" | "contains";
  readonly expected?: string;
}

export interface BodyJsonAssertionRuleProps {
  readonly type: "body-json";
  readonly target: string;
  readonly operator: "exists" | "equals" | "not_equals" | "contains";
  readonly expected?: string | number | boolean;
}

export type AssertionRuleProps =
  | StatusAssertionRuleProps
  | HeaderAssertionRuleProps
  | BodyJsonAssertionRuleProps;

export class AssertionRule {
  public static readonly MAX_RULES_PER_MONITOR = 10;
  public static readonly MAX_JSONPATH_LENGTH = 100;

  public readonly type: AssertionRuleType;
  public readonly operator: AssertionOperator;
  public readonly target?: string;
  public readonly expected?: unknown;

  constructor(props: AssertionRuleProps) {
    if (!props || typeof props !== "object") {
      throw new ValidationException("Definisi AssertionRule tidak valid: harus berupa objek", [
        { name: "assertionRule", reason: "Aturan assertion harus berupa objek konfigurasi." },
      ]);
    }

    if (!ASSERTION_RULE_TYPES.includes(props.type as (typeof ASSERTION_RULE_TYPES)[number])) {
      throw new ValidationException(`Tipe assertion tidak didukung: "${props.type}"`, [
        {
          name: "type",
          reason: `Tipe assertion harus salah satu dari: ${ASSERTION_RULE_TYPES.join(", ")}.`,
        },
      ]);
    }

    this.type = props.type;

    if (this.type === "status") {
      const statusProps = props as StatusAssertionRuleProps;
      const op = statusProps.operator ?? "equals";
      if (op !== "equals" && op !== "not_equals") {
        throw new ValidationException(`Operator tidak valid untuk status assertion: "${op}"`, [
          {
            name: "operator",
            reason: 'Operator status hanya mendukung "equals" atau "not_equals".',
          },
        ]);
      }
      this.operator = op;

      const expectedRaw = statusProps.expected;
      const expectedArray = Array.isArray(expectedRaw) ? expectedRaw : [expectedRaw];

      if (expectedArray.length === 0) {
        throw new ValidationException("Kode status ekspektasi tidak boleh kosong", [
          {
            name: "expected",
            reason: "Minimal satu kode status HTTP yang diharapkan harus ditentukan.",
          },
        ]);
      }

      for (const code of expectedArray) {
        if (typeof code !== "number" || !Number.isInteger(code) || code < 100 || code > 599) {
          throw new ValidationException(`Kode status HTTP tidak valid: ${code}`, [
            {
              name: "expected",
              reason: "Kode status HTTP harus berupa bilangan bulat antara 100 dan 599.",
            },
          ]);
        }
      }

      this.expected = Object.freeze([...expectedArray]);
      this.target = undefined;
    } else if (this.type === "header") {
      const headerProps = props as HeaderAssertionRuleProps;
      if (
        !headerProps.target ||
        typeof headerProps.target !== "string" ||
        headerProps.target.trim().length === 0
      ) {
        throw new ValidationException("Nama header target tidak boleh kosong", [
          { name: "target", reason: "Nama header yang akan dievaluasi wajib diisi." },
        ]);
      }

      this.target = headerProps.target.trim();

      const op = headerProps.operator;
      if (op !== "exists" && op !== "equals" && op !== "contains") {
        throw new ValidationException(`Operator tidak didukung untuk header assertion: "${op}"`, [
          {
            name: "operator",
            reason: 'Operator header hanya mendukung "exists", "equals", atau "contains".',
          },
        ]);
      }
      this.operator = op;

      if (op === "exists") {
        this.expected = undefined;
      } else {
        if (typeof headerProps.expected !== "string") {
          throw new ValidationException(
            `Ekspektasi nilai header untuk operator "${op}" harus berupa string`,
            [
              {
                name: "expected",
                reason: `Nilai header yang diharapkan untuk operator "${op}" harus berupa teks.`,
              },
            ],
          );
        }
        this.expected = headerProps.expected;
      }
    } else {
      // body-json
      const jsonProps = props as BodyJsonAssertionRuleProps;
      if (
        !jsonProps.target ||
        typeof jsonProps.target !== "string" ||
        jsonProps.target.trim().length === 0
      ) {
        throw new ValidationException("Target query JSONPath tidak boleh kosong", [
          { name: "target", reason: "Target ekspresi JSONPath wajib diisi." },
        ]);
      }

      const query = jsonProps.target.trim();
      if (query.length > AssertionRule.MAX_JSONPATH_LENGTH) {
        throw new ValidationException(
          `Target query JSONPath melampaui batas maksimum ${AssertionRule.MAX_JSONPATH_LENGTH} karakter (${query.length} karakter)`,
          [
            {
              name: "target",
              reason: `Query JSONPath maksimal ${AssertionRule.MAX_JSONPATH_LENGTH} karakter.`,
            },
          ],
        );
      }

      // Validates syntax and prevents eval/script injection
      JsonPathParser.parse(query);
      this.target = query;

      const op = jsonProps.operator;
      if (!ASSERTION_OPERATORS.includes(op as (typeof ASSERTION_OPERATORS)[number])) {
        throw new ValidationException(
          `Operator tidak didukung untuk body-json assertion: "${op}"`,
          [
            {
              name: "operator",
              reason: `Operator body-json harus salah satu dari: ${ASSERTION_OPERATORS.join(", ")}.`,
            },
          ],
        );
      }
      this.operator = op;

      if (op === "exists") {
        this.expected = undefined;
      } else {
        const expectedType = typeof jsonProps.expected;
        if (
          jsonProps.expected === undefined ||
          jsonProps.expected === null ||
          (expectedType !== "string" && expectedType !== "number" && expectedType !== "boolean")
        ) {
          throw new ValidationException(
            `Ekspektasi nilai JSON untuk operator "${op}" harus bertipe string, number, atau boolean`,
            [
              {
                name: "expected",
                reason:
                  "Nilai ekspektasi harus berupa tipe primitif ketat (string, number, atau boolean).",
              },
            ],
          );
        }
        this.expected = jsonProps.expected;
      }
    }
  }

  public static parse(raw: unknown): AssertionRule {
    return new AssertionRule(raw as AssertionRuleProps);
  }

  public static parseList(rawList: unknown): readonly AssertionRule[] {
    if (!Array.isArray(rawList)) {
      throw new ValidationException("Daftar assertion harus berupa array", [
        { name: "assertionRules", reason: "Daftar aturan assertion harus berupa array." },
      ]);
    }

    if (rawList.length > AssertionRule.MAX_RULES_PER_MONITOR) {
      throw new ValidationException(
        `Jumlah aturan assertion (${rawList.length}) melebihi batas maksimum ${AssertionRule.MAX_RULES_PER_MONITOR} aturan per monitor`,
        [
          {
            name: "assertionRules",
            reason: `Maksimum ${AssertionRule.MAX_RULES_PER_MONITOR} aturan gabungan per monitor.`,
          },
        ],
      );
    }

    return Object.freeze(rawList.map((item) => AssertionRule.parse(item)));
  }

  public toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      operator: this.operator,
      ...(this.target !== undefined ? { target: this.target } : {}),
      ...(this.expected !== undefined ? { expected: this.expected } : {}),
    };
  }
}
