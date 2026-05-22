import * as fs from "fs";
import * as path from "path";

export interface SquishEnv {
  project: string;
  squishSettingsCopyPath: string;
  squishUserSettingsDir: string;
  squishPrefix: string;
}

export function parseBatFile(batPath: string): SquishEnv {
  const content = fs.readFileSync(batPath, "utf8");
  const lines = content.split(/\r?\n/);

  const env: Record<string, string> = {};

  function expand(value: string): string {
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

function extractXmlTagContent(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].trim());
  }
  return results;
}

interface LinkedResource {
  name: string;
  location: string;
}

function parseProjectFile(projectFilePath: string): { projectName: string; linkedResources: LinkedResource[] } {
  const xml = fs.readFileSync(projectFilePath, "utf8");

  const nameMatch = xml.match(/<name>([^<]+)<\/name>/);
  const projectName = nameMatch ? nameMatch[1].trim() : "";

  const linkedResources: LinkedResource[] = [];
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

function parsePydevProjectFile(pydevFilePath: string): string[] {
  const xml = fs.readFileSync(pydevFilePath, "utf8");
  const pathBlocks = extractXmlTagContent(xml, "pydev_pathproperty");
  const paths: string[] = [];
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
/**
 * projectDir  — folder containing .project and .pydevproject
 * reposBase   — value that <PROJECT_PATH> resolves to in linked resource locations
 *               (your repos root, e.g. C:\repos). Falls back to projectDir if not supplied.
 */
export function resolveProjectSourcePaths(projectDir: string, reposBase?: string): string[] {
  const projectFile = path.join(projectDir, ".project");
  const pydevFile = path.join(projectDir, ".pydevproject");

  const { projectName, linkedResources } = parseProjectFile(projectFile);
  const sourcePaths = parsePydevProjectFile(pydevFile);

  const base = reposBase ?? projectDir;
  const linkMap = new Map(linkedResources.map((r) => [r.name, r.location]));
  const prefix = `/${projectName}/`;

  const resolved: string[] = [];
  for (const srcPath of sourcePaths) {
    if (srcPath.startsWith(prefix)) {
      const linkName = srcPath.slice(prefix.length).split("/")[0];
      const location = linkMap.get(linkName);
      if (location) {
        const absolute = location
          .replace("<PROJECT_PATH>", base)
          .replace(/\//g, path.sep);
        resolved.push(absolute);
      }
    } else if (path.isAbsolute(srcPath)) {
      resolved.push(srcPath);
    }
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Legacy: scan SquishSettings dir for globalscriptdirs / XML files
// ---------------------------------------------------------------------------

async function readGlobalscriptdirsFile(filePath: string): Promise<string[]> {
  const content = await fs.promises.readFile(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

async function readSettingsXml(filePath: string): Promise<string[]> {
  const content = await fs.promises.readFile(filePath, "utf8");
  const results: string[] = [];
  const tagRe = /<scriptDir[s]?[^>]*>([^<]+)<\/scriptDir[s]?>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(content)) !== null) {
    const entries = match[1]
      .split(/[,;\n]/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
    results.push(...entries);
  }
  return results;
}

function resolveRelativePath(rawPath: string, basePath: string): string {
  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }
  const stripped = rawPath.startsWith("/") ? rawPath.slice(1) : rawPath;
  return path.join(basePath, stripped);
}

export async function findGlobalScriptDirs(env: SquishEnv, basePath: string): Promise<string[]> {
  const settingsDir = env.squishUserSettingsDir;
  if (!settingsDir) {
    return [];
  }

  const dirsFilePath = path.join(settingsDir, "globalscriptdirs");
  try {
    const rawPaths = await readGlobalscriptdirsFile(dirsFilePath);
    return rawPaths.map((p) => resolveRelativePath(p, basePath));
  } catch {
    // fall through to XML scan
  }

  let entries: string[] = [];
  try {
    const files = await fs.promises.readdir(settingsDir);
    for (const file of files) {
      if (!file.endsWith(".settings") && !file.endsWith(".xml")) {
        continue;
      }
      try {
        const xmlPaths = await readSettingsXml(path.join(settingsDir, file));
        entries.push(...xmlPaths);
      } catch {
        // skip unreadable files
      }
    }
  } catch {
    return [];
  }

  return entries
    .filter((e) => e.length > 0)
    .map((p) => resolveRelativePath(p, basePath));
}
