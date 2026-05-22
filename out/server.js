"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const symbolEngine_1 = require("./symbolEngine");
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
let globalScriptDirs = [];
let symbolTable = [];
// Maps the Squish global instance name (e.g. "test") to the stub class name (e.g. "_Test")
// so that dot-triggered completions can filter to the right method set.
const KNOWN_INSTANCES = {
    test: "_Test",
    object: "_Object",
    applicationContext: "ApplicationContext",
};
function kindToCompletionKind(kind) {
    switch (kind) {
        case "function":
            return node_1.CompletionItemKind.Function;
        case "class":
            return node_1.CompletionItemKind.Class;
        case "variable":
            return node_1.CompletionItemKind.Variable;
        case "method":
            return node_1.CompletionItemKind.Method;
    }
}
function deduplicateSymbols(symbols) {
    const seen = new Set();
    return symbols.filter((sym) => {
        // Methods are keyed by parentClass.name so same-named methods on different classes are kept
        const key = sym.parentClass ? `${sym.parentClass}.${sym.name}` : sym.name;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
async function rebuildSymbolTable() {
    connection.console.log(`[Squish] Scanning ${globalScriptDirs.length} directories:`);
    for (const dir of globalScriptDirs) {
        connection.console.log(`  → ${dir}`);
    }
    const raw = await (0, symbolEngine_1.scanDirectories)(globalScriptDirs);
    symbolTable = deduplicateSymbols(raw);
    connection.console.log(`[Squish] Done — ${raw.length} raw symbols, ${symbolTable.length} after dedup`);
    connection.sendNotification("squish/symbolsLoaded", { count: symbolTable.length });
}
connection.onInitialize((params) => {
    const opts = params.initializationOptions;
    globalScriptDirs = opts?.globalScriptDirs ?? [];
    return {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ["."],
            },
        },
    };
});
connection.onInitialized(async () => {
    await rebuildSymbolTable();
    connection.client.register(node_1.DidChangeConfigurationNotification.type, undefined);
});
connection.onCompletion((params) => {
    const doc = documents.get(params.textDocument.uri);
    if (doc) {
        const textBefore = doc.getText({ start: { line: 0, character: 0 }, end: params.position });
        // Match "identifier." immediately before the cursor regardless of how completion was triggered
        const dotMatch = textBefore.match(/([A-Za-z_][A-Za-z0-9_]*)\.$/);
        if (dotMatch) {
            const parentClass = KNOWN_INSTANCES[dotMatch[1]];
            if (parentClass) {
                return symbolTable
                    .filter((sym) => sym.parentClass === parentClass)
                    .map((sym) => ({
                    label: sym.name,
                    kind: node_1.CompletionItemKind.Method,
                    data: symbolTable.indexOf(sym),
                }));
            }
            // Dot after an unknown identifier — don't pollute with global symbols
            return [];
        }
    }
    return symbolTable
        .filter((sym) => sym.kind !== "method")
        .map((sym, index) => ({
        label: sym.name,
        kind: kindToCompletionKind(sym.kind),
        data: index,
    }));
});
connection.onCompletionResolve((item) => {
    const sym = symbolTable[item.data];
    if (!sym) {
        return item;
    }
    item.detail = `${sym.filePath}:${sym.line}`;
    if (sym.docstring) {
        item.documentation = sym.docstring;
    }
    return item;
});
connection.onDidChangeConfiguration(async () => {
    await rebuildSymbolTable();
});
connection.onDidChangeWatchedFiles(async (params) => {
    const affectsGlobalDirs = params.changes.some((change) => {
        const filePath = decodeURIComponent(change.uri.replace(/^file:\/\/\/?/, "").replace(/\//g, "\\"));
        return globalScriptDirs.some((dir) => filePath.startsWith(dir));
    });
    if (affectsGlobalDirs) {
        await rebuildSymbolTable();
    }
});
// Custom notification from the extension host requesting a full rescan
connection.onNotification("squish/rescan", async () => {
    await rebuildSymbolTable();
});
// The extension host may push updated dirs at runtime
connection.onNotification("squish/updateDirs", async (params) => {
    globalScriptDirs = params.globalScriptDirs;
    await rebuildSymbolTable();
});
documents.listen(connection);
connection.listen();
//# sourceMappingURL=server.js.map