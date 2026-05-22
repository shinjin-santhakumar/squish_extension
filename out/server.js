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
async function rebuildSymbolTable() {
    symbolTable = await (0, symbolEngine_1.scanDirectories)(globalScriptDirs);
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
    const triggerChar = params.context?.triggerCharacter;
    if (triggerChar === ".") {
        const doc = documents.get(params.textDocument.uri);
        if (doc) {
            const offset = doc.offsetAt(params.position);
            const textBefore = doc.getText({ start: { line: 0, character: 0 }, end: params.position });
            // Strip the trailing dot, then find the identifier immediately before it
            const withoutDot = textBefore.slice(0, -1);
            const identMatch = withoutDot.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
            if (identMatch) {
                const ident = identMatch[1];
                const parentClass = KNOWN_INSTANCES[ident];
                if (parentClass) {
                    return symbolTable
                        .filter((sym) => sym.parentClass === parentClass)
                        .map((sym) => ({
                        label: sym.name,
                        kind: node_1.CompletionItemKind.Method,
                        data: symbolTable.indexOf(sym),
                    }));
                }
            }
        }
        return [];
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