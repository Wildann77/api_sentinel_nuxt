import { ValidationException } from "../errors/domain-exception.js";
import { assertAllowedHeader } from "../services/header-policy.js";

export type AuthType =
  | "none"
  | "bearer"
  | "basic"
  | "api_key"
  | "custom_header"
  | "NONE"
  | "BEARER"
  | "BASIC"
  | "API_KEY"
  | "CUSTOM_HEADER";

export interface NoneAuthConfig {
  readonly type: "none";
}

export interface BearerAuthConfig {
  readonly type: "bearer";
  readonly token: string;
}

export interface BasicAuthConfig {
  readonly type: "basic";
  readonly username: string;
  readonly password: string;
}

export interface ApiKeyAuthConfig {
  readonly type: "api_key";
  readonly headerName: string;
  readonly headerValue: string;
}

export interface CustomHeaderAuthConfig {
  readonly type: "custom_header";
  readonly headers: Record<string, string>;
}

export type AuthConfig =
  | NoneAuthConfig
  | BearerAuthConfig
  | BasicAuthConfig
  | ApiKeyAuthConfig
  | CustomHeaderAuthConfig;

export const AUTH_TYPES: readonly AuthType[] = [
  "none",
  "bearer",
  "basic",
  "api_key",
  "custom_header",
  "NONE",
  "BEARER",
  "BASIC",
  "API_KEY",
  "CUSTOM_HEADER",
] as const;

export function isAuthType(value: unknown): value is AuthType {
  return typeof value === "string" && (AUTH_TYPES as readonly string[]).includes(value);
}

export function validateAuthConfig(raw: unknown): AuthConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ValidationException("Konfigurasi autentikasi harus berupa object", [
      {
        name: "authConfig",
        reason: "Payload authConfig wajib berupa object.",
      },
    ]);
  }

  const obj = raw as Record<string, unknown>;
  const rawType = obj.type;

  if (!isAuthType(rawType)) {
    throw new ValidationException(`Tipe autentikasi tidak valid: "${String(rawType)}"`, [
      {
        name: "authConfig.type",
        reason: `Tipe autentikasi harus salah satu dari: ${AUTH_TYPES.join(", ")}.`,
      },
    ]);
  }

  const type = rawType.toLowerCase() as "none" | "bearer" | "basic" | "api_key" | "custom_header";

  switch (type) {
    case "none": {
      return { type: "none" };
    }

    case "bearer": {
      const token = obj.token;
      if (typeof token !== "string" || token.trim().length === 0) {
        throw new ValidationException("Token Bearer tidak boleh kosong", [
          {
            name: "authConfig.token",
            reason: "Token autentikasi Bearer wajib berupa string tidak kosong.",
          },
        ]);
      }
      if (/[\r\n]/.test(token)) {
        throw new ValidationException("Token Bearer mengandung karakter newline (CRLF)", [
          {
            name: "authConfig.token",
            reason: "Token dilarang mengandung karakter CRLF untuk mencegah header injection.",
          },
        ]);
      }
      return { type: "bearer", token: token.trim() };
    }

    case "basic": {
      const username = obj.username;
      const password = obj.password;

      if (typeof username !== "string" || username.trim().length === 0) {
        throw new ValidationException("Username Basic Auth tidak boleh kosong", [
          {
            name: "authConfig.username",
            reason: "Username Basic Auth wajib diisi string tidak kosong.",
          },
        ]);
      }
      if (typeof password !== "string") {
        throw new ValidationException("Password Basic Auth harus berupa string", [
          {
            name: "authConfig.password",
            reason:
              "Password Basic Auth wajib berupa string (boleh kosong jika server target mengizinkan).",
          },
        ]);
      }
      if (/[\r\n]/.test(username) || /[\r\n]/.test(password)) {
        throw new ValidationException("Kredensial Basic Auth mengandung karakter newline (CRLF)", [
          {
            name: "authConfig",
            reason: "Username dan password dilarang mengandung karakter CRLF.",
          },
        ]);
      }
      return {
        type: "basic",
        username: username.trim(),
        password,
      };
    }

    case "api_key": {
      const headerName = obj.headerName;
      const headerValue = obj.headerValue;

      if (typeof headerName !== "string" || headerName.trim().length === 0) {
        throw new ValidationException("Nama header API Key tidak boleh kosong", [
          {
            name: "authConfig.headerName",
            reason: "Nama header API Key wajib berupa string tidak kosong.",
          },
        ]);
      }

      assertAllowedHeader(headerName);

      if (typeof headerValue !== "string") {
        throw new ValidationException("Nilai header API Key harus berupa string", [
          {
            name: "authConfig.headerValue",
            reason: "Nilai header API Key wajib berupa string.",
          },
        ]);
      }

      if (/[\r\n]/.test(headerValue)) {
        throw new ValidationException("Nilai header API Key mengandung karakter newline (CRLF)", [
          {
            name: "authConfig.headerValue",
            reason: "Nilai API Key dilarang mengandung karakter newline (CRLF).",
          },
        ]);
      }

      return {
        type: "api_key",
        headerName: headerName.trim(),
        headerValue: headerValue.trim(),
      };
    }

    case "custom_header": {
      const headers = obj.headers;
      if (typeof headers !== "object" || headers === null || Array.isArray(headers)) {
        throw new ValidationException("Format custom headers harus berupa object key-value", [
          {
            name: "authConfig.headers",
            reason: "Field headers wajib berupa dictionary string: string.",
          },
        ]);
      }

      const entries = Object.entries(headers);
      if (entries.length === 0) {
        throw new ValidationException("Custom headers tidak boleh kosong", [
          {
            name: "authConfig.headers",
            reason: "Minimal satu header khusus harus dikonfigurasi untuk tipe custom_header.",
          },
        ]);
      }

      const sanitizedHeaders: Record<string, string> = {};
      for (const [key, value] of entries) {
        assertAllowedHeader(key);
        if (typeof value !== "string") {
          throw new ValidationException(`Nilai header "${key}" harus berupa string`, [
            {
              name: "authConfig.headers",
              reason: `Header "${key}" harus memiliki nilai bertipe string.`,
            },
          ]);
        }
        if (/[\r\n]/.test(value)) {
          throw new ValidationException(`Nilai custom header "${key}" mengandung newline (CRLF)`, [
            {
              name: "authConfig.headers",
              reason: `Header "${key}" dilarang mengandung karakter CRLF.`,
            },
          ]);
        }
        sanitizedHeaders[key.trim()] = value;
      }

      return {
        type: "custom_header",
        headers: sanitizedHeaders,
      };
    }
  }
}

export const AuthConfigValidator = {
  isAuthType,
  validate: validateAuthConfig,
} as const;
export type AuthConfigValidator = typeof AuthConfigValidator;
