export interface InvalidParam {
  readonly name: string;
  readonly reason: string;
}

export abstract class DomainException extends Error {
  abstract readonly statusCode: number;
  abstract readonly errorType: string;
  abstract readonly title: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EntityNotFoundException extends DomainException {
  readonly statusCode = 404;
  readonly errorType = "entity-not-found";
  readonly title = "Entitas Tidak Ditemukan";
}

export class ValidationException extends DomainException {
  readonly statusCode = 400;
  readonly errorType = "validation-failed";
  readonly title = "Validasi Input Gagal";

  constructor(
    message: string,
    public readonly invalidParams: readonly InvalidParam[] = [],
  ) {
    super(message);
  }
}

export class SSRFBlockedException extends DomainException {
  readonly statusCode = 422;
  readonly errorType = "ssrf-blocked";
  readonly title = "Kebijakan Keamanan SSRF Terlanggar";
}

export class InvalidCredentialsException extends DomainException {
  readonly statusCode = 401;
  readonly errorType = "invalid-credentials";
  readonly title = "Autentikasi Gagal";
}

export class ConflictException extends DomainException {
  readonly statusCode = 409;
  readonly errorType = "conflict-version-mismatch";
  readonly title = "Konflik Konkurensi Versi";
}

export class RateLimitExceededException extends DomainException {
  readonly statusCode = 429;
  readonly errorType = "rate-limit-exceeded";
  readonly title = "Batas Laju Permintaan Terlampaui";

  constructor(
    message: string,
    public readonly retryAfterSeconds: number,
  ) {
    super(message);
  }
}

export class ForbiddenException extends DomainException {
  readonly statusCode = 403;
  readonly errorType = "forbidden-access";
  readonly title = "Akses Dilarang";
}
