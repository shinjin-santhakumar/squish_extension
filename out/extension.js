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
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const node_1 = require("vscode-languageclient/node");
const squishSettings_1 = require("./squishSettings");
let client;
let statusBarItem;
let outputChannel;
async function updatePylancePaths(userDirs) {
    if (userDirs.length === 0) {
        return;
    }
    try {
        const pythonConfig = vscode.workspace.getConfiguration("python.analysis");
        const existing = pythonConfig.get("extraPaths") ?? [];
        // Keep any existing paths that aren't ours, append after our ordered list
        const ours = new Set(userDirs);
        const others = existing.filter((p) => !ours.has(p));
        const merged = [...userDirs, ...others];
        await pythonConfig.update("extraPaths", merged, vscode.ConfigurationTarget.Workspace);
        outputChannel.appendLine(`[Squish] Updated python.analysis.extraPaths (${merged.length} entries, apollo first)`);
    }
    catch (err) {
        outputChannel.appendLine(`[Squish] Could not update python.analysis.extraPaths: ${String(err)}`);
    }
}
async function resolveGlobalScriptDirs() {
    const config = vscode.workspace.getConfiguration("squishHelper");
    const batFilePath = config.get("batFilePath") ?? "";
    const basePath = config.get("globalScriptBasePath") ?? "C:\\";
    const manualDirs = config.get("globalScriptDirs") ?? [];
    const projectDir = config.get("squishHelper.squishProjectDir") ?? config.get("squishProjectDir") ?? "";
    // Preferred: parse .project + .pydevproject for accurate source paths
    const reposBase = config.get("reposBasePath") ?? "";
    if (projectDir.trim().length > 0) {
        outputChannel.appendLine(`[Squish] squishProjectDir = ${projectDir.trim()}`);
        outputChannel.appendLine(`[Squish] reposBasePath    = ${reposBase.trim() || "(not set, falling back to squishProjectDir)"}`);
        try {
            const dirs = (0, squishSettings_1.resolveProjectSourcePaths)(projectDir.trim(), reposBase.trim() || undefined);
            outputChannel.appendLine(`[Squish] Resolved ${dirs.length} source paths from .pydevproject:`);
            for (const d of dirs) {
                outputChannel.appendLine(`  → ${d}`);
            }
            return dirs;
        }
        catch (err) {
            outputChannel.appendLine(`[Squish] ERROR reading project files: ${String(err)}`);
            vscode.window.showWarningMessage(`Squish Helper: Failed to parse project files in "${projectDir}": ${String(err)}`);
        }
    }
    // Fallback: derive paths from the bat file via SquishSettings
    if (batFilePath.trim().length > 0) {
        try {
            const env = (0, squishSettings_1.parseBatFile)(batFilePath.trim());
            return await (0, squishSettings_1.findGlobalScriptDirs)(env, basePath);
        }
        catch (err) {
            vscode.window.showWarningMessage(`Squish Helper: Failed to parse bat file: ${String(err)}`);
        }
    }
    return manualDirs;
}
async function activate(context) {
    outputChannel = vscode.window.createOutputChannel("Squish Helper");
    outputChannel.show(true);
    context.subscriptions.push(outputChannel);
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(symbol-misc) Squish: loading…";
    statusBarItem.tooltip = "Squish Helper — global script symbols";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    const userDirs = await resolveGlobalScriptDirs();
    await updatePylancePaths(userDirs);
    const stubsDir = context.asAbsolutePath("stubs");
    const workspaceDirs = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    const globalScriptDirs = [stubsDir, ...workspaceDirs, ...userDirs];
    outputChannel.appendLine(`[Squish] Workspace folders: ${workspaceDirs.join(", ") || "(none)"}`);
    outputChannel.appendLine(`[Squish] Final dir list sent to server (${globalScriptDirs.length} total):`);
    for (const d of globalScriptDirs) {
        outputChannel.appendLine(`  ${d}`);
    }
    const serverModule = context.asAbsolutePath(path.join("out", "server.js"));
    const serverOptions = {
        run: { module: serverModule, transport: node_1.TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: node_1.TransportKind.ipc,
            options: { execArgv: ["--nolazy", "--inspect=6009"] },
        },
    };
    const clientOptions = {
        documentSelector: [{ scheme: "file", language: "python" }],
        initializationOptions: { globalScriptDirs },
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher("**/*.py"),
        },
    };
    client = new node_1.LanguageClient("squishHelper", "Squish Helper", serverOptions, clientOptions);
    client.onNotification("squish/symbolsLoaded", (params) => {
        statusBarItem.text = `$(symbol-misc) Squish: ${params.count} symbols`;
    });
    await client.start();
    function buildDirList(updatedUserDirs) {
        const ws = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
        return [stubsDir, ...ws, ...updatedUserDirs];
    }
    context.subscriptions.push(vscode.commands.registerCommand("squishHelper.rescan", async () => {
        const updatedDirs = await resolveGlobalScriptDirs();
        await updatePylancePaths(updatedDirs);
        await client?.sendNotification("squish/updateDirs", {
            globalScriptDirs: buildDirList(updatedDirs),
        });
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (event.affectsConfiguration("squishHelper")) {
            const updatedDirs = await resolveGlobalScriptDirs();
            await updatePylancePaths(updatedDirs);
            await client?.sendNotification("squish/updateDirs", {
                globalScriptDirs: buildDirList(updatedDirs),
            });
        }
    }));
}
async function deactivate() {
    if (client) {
        await client.stop();
    }
}
//# sourceMappingURL=extension.js.map