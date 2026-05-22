"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanDirectories = scanDirectories;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const DEF_RE = /^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
const CLASS_RE = /^class\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:(]/;
const METHOD_RE = /^[ \t]{4}def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
const VAR_RE = /^([A-Z_][A-Z0-9_]*)\s*=/;
const DOCSTRING_RE = /^\s*"""(.+?)"""|^\s*'''(.+?)'''|^\s*"""(.+)|^\s*'''(.+)/;
function extractDocstring(lines, defLine) {
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
async function scanFile(filePath) {
    let content;
    try {
        content = await fs.promises.readFile(filePath, "utf8");
    }
    catch {
        return [];
    }
    const lines = content.split(/\r?\n/);
    const symbols = [];
    let currentClass;
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
async function collectPyFiles(dir) {
    let entries;
    try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
    }
    catch {
        return [];
    }
    const results = [];
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...(await collectPyFiles(fullPath)));
        }
        else if (entry.isFile() && (entry.name.endsWith(".py") || entry.name.endsWith(".pyi"))) {
            results.push(fullPath);
        }
    }
    return results;
}
async function scanDirectories(dirs) {
    const allSymbols = [];
    for (const dir of dirs) {
        const files = await collectPyFiles(dir);
        for (const file of files) {
            const symbols = await scanFile(file);
            allSymbols.push(...symbols);
        }
    }
    return allSymbols;
}
//# sourceMappingURL=symbolEngine.js.map