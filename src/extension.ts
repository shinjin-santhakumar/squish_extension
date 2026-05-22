import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

import { parseBatFile, findGlobalScriptDirs, resolveProjectSourcePaths } from "./squishSettings";

let client: LanguageClient | undefined;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;

async function resolveGlobalScriptDirs(): Promise<string[]> {
  const config = vscode.workspace.getConfiguration("squishHelper");
  const batFilePath = config.get<string>("batFilePath") ?? "";
  const basePath = config.get<string>("globalScriptBasePath") ?? "C:\\";
  const manualDirs = config.get<string[]>("globalScriptDirs") ?? [];
  const projectDir = config.get<string>("squishHelper.squishProjectDir") ?? config.get<string>("squishProjectDir") ?? "";

  // Preferred: parse .project + .pydevproject for accurate source paths
  const reposBase = config.get<string>("reposBasePath") ?? "";

  if (projectDir.trim().length > 0) {
    outputChannel.appendLine(`[Squish] squishProjectDir = ${projectDir.trim()}`);
    outputChannel.appendLine(`[Squish] reposBasePath    = ${reposBase.trim() || "(not set, falling back to squishProjectDir)"}`);
    try {
      const dirs = resolveProjectSourcePaths(projectDir.trim(), reposBase.trim() || undefined);
      outputChannel.appendLine(`[Squish] Resolved ${dirs.length} source paths from .pydevproject:`);
      for (const d of dirs) { outputChannel.appendLine(`  → ${d}`); }
      return dirs;
    } catch (err) {
      outputChannel.appendLine(`[Squish] ERROR reading project files: ${String(err)}`);
      vscode.window.showWarningMessage(
        `Squish Helper: Failed to parse project files in "${projectDir}": ${String(err)}`
      );
    }
  }

  // Fallback: derive paths from the bat file via SquishSettings
  if (batFilePath.trim().length > 0) {
    try {
      const env = parseBatFile(batFilePath.trim());
      return await findGlobalScriptDirs(env, basePath);
    } catch (err) {
      vscode.window.showWarningMessage(
        `Squish Helper: Failed to parse bat file: ${String(err)}`
      );
    }
  }

  return manualDirs;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel("Squish Helper");
  outputChannel.show(true);
  context.subscriptions.push(outputChannel);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "$(symbol-misc) Squish: loading…";
  statusBarItem.tooltip = "Squish Helper — global script symbols";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const userDirs = await resolveGlobalScriptDirs();
  const stubsDir = context.asAbsolutePath("stubs");
  const workspaceDirs = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  const globalScriptDirs = [stubsDir, ...workspaceDirs, ...userDirs];

  outputChannel.appendLine(`[Squish] Workspace folders: ${workspaceDirs.join(", ") || "(none)"}`);
  outputChannel.appendLine(`[Squish] Final dir list sent to server (${globalScriptDirs.length} total):`);
  for (const d of globalScriptDirs) { outputChannel.appendLine(`  ${d}`); }

  const serverModule = context.asAbsolutePath(path.join("out", "server.js"));

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "python" }],
    initializationOptions: { globalScriptDirs },
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.py"),
    },
  };

  client = new LanguageClient(
    "squishHelper",
    "Squish Helper",
    serverOptions,
    clientOptions
  );

  client.onNotification("squish/symbolsLoaded", (params: { count: number }) => {
    statusBarItem.text = `$(symbol-misc) Squish: ${params.count} symbols`;
  });

  await client.start();

  function buildDirList(updatedUserDirs: string[]): string[] {
    const ws = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    return [stubsDir, ...ws, ...updatedUserDirs];
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("squishHelper.rescan", async () => {
      const updatedDirs = await resolveGlobalScriptDirs();
      await client?.sendNotification("squish/updateDirs", {
        globalScriptDirs: buildDirList(updatedDirs),
      });
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("squishHelper")) {
        const updatedDirs = await resolveGlobalScriptDirs();
        await client?.sendNotification("squish/updateDirs", {
          globalScriptDirs: buildDirList(updatedDirs),
        });
      }
    })
  );
}

export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
  }
}
