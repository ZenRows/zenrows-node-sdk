import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

// The README's Batch examples are what people copy. Typecheck every ```ts block in the
// Batch section against the source, with `zenrows` resolving to src/index.ts, so an example
// that calls a method the client doesn't have fails CI.

const ROOT = resolve(__dirname, "..");

function batchSnippets(): string[] {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const start = readme.indexOf("\n### Batch\n");
  const end = readme.indexOf("\n### Crawl\n", start);
  if (start < 0 || end < 0) throw new Error("README has no Batch section before Crawl");
  const section = readme.slice(start, end);
  return [...section.matchAll(/```ts\n([\s\S]*?)```/g)].map((match) => match[1] ?? "");
}

describe("README Batch section", () => {
  test("every code block is TypeScript, so all of them get typechecked", () => {
    const readme = readFileSync(join(ROOT, "README.md"), "utf8");
    const section = readme.slice(readme.indexOf("\n### Batch\n"), readme.indexOf("\n### Crawl\n"));
    const fences = [...section.matchAll(/^```(\w*)$/gm)].map((match) => match[1]);
    const openings = fences.filter((_, index) => index % 2 === 0);
    expect(openings.length).toBeGreaterThan(0);
    expect(openings.every((lang) => lang === "ts")).toBe(true);
  });

  test("its examples compile against the client", () => {
    const snippets = batchSnippets();
    const dir = mkdtempSync(join(tmpdir(), "zenrows-readme-"));
    try {
      const files = snippets.map((code, index) => {
        const file = join(dir, `snippet-${index}.ts`);
        writeFileSync(file, code);
        return file;
      });
      const program = ts.createProgram(files, {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        moduleDetection: ts.ModuleDetectionKind.Force,
        resolveJsonModule: true,
        esModuleInterop: true,
        lib: ["lib.es2022.d.ts"],
        types: ["node"],
        typeRoots: [join(ROOT, "node_modules", "@types")],
        baseUrl: ROOT,
        paths: { zenrows: ["src/index.ts"] },
      });
      const diagnostics = ts.getPreEmitDiagnostics(program).map((diagnostic) => {
        const where = diagnostic.file
          ? `${diagnostic.file.fileName.replace(dir, "README")}:${
              diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1
            }`
          : "";
        return `${where} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`;
      });
      expect(diagnostics).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
