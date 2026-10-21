import { describe, expect, it } from "vitest";
import { EndpointUrl, ValidationException } from "../src/index.js";

describe("P2.3 — EndpointUrl VO", () => {
  describe("Valid URLs & Normalization", () => {
    it("parses and normalizes standard HTTP and HTTPS URLs", () => {
      const url = new EndpointUrl("HTTP://API.EXAMPLE.COM:80/V1/Status?foo=Bar#debug");
      expect(url.protocol).toBe("http:");
      expect(url.scheme).toBe("http");
      expect(url.hostname).toBe("api.example.com");
      expect(url.port).toBe(null); // Port 80 default is stripped
      expect(url.pathname).toBe("/V1/Status");
      expect(url.search).toBe("?foo=Bar");
      expect(url.origin).toBe("http://api.example.com");
      expect(url.value).toBe("http://api.example.com/V1/Status?foo=Bar"); // Fragment #debug stripped
      expect(url.isIpLiteral).toBe(false);
    });

    it("handles explicit non-default ports correctly", () => {
      const url = new EndpointUrl("https://api.example.com:8443/data");
      expect(url.port).toBe(8443);
      expect(url.host).toBe("api.example.com:8443");
      expect(url.origin).toBe("https://api.example.com:8443");
      expect(url.value).toBe("https://api.example.com:8443/data");
    });

    it("parses valid public IPv4 literal target", () => {
      const url = new EndpointUrl("http://93.184.216.34:8080/test");
      expect(url.hostname).toBe("93.184.216.34");
      expect(url.isIpLiteral).toBe(true);
      expect(url.port).toBe(8080);
      expect(url.value).toBe("http://93.184.216.34:8080/test");
    });

    it("parses valid public IPv6 bracketed target", () => {
      const url = new EndpointUrl("http://[2606:4700:4700::1111]/dns-query");
      expect(url.hostname).toBe("2606:4700:4700::1111");
      expect(url.isIpLiteral).toBe(true);
      expect(url.host).toBe("[2606:4700:4700::1111]");
      expect(url.value).toBe("http://[2606:4700:4700::1111]/dns-query");
    });

    it("defaults empty pathname to slash", () => {
      const url = new EndpointUrl("https://example.com");
      expect(url.pathname).toBe("/");
      expect(url.value).toBe("https://example.com/");
    });
  });

  describe("Validation Failures (ValidationException with invalidParams)", () => {
    it("rejects empty or whitespace URLs", () => {
      expect(() => new EndpointUrl("")).toThrow(ValidationException);
      expect(() => new EndpointUrl("   ")).toThrow(ValidationException);
    });

    it("rejects URLs exceeding 2048 characters", () => {
      const longUrl = `https://example.com/${"a".repeat(2040)}`;
      expect(() => new EndpointUrl(longUrl)).toThrow(ValidationException);
    });

    it("rejects unsupported protocols (ftp, file, javascript)", () => {
      expect(() => new EndpointUrl("ftp://example.com/file.txt")).toThrow(ValidationException);
      expect(() => new EndpointUrl("file:///etc/passwd")).toThrow(ValidationException);
      expect(() => new EndpointUrl("javascript:alert(1)")).toThrow(ValidationException);
    });

    it("rejects userinfo (user:pass@ or user@)", () => {
      expect(() => new EndpointUrl("http://admin:secret@example.com/api")).toThrow(
        ValidationException,
      );
      expect(() => new EndpointUrl("http://user@example.com/api")).toThrow(ValidationException);
    });

    it("rejects empty hostname", () => {
      expect(() => new EndpointUrl("http:///path")).toThrow(ValidationException);
    });

    it("rejects localhost and subdomain of localhost", () => {
      expect(() => new EndpointUrl("http://localhost:3000/api")).toThrow(ValidationException);
      expect(() => new EndpointUrl("http://sub.localhost:8080/")).toThrow(ValidationException);
      expect(() => new EndpointUrl("https://sentinel.internal.localhost/ping")).toThrow(
        ValidationException,
      );
    });

    it("rejects loopback IPv6 [::1]", () => {
      expect(() => new EndpointUrl("http://[::1]:8080/health")).toThrow(ValidationException);
    });

    it("rejects private IPv4 literals (RFC 1918)", () => {
      expect(() => new EndpointUrl("http://192.168.1.1/status")).toThrow(ValidationException);
      expect(() => new EndpointUrl("http://10.0.0.1/admin")).toThrow(ValidationException);
      expect(() => new EndpointUrl("http://172.16.0.1/internal")).toThrow(ValidationException);
    });

    it("rejects cloud metadata IP (169.254.169.254)", () => {
      expect(() => new EndpointUrl("http://169.254.169.254/latest/meta-data/")).toThrow(
        ValidationException,
      );
    });

    it("rejects non-standard numeric loopback representations (octal, hex, decimal)", () => {
      expect(() => new EndpointUrl("http://0177.0.0.1/")).toThrow(ValidationException); // Octal
      expect(() => new EndpointUrl("http://0x7f000001/")).toThrow(ValidationException); // Hex
      expect(() => new EndpointUrl("http://2130706433/")).toThrow(ValidationException); // Decimal
      expect(() => new EndpointUrl("http://127.1/")).toThrow(ValidationException); // Shorthand
    });

    it("includes invalidParams structured field in ValidationException", () => {
      try {
        new EndpointUrl("http://192.168.1.1/api");
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationException);
        const valErr = err as ValidationException;
        expect(valErr.statusCode).toBe(400);
        expect(valErr.invalidParams).toHaveLength(1);
        expect(valErr.invalidParams[0]?.name).toBe("url");
        expect(valErr.invalidParams[0]?.reason).toContain("SSRF");
      }
    });
  });

  describe("Value Object Methods", () => {
    it("compares equality with other EndpointUrl", () => {
      const u1 = new EndpointUrl("http://example.com/api");
      const u2 = new EndpointUrl("http://example.com/api");
      const u3 = new EndpointUrl("http://example.com/other");

      expect(u1.equals(u2)).toBe(true);
      expect(u1.equals(u3)).toBe(false);
      expect(u1.equals(null)).toBe(false);
    });

    it("supports fromString helper", () => {
      const url = EndpointUrl.fromString("https://example.com/api");
      expect(url.value).toBe("https://example.com/api");
    });

    it("supports tryParse helper", () => {
      expect(EndpointUrl.tryParse("https://example.com/api")).not.toBeNull();
      expect(EndpointUrl.tryParse("http://localhost/")).toBeNull();
      expect(EndpointUrl.tryParse("not-a-url")).toBeNull();
    });

    it("serializes to string and JSON", () => {
      const url = new EndpointUrl("https://example.com/api");
      expect(url.toString()).toBe("https://example.com/api");
      expect(url.toJSON()).toBe("https://example.com/api");
    });
  });
});
