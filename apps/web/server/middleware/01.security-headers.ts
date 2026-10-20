import { defineEventHandler, setResponseHeader } from "h3";

export default defineEventHandler((event) => {
  setResponseHeader(event, "X-Content-Type-Options", "nosniff");
  setResponseHeader(event, "X-Frame-Options", "DENY");
  setResponseHeader(event, "Referrer-Policy", "strict-origin-when-cross-origin");

  // Strict Content Security Policy compatible with Nuxt 4 & Nuxt UI
  setResponseHeader(
    event,
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "font-src 'self' data:; " +
      "img-src 'self' data: blob:; " +
      "connect-src 'self' ws: wss:; " +
      "frame-ancestors 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self';",
  );
});
