import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  CompletionItem,
  CompletionItemKind,
  CompletionParams,
  DidChangeWatchedFilesParams,
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

function deduplicateSymbols(symbols: SquishSymbol[]): SquishSymbol[] {
  const seen = new Set<string>();
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

async function rebuildSymbolTable(): Promise<void> {
  connection.console.log(`[Squish] Scanning ${globalScriptDirs.length} directories:`);
  for (const dir of globalScriptDirs) {
    connection.console.log(`  → ${dir}`);
  }

  const raw = await scanDirectories(globalScriptDirs);
  symbolTable = deduplicateSymbols(raw);

  connection.console.log(`[Squish] Done — ${raw.length} raw symbols, ${symbolTable.length} after dedup`);
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
    const doc = documents.get(params.textDocument.uri);

    if (doc) {
      const textBefore = doc.getText({ start: { line: 0, character: 0 }, end: params.position });
      // Match "identifier." immediately before the cursor regardless of how completion was triggered
      const dotMatch = textBefore.match(/([A-Za-z_][A-Za-z0-9_]*)\.$/) ;
      if (dotMatch) {
        const parentClass = KNOWN_INSTANCES[dotMatch[1]];
        if (parentClass) {
          return symbolTable
            .filter((sym) => sym.parentClass === parentClass)
            .map((sym) => ({
              label: sym.name,
              kind: CompletionItemKind.Method,
              data: symbolTable.indexOf(sym),
            }));
        }
        // Dot after an unknown identifier — don't pollute with global symbols
        return [];
      }
    }

    const nonMethods = symbolTable
      .filter((sym) => sym.kind !== "method")
      .map((sym, index) => ({
        label: sym.name,
        kind: kindToCompletionKind(sym.kind),
        data: index,
      }));

    // Also include methods in the flat list so they appear when typing directly
    // e.g. typing "compare" shows "test.compare" without needing to type "test." first
    const methods = symbolTable
      .filter((sym) => sym.kind === "method" && sym.parentClass)
      .map((sym) => ({
        label: `${sym.parentClass}.${sym.name}`,
        kind: CompletionItemKind.Method,
        data: symbolTable.indexOf(sym),
      }));

    return [...nonMethods, ...methods];
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
