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
exports.parseBatFile = parseBatFile;
exports.resolveProjectSourcePaths = resolveProjectSourcePaths;
exports.findGlobalScriptDirs = findGlobalScriptDirs;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function parseBatFile(batPath) {
    const content = fs.readFileSync(batPath, "utf8");
    const lines = content.split(/\r?\n/);
    const env = {};
    function expand(value) {
        return value.replace(/%([^%]+)%/g, (_, name) => env[name.toUpperCase()] ?? "");
    }
    for (const line of lines) {
        const trimmed = line.trim();
        // Handle: set "KEY=VALUE"  (standard Windows batch quoted form)
        let m = trimmed.match(/^set\s+"([^=]+)=([^"]*)"/i);
        if (m) {
            env[m[1].toUpperCase()] = expand(m[2]);
            continue;
        }
        // Handle: SET KEY=VALUE  or  KEY=VALUE
        m = trimmed.match(/^(?:set\s+)?([A-Z_][A-Z0-9_]*)=(.+)$/i);
        if (m) {
            env[m[1].toUpperCase()] = expand(m[2].trim());
        }
    }
    return {
        project: env["PROJECT"] ?? "",
        squishSettingsCopyPath: env["SQUISH_SETTINGS_COPY_PATH"] ?? "",
        squishUserSettingsDir: env["SQUISH_USER_SETTINGS_DIR"] ?? "",
        squishPrefix: env["SQUISH_PREFIX"] ?? "",
    };
}
// ---------------------------------------------------------------------------
// .project / .pydevproject parsing
// ---------------------------------------------------------------------------
function extractXmlTagContent(xml, tag) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
    const results = [];
    let m;
    while ((m = re.exec(xml)) !== null) {
        results.push(m[1].trim());
    }
    return results;
}
function parseProjectFile(projectFilePath) {
    const xml = fs.readFileSync(projectFilePath, "utf8");
    const nameMatch = xml.match(/<name>([^<]+)<\/name>/);
    const projectName = nameMatch ? nameMatch[1].trim() : "";
    const linkedResources = [];
    const linkBlocks = extractXmlTagContent(xml, "link");
    for (const block of linkBlocks) {
        const nameEl = block.match(/<name>([^<]+)<\/name>/);
        const locEl = block.match(/<location>([^<]+)<\/location>/);
        if (nameEl && locEl) {
            linkedResources.push({ name: nameEl[1].trim(), location: locEl[1].trim() });
        }
    }
    return { projectName, linkedResources };
}
function parsePydevProjectFile(pydevFilePath) {
    const xml = fs.readFileSync(pydevFilePath, "utf8");
    const pathBlocks = extractXmlTagContent(xml, "pydev_pathproperty");
    const paths = [];
    for (const block of pathBlocks) {
        const pathTags = extractXmlTagContent(block, "path");
        paths.push(...pathTags);
    }
    return paths;
}
/**
 * Given the directory that contains .project and .pydevproject,
 * return the resolved absolute paths of all global script source directories.
 *
 * Eclipse stores paths as  /ProjectName/linkedResourceName
 * and resolves them via <linkedResources> in .project, where <PROJECT_PATH>
 * is the directory containing .project itself.
 */
function resolveProjectSourcePaths(projectDir) {
    const projectFile = path.join(projectDir, ".project");
    const pydevFile = path.join(projectDir, ".pydevproject");
    const { projectName, linkedResources } = parseProjectFile(projectFile);
    const sourcePaths = parsePydevProjectFile(pydevFile);
    const linkMap = new Map(linkedResources.map((r) => [r.name, r.location]));
    const prefix = `/${projectName}/`;
    const resolved = [];
    for (const srcPath of sourcePaths) {
        if (srcPath.startsWith(prefix)) {
            const linkName = srcPath.slice(prefix.length).split("/")[0];
            const location = linkMap.get(linkName);
            if (location) {
                const absolute = location
                    .replace("<PROJECT_PATH>", projectDir)
                    .replace(/\//g, path.sep);
                resolved.push(absolute);
            }
        }
        else if (path.isAbsolute(srcPath)) {
            resolved.push(srcPath);
        }
    }
    return resolved;
}
// ---------------------------------------------------------------------------
// Legacy: scan SquishSettings dir for globalscriptdirs / XML files
// ---------------------------------------------------------------------------
async function readGlobalscriptdirsFile(filePath) {
    const content = await fs.promises.readFile(filePath, "utf8");
    return content
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"));
}
async function readSettingsXml(filePath) {
    const content = await fs.promises.readFile(filePath, "utf8");
    const results = [];
    const tagRe = /<scriptDir[s]?[^>]*>([^<]+)<\/scriptDir[s]?>/gi;
    let match;
    while ((match = tagRe.exec(content)) !== null) {
        const entries = match[1]
            .split(/[,;\n]/)
            .map((e) => e.trim())
            .filter((e) => e.length > 0);
        results.push(...entries);
    }
    return results;
}
function resolveRelativePath(rawPath, basePath) {
    if (path.isAbsolute(rawPath)) {
        return rawPath;
    }
    const stripped = rawPath.startsWith("/") ? rawPath.slice(1) : rawPath;
    return path.join(basePath, stripped);
}
async function findGlobalScriptDirs(env, basePath) {
    const settingsDir = env.squishUserSettingsDir;
    if (!settingsDir) {
        return [];
    }
    const dirsFilePath = path.join(settingsDir, "globalscriptdirs");
    try {
        const rawPaths = await readGlobalscriptdirsFile(dirsFilePath);
        return rawPaths.map((p) => resolveRelativePath(p, basePath));
    }
    catch {
        // fall through to XML scan
    }
    let entries = [];
    try {
        const files = await fs.promises.readdir(settingsDir);
        for (const file of files) {
            if (!file.endsWith(".settings") && !file.endsWith(".xml")) {
                continue;
            }
            try {
                const xmlPaths = await readSettingsXml(path.join(settingsDir, file));
                entries.push(...xmlPaths);
            }
            catch {
                // skip unreadable files
            }
        }
    }
    catch {
        return [];
    }
    return entries
        .filter((e) => e.length > 0)
        .map((p) => resolveRelativePath(p, basePath));
}
//# sourceMappingURL=squishSettings.js.map