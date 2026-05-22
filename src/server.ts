import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  CompletionItem,
  CompletionItemKind,
  CompletionParams,
  TextDocumentPositionParams,
  DidChangeWatchedFilesParams,
  FileChangeType,
  DidChangeConfigurationNotification,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import { scanDirectories, SquishSymbol } from "./symbolEngine";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let globalScriptDirs: string[] = [];
let symbolTable: SquishSymbol[] = [];

// Maps the Squish global instance name (e.g. "test") to the stub class name (e.g. "_Test")
// so that dot-triggered completions can filter to the right method set.
const KNOWN_INSTANCES: Record<string, string> = {
  test: "_Test",
  object: "_Object",
  applicationContext: "ApplicationContext",
};

function kindToCompletionKind(kind: SquishSymbol["kind"]): CompletionItemKind {
  switch (kind) {
    case "function":
      return CompletionItemKind.Function;
    case "class":
      return CompletionItemKind.Class;
    case "variable":
      return CompletionItemKind.Variable;
    case "method":
      return CompletionItemKind.Method;
  }
}

async function rebuildSymbolTable(): Promise<void> {
  symbolTable = await scanDirectories(globalScriptDirs);
  connection.sendNotification("squish/symbolsLoaded", { count: symbolTable.length });
}

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const opts = params.initializationOptions as { globalScriptDirs?: string[] } | undefined;
  globalScriptDirs = opts?.globalScriptDirs ?? [];

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ["."],
      },
    },
  };
});

connection.onInitialized(async () => {
  await rebuildSymbolTable();

  connection.client.register(DidChangeConfigurationNotification.type, undefined);
});

connection.onCompletion(
  (params: CompletionParams): CompletionItem[] => {
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
                kind: CompletionItemKind.Method,
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
  }
);

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  const sym = symbolTable[item.data as number];
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

connection.onDidChangeWatchedFiles(async (params: DidChangeWatchedFilesParams) => {
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
connection.onNotification(
  "squish/updateDirs",
  async (params: { globalScriptDirs: string[] }) => {
    globalScriptDirs = params.globalScriptDirs;
    await rebuildSymbolTable();
  }
);

documents.listen(connection);
connection.listen();
