import * as fs from "fs";
import * as path from "path";

export type SymbolKind = "function" | "class" | "variable" | "method";

export interface SquishSymbol {
  name: string;
  kind: SymbolKind;
  filePath: string;
  line: number;
  docstring?: string;
  parentClass?: string;
}

const DEF_RE = /^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
const CLASS_RE = /^class\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:(]/;
const METHOD_RE = /^[ \t]{4}def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
const VAR_RE = /^([A-Z_][A-Z0-9_]*)\s*=/;
const DOCSTRING_RE = /^\s*"""(.+?)"""|^\s*'''(.+?)'''|^\s*"""(.+)|^\s*'''(.+)/;

function extractDocstring(lines: string[], defLine: number): string | undefined {
  const next = lines[defLine + 1];
  if (!next) {
    return undefined;
  }
  const m = next.match(DOCSTRING_RE);
  if (!m) {
    return undefined;
  }
  return (m[1] ?? m[2] ?? m[3] ?? m[4]).trim();
}

async function scanFile(filePath: string): Promise<SquishSymbol[]> {
  let content: string;
  try {
    content = await fs.promises.readFile(filePath, "utf8");
  } catch {
    return [];
  }

  const lines = content.split(/\r?\n/);
  const symbols: SquishSymbol[] = [];
  let currentClass: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const classMatch = line.match(CLASS_RE);
    if (classMatch) {
      currentClass = classMatch[1];
      symbols.push({
        name: classMatch[1],
        kind: "class",
        filePath,
        line: i + 1,
        docstring: extractDocstring(lines, i),
      });
      continue;
    }

    // Reset class context when we hit a non-indented, non-blank line that isn't a class
    if (currentClass && line.length > 0 && !line.startsWith(" ") && !line.startsWith("\t")) {
      currentClass = undefined;
    }

    const methodMatch = currentClass ? line.match(METHOD_RE) : null;
    if (methodMatch && methodMatch[1] !== "__init__") {
      symbols.push({
        name: methodMatch[1],
        kind: "method",
        filePath,
        line: i + 1,
        docstring: extractDocstring(lines, i),
        parentClass: currentClass,
      });
      continue;
    }

    const defMatch = line.match(DEF_RE);
    if (defMatch) {
      symbols.push({
        name: defMatch[1],
        kind: "function",
        filePath,
        line: i + 1,
        docstring: extractDocstring(lines, i),
      });
      continue;
    }

    if (!line.startsWith(" ") && !line.startsWith("\t")) {
      const varMatch = line.match(VAR_RE);
      if (varMatch) {
        symbols.push({
          name: varMatch[1],
          kind: "variable",
          filePath,
          line: i + 1,
        });
      }
    }
  }

  return symbols;
}

async function collectPyFiles(dir: string): Promise<string[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectPyFiles(fullPath)));
    } else if (entry.isFile() && (entry.name.endsWith(".py") || entry.name.endsWith(".pyi"))) {
      results.push(fullPath);
    }
  }
  return results;
}

export async function scanDirectories(dirs: string[]): Promise<SquishSymbol[]> {
  const allSymbols: SquishSymbol[] = [];
  for (const dir of dirs) {
    const files = await collectPyFiles(dir);
    for (const file of files) {
      const symbols = await scanFile(file);
      allSymbols.push(...symbols);
    }
  }
  return allSymbols;
}
