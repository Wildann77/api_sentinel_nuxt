import { ValidationException } from "../errors/domain-exception.js";

export type JsonPathSegment =
  | { readonly type: "root" }
  | { readonly type: "property"; readonly name: string }
  | { readonly type: "index"; readonly index: number }
  | { readonly type: "wildcard" }
  | { readonly type: "recursive"; readonly name: string };

export interface JsonPathAst {
  readonly rawQuery: string;
  readonly segments: readonly JsonPathSegment[];
}

const FORBIDDEN_IDENTIFIERS = new Set(["__proto__", "prototype", "constructor"]);
const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

export function parseJsonPath(query: string): JsonPathAst {
  if (typeof query !== "string") {
    throw new ValidationException("Query JSONPath harus berupa string", [
      { name: "target", reason: "Query JSONPath harus string valid." },
    ]);
  }

  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new ValidationException("Query JSONPath tidak boleh kosong", [
      { name: "target", reason: "Query JSONPath tidak boleh kosong." },
    ]);
  }

  if (trimmed.length > 100) {
    throw new ValidationException(
      `Query JSONPath melampaui batas maksimum 100 karakter (${trimmed.length} karakter)`,
      [{ name: "target", reason: "Query JSONPath maksimal 100 karakter." }],
    );
  }

  if (!trimmed.startsWith("$")) {
    throw new ValidationException(`Query JSONPath harus diawali dengan "$": "${trimmed}"`, [
      { name: "target", reason: 'Query JSONPath harus diawali dengan "$".' },
    ]);
  }

  if (
    trimmed.includes("?(") ||
    trimmed.includes("(") ||
    trimmed.includes(")") ||
    trimmed.includes("?")
  ) {
    throw new ValidationException(
      `Query JSONPath mengandung ekspresi filter/skrip yang tidak diizinkan: "${trimmed}"`,
      [
        {
          name: "target",
          reason: "Filter expression ?() dan script () dilarang demi keamanan AST parser.",
        },
      ],
    );
  }

  const segments: JsonPathSegment[] = [{ type: "root" }];
  let i = 1;

  while (i < trimmed.length) {
    const char = trimmed[i];

    if (char === ".") {
      i++;
      if (i >= trimmed.length) {
        throw new ValidationException(
          `Query JSONPath tidak valid, berakhir dengan titik: "${trimmed}"`,
          [{ name: "target", reason: "Query JSONPath tidak boleh diakhiri titik." }],
        );
      }

      if (trimmed[i] === ".") {
        i++;
        if (i >= trimmed.length) {
          throw new ValidationException(
            `Query JSONPath tidak valid, ".." tanpa nama properti: "${trimmed}"`,
            [{ name: "target", reason: "Recursive descent .. harus diikuti nama properti." }],
          );
        }

        const propStart = i;
        while (i < trimmed.length) {
          const current = trimmed.charAt(i);
          if (!/[a-zA-Z0-9_-]/.test(current)) {
            break;
          }
          i++;
        }
        const propName = trimmed.slice(propStart, i);
        if (!propName || !IDENTIFIER_REGEX.test(propName)) {
          throw new ValidationException(
            `Nama properti recursive tidak valid pada "${trimmed}": "${propName}"`,
            [{ name: "target", reason: `Nama properti recursive "${propName}" tidak valid.` }],
          );
        }
        if (FORBIDDEN_IDENTIFIERS.has(propName)) {
          throw new ValidationException(`Akses properti sensitif dilarang: "${propName}"`, [
            { name: "target", reason: `Properti "${propName}" dilarang untuk keamanan prototype.` },
          ]);
        }

        segments.push({ type: "recursive", name: propName });
        continue;
      }

      if (trimmed[i] === "*") {
        i++;
        segments.push({ type: "wildcard" });
        continue;
      }

      const propStart = i;
      while (i < trimmed.length) {
        const current = trimmed.charAt(i);
        if (!/[a-zA-Z0-9_-]/.test(current)) {
          break;
        }
        i++;
      }
      const propName = trimmed.slice(propStart, i);
      if (!propName || !IDENTIFIER_REGEX.test(propName)) {
        throw new ValidationException(
          `Nama properti tidak valid pada "${trimmed}": "${propName}"`,
          [{ name: "target", reason: `Nama properti "${propName}" tidak valid.` }],
        );
      }
      if (FORBIDDEN_IDENTIFIERS.has(propName)) {
        throw new ValidationException(`Akses properti sensitif dilarang: "${propName}"`, [
          { name: "target", reason: `Properti "${propName}" dilarang untuk keamanan prototype.` },
        ]);
      }

      segments.push({ type: "property", name: propName });
    } else if (char === "[") {
      i++;
      if (i >= trimmed.length) {
        throw new ValidationException(`Kurung siku tidak ditutup pada "${trimmed}"`, [
          { name: "target", reason: "Kurung siku tidak ditutup." },
        ]);
      }

      if (trimmed[i] === "*") {
        i++;
        if (trimmed[i] !== "]") {
          throw new ValidationException(`Format wildcard tidak valid pada "${trimmed}"`, [
            { name: "target", reason: "Harus [*]." },
          ]);
        }
        i++;
        segments.push({ type: "wildcard" });
        continue;
      }

      if (trimmed[i] === "'" || trimmed[i] === '"') {
        const quote = trimmed[i];
        i++;
        const propStart = i;
        while (i < trimmed.length && trimmed[i] !== quote) {
          i++;
        }
        if (i >= trimmed.length) {
          throw new ValidationException(`Tanda kutip tidak ditutup pada "${trimmed}"`, [
            { name: "target", reason: "Tanda kutip string pada kurung siku tidak ditutup." },
          ]);
        }
        const propName = trimmed.slice(propStart, i);
        i++;
        if (trimmed[i] !== "]") {
          throw new ValidationException(
            `Kurung siku tidak ditutup setelah properti pada "${trimmed}"`,
            [{ name: "target", reason: "Harus diakhiri ']' setelah string properti." }],
          );
        }
        i++;

        if (FORBIDDEN_IDENTIFIERS.has(propName)) {
          throw new ValidationException(`Akses properti sensitif dilarang: "${propName}"`, [
            { name: "target", reason: `Properti "${propName}" dilarang untuk keamanan prototype.` },
          ]);
        }

        segments.push({ type: "property", name: propName });
        continue;
      }

      const numStart = i;
      while (i < trimmed.length) {
        const current = trimmed.charAt(i);
        if (!/[0-9]/.test(current)) {
          break;
        }
        i++;
      }
      const numStr = trimmed.slice(numStart, i);
      if (numStr.length === 0 || trimmed[i] !== "]") {
        throw new ValidationException(`Indeks array tidak valid pada "${trimmed}"`, [
          {
            name: "target",
            reason: "Indeks array harus berupa integer non-negatif di dalam kurung siku.",
          },
        ]);
      }
      i++;
      const index = parseInt(numStr, 10);
      segments.push({ type: "index", index });
    } else {
      throw new ValidationException(
        `Karakter tidak terduga "${char}" pada posisi ${i} dalam "${trimmed}"`,
        [{ name: "target", reason: `Karakter tidak valid "${char}" dalam ekspresi JSONPath.` }],
      );
    }
  }

  return {
    rawQuery: trimmed,
    segments: Object.freeze(segments),
  };
}

export function evaluateJsonPath(ast: JsonPathAst, rootValue: unknown): readonly unknown[] {
  let currentNodes: readonly unknown[] = [rootValue];

  for (const segment of ast.segments) {
    if (segment.type === "root") {
      continue;
    }

    if (segment.type === "property") {
      const next: unknown[] = [];
      for (const node of currentNodes) {
        if (node !== null && typeof node === "object" && !Array.isArray(node)) {
          if (Object.hasOwn(node, segment.name)) {
            next.push((node as Record<string, unknown>)[segment.name]);
          }
        }
      }
      currentNodes = next;
    } else if (segment.type === "index") {
      const next: unknown[] = [];
      for (const node of currentNodes) {
        if (Array.isArray(node) && segment.index >= 0 && segment.index < node.length) {
          next.push(node[segment.index]);
        }
      }
      currentNodes = next;
    } else if (segment.type === "wildcard") {
      const next: unknown[] = [];
      for (const node of currentNodes) {
        if (Array.isArray(node)) {
          for (const item of node) {
            next.push(item);
          }
        } else if (node !== null && typeof node === "object") {
          for (const val of Object.values(node)) {
            next.push(val);
          }
        }
      }
      currentNodes = next;
    } else if (segment.type === "recursive") {
      const next: unknown[] = [];
      const visited = new Set<unknown>();

      const traverse = (val: unknown, depth = 0): void => {
        if (depth > 50 || val === null || typeof val !== "object") {
          return;
        }
        if (visited.has(val)) {
          return;
        }
        visited.add(val);

        if (Array.isArray(val)) {
          for (const item of val) {
            traverse(item, depth + 1);
          }
        } else {
          if (Object.hasOwn(val, segment.name)) {
            next.push((val as Record<string, unknown>)[segment.name]);
          }
          for (const child of Object.values(val)) {
            traverse(child, depth + 1);
          }
        }
      };

      for (const node of currentNodes) {
        traverse(node, 0);
      }
      currentNodes = next;
    }

    if (currentNodes.length === 0) {
      break;
    }
  }

  return Object.freeze(currentNodes);
}

export const JsonPathParser = {
  parse: parseJsonPath,
  evaluate: evaluateJsonPath,
} as const;
export type JsonPathParser = typeof JsonPathParser;
