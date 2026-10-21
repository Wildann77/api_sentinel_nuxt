import { describe, expect, it } from "vitest";
import {
  AuthConfigValidator,
  DENIED_HEADERS,
  EncryptedSecret,
  HeaderPolicy,
  ValidationException,
} from "../src/index.js";

describe("P2.4 — EncryptedSecret VO & validasi header", () => {
  const validNonceHex = "0123456789abcdef0123456789abcdef0123456789abcdef"; // 48 hex chars (24 bytes)
  const validMacHex = "fedcba9876543210fedcba9876543210"; // 32 hex chars (16 bytes)
  const validCiphertextHex = "deadbeefcafebabe";
  const validSecretStr = `v1:k2026:${validNonceHex}:${validCiphertextHex}${validMacHex}`;

  describe("EncryptedSecret Value Object", () => {
    it("successfully parses valid ciphertext format", () => {
      const secret = EncryptedSecret.parse(validSecretStr);
      expect(secret.value).toBe(validSecretStr);
      expect(secret.version).toBe("v1");
      expect(secret.keyId).toBe("k2026");
      expect(secret.nonceHex).toBe(validNonceHex);
      expect(secret.ciphertextWithMacHex).toBe(`${validCiphertextHex}${validMacHex}`);
      expect(secret.toString()).toBe(validSecretStr);
      expect(secret.toJSON()).toBe(validSecretStr);
    });

    it("evaluates isValid correctly", () => {
      expect(EncryptedSecret.isValid(validSecretStr)).toBe(true);
      expect(EncryptedSecret.isValid("invalid-format")).toBe(false);
      expect(EncryptedSecret.isValid(12345)).toBe(false);
      expect(EncryptedSecret.isValid(null)).toBe(false);
    });

    it("implements equality comparison", () => {
      const s1 = EncryptedSecret.parse(validSecretStr);
      const s2 = EncryptedSecret.parse(validSecretStr);
      const s3 = EncryptedSecret.parse(
        `v1:k2:${validNonceHex}:${validCiphertextHex}${validMacHex}`,
      );

      expect(s1.equals(s2)).toBe(true);
      expect(s1.equals(s3)).toBe(false);
      expect(s1.equals(null)).toBe(false);
    });

    it("rejects non-string raw input", () => {
      expect(() => EncryptedSecret.parse(null)).toThrow(ValidationException);
      expect(() => EncryptedSecret.parse(123)).toThrow(ValidationException);
      expect(() => EncryptedSecret.parse({})).toThrow(ValidationException);
    });

    it("rejects invalid versions or prefixes", () => {
      expect(() => EncryptedSecret.parse(`v2:k1:${validNonceHex}:${validMacHex}`)).toThrow(
        ValidationException,
      );
      expect(() => EncryptedSecret.parse(`k1:${validNonceHex}:${validMacHex}`)).toThrow(
        ValidationException,
      );
    });

    it("rejects nonces with length other than 48 hex chars", () => {
      // 46 hex chars
      expect(() =>
        EncryptedSecret.parse(`v1:k1:${validNonceHex.slice(0, 46)}:${validMacHex}`),
      ).toThrow(ValidationException);
      // 50 hex chars
      expect(() => EncryptedSecret.parse(`v1:k1:${validNonceHex}aa:${validMacHex}`)).toThrow(
        ValidationException,
      );
      // non-hex in nonce
      expect(() =>
        EncryptedSecret.parse(`v1:k1:${validNonceHex.slice(0, 47)}z:${validMacHex}`),
      ).toThrow(ValidationException);
    });

    it("rejects ciphertext with MAC shorter than 32 hex chars or odd length", () => {
      // 30 hex chars
      expect(() =>
        EncryptedSecret.parse(`v1:k1:${validNonceHex}:${validMacHex.slice(0, 30)}`),
      ).toThrow(ValidationException);
      // odd length (33 chars)
      expect(() => EncryptedSecret.parse(`v1:k1:${validNonceHex}:${validMacHex}a`)).toThrow(
        ValidationException,
      );
      // non-hex in ct
      expect(() =>
        EncryptedSecret.parse(`v1:k1:${validNonceHex}:${validMacHex.slice(0, 30)}zz`),
      ).toThrow(ValidationException);
    });

    it("rejects invalid key IDs", () => {
      expect(() => EncryptedSecret.parse(`v1::${validNonceHex}:${validMacHex}`)).toThrow(
        ValidationException,
      );
      expect(() =>
        EncryptedSecret.parse(`v1:key with space:${validNonceHex}:${validMacHex}`),
      ).toThrow(ValidationException);
      expect(() => EncryptedSecret.parse(`v1:key:colon:${validNonceHex}:${validMacHex}`)).toThrow(
        ValidationException,
      );
    });
  });

  describe("HeaderPolicy", () => {
    const deniedList = [
      "Host",
      "Content-Length",
      "Transfer-Encoding",
      "Connection",
      "Keep-Alive",
      "Upgrade",
      "Proxy-Authorization",
    ];

    it("contains exactly the 7 required deny-list headers", () => {
      expect(DENIED_HEADERS).toHaveLength(7);
      for (const h of deniedList) {
        expect(HeaderPolicy.isDeniedHeader(h)).toBe(true);
        expect(HeaderPolicy.isDeniedHeader(h.toLowerCase())).toBe(true);
        expect(HeaderPolicy.isDeniedHeader(h.toUpperCase())).toBe(true);
      }
    });

    it("allows standard and custom safe headers", () => {
      const safeHeaders = [
        "Authorization",
        "X-Api-Key",
        "Accept",
        "User-Agent",
        "Content-Type",
        "X-Sentinel-Trace-Id",
      ];
      for (const h of safeHeaders) {
        expect(HeaderPolicy.isDeniedHeader(h)).toBe(false);
        expect(() => HeaderPolicy.assertAllowedHeader(h)).not.toThrow();
      }
    });

    it("rejects each deny-list header case-insensitively with ValidationException", () => {
      for (const h of deniedList) {
        expect(() => HeaderPolicy.assertAllowedHeader(h)).toThrow(ValidationException);
        expect(() => HeaderPolicy.assertAllowedHeader(h.toLowerCase())).toThrow(
          ValidationException,
        );
        expect(() => HeaderPolicy.assertAllowedHeader(h.toUpperCase())).toThrow(
          ValidationException,
        );
      }
    });

    it("rejects empty or invalid header tokens", () => {
      expect(() => HeaderPolicy.assertAllowedHeader("")).toThrow(ValidationException);
      expect(() => HeaderPolicy.assertAllowedHeader("   ")).toThrow(ValidationException);
      expect(() => HeaderPolicy.assertAllowedHeader("Invalid Header Name")).toThrow(
        ValidationException,
      );
      expect(() => HeaderPolicy.assertAllowedHeader("Header:Value")).toThrow(ValidationException);
      expect(() => HeaderPolicy.assertAllowedHeader("Header\r\n")).toThrow(ValidationException);
    });

    it("validates header dictionaries thoroughly", () => {
      const validHeaders = {
        Accept: "application/json",
        "X-Api-Key": "secret-123",
        "User-Agent": "API-Sentinel-Probe/1.0",
      };
      expect(() => HeaderPolicy.validateHeaders(validHeaders)).not.toThrow();
    });

    it("rejects non-object or null headers", () => {
      // @ts-expect-error test invalid type
      expect(() => HeaderPolicy.validateHeaders(null)).toThrow(ValidationException);
      // @ts-expect-error test invalid type
      expect(() => HeaderPolicy.validateHeaders("invalid")).toThrow(ValidationException);
      // @ts-expect-error test invalid type
      expect(() => HeaderPolicy.validateHeaders([])).toThrow(ValidationException);
    });

    it("rejects CRLF in header values to prevent HTTP response splitting", () => {
      expect(() =>
        HeaderPolicy.validateHeaders({
          "X-Safe-Header": "value1\r\nInjected-Header: evil",
        }),
      ).toThrow(ValidationException);

      expect(() =>
        HeaderPolicy.validateHeaders({
          "X-Safe-Header": "value1\nInjected-Header: evil",
        }),
      ).toThrow(ValidationException);
    });

    it("extracts unique and sorted headerKeys for public inspection column", () => {
      const headers = {
        "X-Custom-B": "valB",
        "x-custom-a": "valA",
        Accept: "application/json",
      };
      const keys = HeaderPolicy.extractHeaderKeys(headers);
      expect(keys).toEqual(["Accept", "x-custom-a", "X-Custom-B"]);

      const arrayInput = ["User-Agent", "accept", "ACCEPT", "X-Custom"];
      const arrayKeys = HeaderPolicy.extractHeaderKeys(arrayInput);
      expect(arrayKeys).toEqual(["accept", "User-Agent", "X-Custom"]);
    });
  });

  describe("AuthConfig & AuthConfigValidator (US 7)", () => {
    it("validates NoneAuthConfig", () => {
      const auth = AuthConfigValidator.validate({ type: "none" });
      expect(auth).toEqual({ type: "none" });
    });

    it("validates BearerAuthConfig", () => {
      const auth = AuthConfigValidator.validate({
        type: "bearer",
        token: "eyJh...my-secret-token",
      });
      expect(auth.type).toBe("bearer");
      if (auth.type === "bearer") {
        expect(auth.token).toBe("eyJh...my-secret-token");
      }

      // Empty token rejected
      expect(() => AuthConfigValidator.validate({ type: "bearer", token: "" })).toThrow(
        ValidationException,
      );
      expect(() => AuthConfigValidator.validate({ type: "bearer", token: "   " })).toThrow(
        ValidationException,
      );
      // CRLF token rejected
      expect(() =>
        AuthConfigValidator.validate({ type: "bearer", token: "token\r\nevil" }),
      ).toThrow(ValidationException);
    });

    it("validates BasicAuthConfig", () => {
      const auth = AuthConfigValidator.validate({
        type: "basic",
        username: "admin",
        password: "secret-password",
      });
      expect(auth.type).toBe("basic");
      if (auth.type === "basic") {
        expect(auth.username).toBe("admin");
        expect(auth.password).toBe("secret-password");
      }

      // Empty username rejected
      expect(() =>
        AuthConfigValidator.validate({ type: "basic", username: "", password: "pwd" }),
      ).toThrow(ValidationException);
      // Password must be string
      // @ts-expect-error test non-string password
      expect(() =>
        AuthConfigValidator.validate({ type: "basic", username: "admin", password: 1234 }),
      ).toThrow(ValidationException);
      // CRLF rejected
      expect(() =>
        AuthConfigValidator.validate({ type: "basic", username: "admin\r\n", password: "pwd" }),
      ).toThrow(ValidationException);
      expect(() =>
        AuthConfigValidator.validate({ type: "basic", username: "admin", password: "pwd\n" }),
      ).toThrow(ValidationException);
    });

    it("validates ApiKeyAuthConfig", () => {
      const auth = AuthConfigValidator.validate({
        type: "api_key",
        headerName: "X-API-KEY",
        headerValue: "key-value-999",
      });
      expect(auth.type).toBe("api_key");
      if (auth.type === "api_key") {
        expect(auth.headerName).toBe("X-API-KEY");
        expect(auth.headerValue).toBe("key-value-999");
      }

      // Empty headerName rejected
      expect(() =>
        AuthConfigValidator.validate({ type: "api_key", headerName: "", headerValue: "abc" }),
      ).toThrow(ValidationException);
      // Denied header rejected
      expect(() =>
        AuthConfigValidator.validate({
          type: "api_key",
          headerName: "Host",
          headerValue: "evil.com",
        }),
      ).toThrow(ValidationException);
      expect(() =>
        AuthConfigValidator.validate({
          type: "api_key",
          headerName: "Proxy-Authorization",
          headerValue: "val",
        }),
      ).toThrow(ValidationException);
      // CRLF rejected
      expect(() =>
        AuthConfigValidator.validate({
          type: "api_key",
          headerName: "X-Key",
          headerValue: "val\r\n",
        }),
      ).toThrow(ValidationException);

      // Non-string headerValue rejected
      expect(() =>
        AuthConfigValidator.validate({
          type: "api_key",
          headerName: "X-Key",
          // @ts-expect-error test invalid headerValue type
          headerValue: 12345,
        }),
      ).toThrow(ValidationException);
    });

    it("validates CustomHeaderAuthConfig", () => {
      const auth = AuthConfigValidator.validate({
        type: "custom_header",
        headers: {
          "X-Tenant-Id": "tenant-42",
          "X-Signature": "sig-hex-abc",
        },
      });
      expect(auth.type).toBe("custom_header");
      if (auth.type === "custom_header") {
        expect(auth.headers["X-Tenant-Id"]).toBe("tenant-42");
        expect(auth.headers["X-Signature"]).toBe("sig-hex-abc");
      }

      // Non-object headers rejected
      expect(() =>
        // @ts-expect-error test non-object
        AuthConfigValidator.validate({ type: "custom_header", headers: "not-an-object" }),
      ).toThrow(ValidationException);
      // Empty custom headers rejected
      expect(() => AuthConfigValidator.validate({ type: "custom_header", headers: {} })).toThrow(
        ValidationException,
      );
      // Non-string value in custom_header rejected
      expect(() =>
        AuthConfigValidator.validate({
          type: "custom_header",
          headers: {
            // @ts-expect-error test non-string value
            "X-Header": 1234,
          },
        }),
      ).toThrow(ValidationException);
      // Denied header inside custom_header rejected
      expect(() =>
        AuthConfigValidator.validate({
          type: "custom_header",
          headers: {
            "Content-Length": "100",
          },
        }),
      ).toThrow(ValidationException);
      // CRLF rejected
      expect(() =>
        AuthConfigValidator.validate({
          type: "custom_header",
          headers: {
            "X-Header": "line1\r\nline2",
          },
        }),
      ).toThrow(ValidationException);
    });

    it("rejects unknown auth types or malformed payloads", () => {
      expect(() => AuthConfigValidator.validate({ type: "oauth2" })).toThrow(ValidationException);
      expect(() => AuthConfigValidator.validate(null)).toThrow(ValidationException);
      expect(() => AuthConfigValidator.validate("not-an-object")).toThrow(ValidationException);
      expect(() => AuthConfigValidator.validate([])).toThrow(ValidationException);
    });

    it("tests type guards and edge inputs", () => {
      expect(AuthConfigValidator.isAuthType("none")).toBe(true);
      expect(AuthConfigValidator.isAuthType("bearer")).toBe(true);
      expect(AuthConfigValidator.isAuthType("basic")).toBe(true);
      expect(AuthConfigValidator.isAuthType("api_key")).toBe(true);
      expect(AuthConfigValidator.isAuthType("custom_header")).toBe(true);
      expect(AuthConfigValidator.isAuthType("oauth2")).toBe(false);
      expect(AuthConfigValidator.isAuthType(null)).toBe(false);

      // @ts-expect-error test non-string in isDeniedHeader
      expect(HeaderPolicy.isDeniedHeader(null)).toBe(false);

      // @ts-expect-error test non-string value in validateHeaders
      expect(() => HeaderPolicy.validateHeaders({ "X-Test": 12345 })).toThrow(ValidationException);

      // @ts-expect-error test falsy input to extractHeaderKeys
      expect(HeaderPolicy.extractHeaderKeys(null)).toEqual([]);
      // @ts-expect-error test array with empty/non-string items
      expect(HeaderPolicy.extractHeaderKeys(["", "   ", null, 123])).toEqual([]);
    });
  });
});
