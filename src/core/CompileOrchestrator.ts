import * as vscode from 'vscode';
import { BackendFactory } from '../backends/BackendFactory';
import { Configuration } from '../config/Configuration';
import { parsePsyx, blocksChanged, PsyxBlock } from '../psyx/PsyxParser';
import { serializeOutput, deserializeOutput, mergeBlocks, CompiledBlock, getCommentSyntax, extractImports } from '../psyx/OutputAssembler';

const LANG_EXTS: Record<string, string> = {
  python: 'py', javascript: 'js', typescript: 'ts',
  go: 'go', rust: 'rs', java: 'java',
  cpp: 'cpp', c: 'c', html: 'html',
  css: 'css', ruby: 'rb', php: 'php'
};

/**
 * Returns a regex that verifies `code` actually defines `name` in `lang`.
 * Returns null when we don't have a rule for that language (skip validation).
 */
function buildDeclarationPattern(name: string, lang: string): RegExp | null {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  switch (lang.toLowerCase()) {
    case 'python': return new RegExp(`^\\s*(?:async\\s+)?def\\s+${n}\\s*\\(`, 'm');
    case 'javascript':
    case 'typescript': return new RegExp(`(?:^\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${n}\\s*\\(|^\\s*(?:export\\s+)?(?:const|let|var)\\s+${n}\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|\\w+)\\s*=>)`, 'm');
    case 'go': return new RegExp(`^\\s*func\\s+${n}\\s*\\(`, 'm');
    case 'rust': return new RegExp(`^\\s*(?:pub\\s+)?(?:async\\s+)?fn\\s+${n}\\s*\\(`, 'm');
    case 'java': return new RegExp(`(?:public|private|protected|static|\\s)+[\\w<>\\[\\]]+\\s+${n}\\s*\\(`, 'm');
    case 'c':
    case 'cpp': return new RegExp(`^[\\w\\s*&]+\\s+${n}\\s*\\(`, 'm');
    case 'ruby': return new RegExp(`^\\s*def\\s+${n}\\b`, 'm');
    case 'php': return new RegExp(`^\\s*(?:public\\s+|private\\s+|protected\\s+|static\\s+)*function\\s+${n}\\s*\\(`, 'm');
    default: return null;
  }
}

/** Human-readable declaration hint for the retry prompt */
function declarationHint(name: string, lang: string): string {
  switch (lang.toLowerCase()) {
    case 'python':     return `def ${name}(...):`;
    case 'javascript':
    case 'typescript': return `function ${name}(...) { ... }`;
    case 'go':        return `func ${name}(...) { ... }`;
    case 'rust':      return `fn ${name}(...) { ... }`;
    case 'java':      return `<ReturnType> ${name}(...) { ... }`;
    case 'c':
    case 'cpp':       return `<return_type> ${name}(...) { ... }`;
    case 'ruby':      return `def ${name}; end`;
    case 'php':       return `function ${name}(...) { ... }`;
    default:          return `${name}(...)`;
  }
}

function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/, '');
}

function extractCode(text: string): string {
  const closed = text.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
  if (closed) return closed[1];
  const open = text.match(/```[a-zA-Z]*\n([\s\S]*)/);
  if (open) return open[1];
  return text;
}

function buildCompileSystemPrompt(
  targetLang: string,
  kind: string,
  blockName: string,
  signatures: string[]
): string {
  let prompt = `You are a PSyx compiler. Translate the following PSyx pseudocode block into ${targetLang} code.
CRITICAL: Output ONLY the raw ${targetLang} code — no markdown fences, no conversational text, no explanations, no <think> blocks. Outputting anything other than raw code is a fatal error.
Preserve correct indentation and style for ${targetLang}.`;

  if (kind === 'func' || kind === 'class' || kind === 'func-main') {
    prompt += `\nIf this block requires any libraries to be imported/included, output those import statements at the VERY TOP of your response (line 1), followed by a blank line, and then the function/class code.`;
  } else if (kind === 'import') {
    prompt += `\nThis is the global imports block. Output ONLY the required import/include statements for the target language.`;
  }

  if (kind === 'func' || kind === 'class') {
    const hint = declarationHint(blockName, targetLang);
    prompt += `\n\nCONTRACT (NON-NEGOTIABLE): Your output MUST define a callable named exactly \`${blockName}\`.
The required declaration form is: ${hint}
All logic for this block must live inside that function/class body. Do NOT emit module-level or top-level executable statements — any logic must be inside \`${blockName}\`.`;
  }

  if (signatures.length > 0 && (kind === 'func-main' || kind === 'func')) {
    prompt += `\n\nCRITICAL: The following functions/classes are already defined globally in this file:
${signatures.map(s => `- ${s}`).join('\n')}
DO NOT generate forward declarations, interfaces, or implementations for these. Assume they already exist in the global scope. Just call them directly using these exact names.`;
  }

  if (kind === 'func-main') {
    prompt += `\n\nCRITICAL: This is the MAIN function entry point of the program. You must output the standard main execution block for ${targetLang}. For example, in Python: \`if __name__ == "__main__":\`, in Go: \`func main()\`, in Java: \`public static void main(String[] args)\`, etc.`;
  }

  return prompt;
}

function buildMakePsyxCompatibleSystemPrompt(sourceLang: string, ext: string): string {
  const c = getCommentSyntax(ext);
  return `You are an ACI assistant. Annotate the provided ${sourceLang} source code with ACI block markers so it becomes PSyx-compatible.
Find every function/method and class in the code.
Wrap each one with the appropriate block marker comments using this exact syntax:
${c.start}ACI-BLOCK: func:<function_name>${c.end}
<function body>
${c.start}ACI-BLOCK-END${c.end}

For classes, use \`class:<class_name>\`.
If you find the main entry point of the program (e.g. \`if __name__ == "__main__":\` or \`func main()\`), wrap it with \`func-main:main\`.
Leave all other code (imports, globals) unannotated.
DO NOT change the source code itself, just insert the comment lines. Output ONLY the fully annotated source code, with NO markdown code fences (\`\`\`) and NO <think> blocks.`;
}

export class CompileOrchestrator {
  private compiling = new Set<string>();
  private typingTimeout: NodeJS.Timeout | null = null;
  private statusBar: vscode.StatusBarItem;

  constructor(statusBar: vscode.StatusBarItem) {
    this.statusBar = statusBar;
  }

  public async handleSave(document: vscode.TextDocument): Promise<void> {
    if (Configuration.compileTrigger !== 'onSave' || document.languageId !== 'aci') {
      return;
    }
    await this.compile(document);
  }

  public handleType(event: vscode.TextDocumentChangeEvent): void {
    if (Configuration.compileTrigger !== 'onType' || event.document.languageId !== 'aci') {
      return;
    }
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    this.typingTimeout = setTimeout(() => {
      this.compile(event.document);
    }, Configuration.onTypeDebounceMs);
  }

  private targetUri(document: vscode.TextDocument): vscode.Uri {
    const lang = Configuration.targetLanguage;
    const ext = LANG_EXTS[lang.toLowerCase()] || lang;
    let p = document.uri.path;
    p = p.endsWith('.aci') ? p.slice(0, -4) + '.' + ext : p + '.' + ext;
    return document.uri.with({ path: p });
  }

  public async makePsyxCompatible(document: vscode.TextDocument): Promise<void> {
    if (document.languageId === 'aci') {
      vscode.window.showInformationMessage('ACI: Focused file is a PSyx (.aci) document. Open the target code file instead!');
      return;
    }

    const uriString = document.uri.toString();
    if (this.compiling.has(uriString)) {
      return;
    }
    this.compiling.add(uriString);

    const fileName = document.uri.path.split('/').pop() || 'document';
    const sourceLang = document.languageId || 'code';
    const ext = document.uri.path.split('.').pop() || '';

    try {
      this.statusBar.text = `$(sync~spin) ACI: Making ${fileName} PSyx Compatible...`;
      this.statusBar.show();

      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.toString() !== document.uri.toString()) {
        throw new Error('Target document must be active in the editor.');
      }

      const backend = BackendFactory.getBackend();
      const messages = [
        { role: 'system', content: buildMakePsyxCompatibleSystemPrompt(sourceLang, ext) },
        { role: 'user', content: document.getText() }
      ];

      const stream = backend.chat(messages);
      let buffer = '';
      let lastUpdate = Date.now();

      for await (const chunk of stream) {
        buffer += chunk;
        const currentContent = extractCode(stripThinking(buffer));

        const now = Date.now();
        if (now - lastUpdate > 50) {
          await editor.edit(eb => {
            const last = document.lineCount - 1;
            const lastChar = document.lineAt(last).text.length;
            eb.replace(new vscode.Range(0, 0, last, lastChar), currentContent);
          }, { undoStopBefore: false, undoStopAfter: false });
          lastUpdate = now;
        }
      }

      const finalContent = extractCode(stripThinking(buffer));
      await editor.edit(eb => {
        const last = document.lineCount - 1;
        const lastChar = document.lineAt(last).text.length;
        eb.replace(new vscode.Range(0, 0, last, lastChar), finalContent);
      }, { undoStopBefore: false, undoStopAfter: true });

      await document.save();
      vscode.window.showInformationMessage(`ACI: Successfully made ${fileName} PSyx compatible!`);

    } catch (e) {
      vscode.window.showErrorMessage(`ACI PSyx Compatibility Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.compiling.delete(uriString);
      this.statusBar.hide();
    }
  }

  public async compile(document: vscode.TextDocument): Promise<void> {
    const uriString = document.uri.toString();
    if (this.compiling.has(uriString)) {
      return;
    }
    this.compiling.add(uriString);

    const targetLang = Configuration.targetLanguage;
    const targetUri = this.targetUri(document);
    const ext = targetUri.path.split('.').pop() || '';

    try {
      const newBlocks = parsePsyx(document.getText());

      let existingText: string | null = null;
      let existingCompiledBlocks: CompiledBlock[] = [];
      let targetDoc: vscode.TextDocument | null = null;

      try {
        targetDoc = await vscode.workspace.openTextDocument(targetUri);
        existingText = targetDoc.getText();
        existingCompiledBlocks = deserializeOutput(existingText, ext);
      } catch {
        existingText = null;
      }

      const blocksToCompile = existingText
        ? newBlocks.filter(b => {
            const existing = existingCompiledBlocks.find(c => c.psyxKind === b.kind && c.psyxName === b.name);
            return !existing || existing.hash !== b.hash;
          })
        : [...newBlocks];

      blocksToCompile.sort((a, b) => {
        if (a.kind === 'func-main' && b.kind !== 'func-main') return 1;
        if (b.kind === 'func-main' && a.kind !== 'func-main') return -1;
        return 0;
      });

      if (!existingText) {
        const we = new vscode.WorkspaceEdit();
        we.createFile(targetUri, { overwrite: true });
        await vscode.workspace.applyEdit(we);
        targetDoc = await vscode.workspace.openTextDocument(targetUri);
      }

      const editor = await vscode.window.showTextDocument(targetDoc!, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: true
      });

      if (blocksToCompile.length === 0) {
        return;
      }

      const backend = BackendFactory.getBackend();
      const freshCode = new Map<string, string>();
      const globalImports = new Set<string>();
      
      const signatures = newBlocks
        .filter(b => b.kind === 'func' || b.kind === 'class')
        .map(b => b.signature)
        .filter(s => s);

      for (let i = 0; i < blocksToCompile.length; i++) {
        const block = blocksToCompile[i];
        const key = block.kind + ':' + block.name;

        this.statusBar.text = `$(sync~spin) ACI: Compiling ${block.name} (${i + 1}/${blocksToCompile.length})`;
        this.statusBar.show();

        const messages = [
          { role: 'system', content: buildCompileSystemPrompt(targetLang, block.kind, block.name, signatures) },
          { role: 'user', content: block.body }
        ];

        let blockBuffer = '';

        const stream = backend.chat(messages);
        let lastUpdate = Date.now();

        for await (const chunk of stream) {
          blockBuffer += chunk;
          freshCode.set(key, extractCode(stripThinking(blockBuffer)));

          const now = Date.now();
          if (now - lastUpdate > 50) {
            // live streaming might have imports at top, we don't extract until final
            const assembled = mergeBlocks(existingCompiledBlocks, newBlocks, freshCode);
            const newText = serializeOutput(assembled, ext);
            await editor.edit(eb => {
              const last = targetDoc!.lineCount - 1;
              const lastChar = targetDoc!.lineAt(last).text.length;
              eb.replace(new vscode.Range(0, 0, last, lastChar), newText);
            }, { undoStopBefore: false, undoStopAfter: false });
            lastUpdate = now;
          }
        }

        let finalBufferContent = extractCode(stripThinking(blockBuffer)).trim();
        if (block.kind !== 'import' && block.kind !== 'preamble') {
          const extracted = extractImports(finalBufferContent, targetLang);
          finalBufferContent = extracted.remainingCode;
          extracted.imports.forEach(i => globalImports.add(i));
        }

        // --- Declaration contract validation & auto-retry ---
        if (block.kind === 'func' || block.kind === 'class') {
          const pattern = buildDeclarationPattern(block.name, targetLang);
          if (pattern && !pattern.test(finalBufferContent)) {
            // Attempt one retry with an explicit failure message
            this.statusBar.text = `$(warning) ACI: Retrying ${block.name} (declaration missing)…`;
            const retryMessages = [
              {
                role: 'system',
                content: buildCompileSystemPrompt(targetLang, block.kind, block.name, signatures)
              },
              { role: 'user', content: block.body },
              { role: 'assistant', content: finalBufferContent },
              {
                role: 'user',
                content: `Your previous output did not define \`${block.name}\`. Wrap ALL logic inside a ` +
                  `${declarationHint(block.name, targetLang)} definition. ` +
                  `Output ONLY the corrected ${targetLang} code, nothing else.`
              }
            ];
            let retryBuffer = '';
            for await (const chunk of backend.chat(retryMessages)) {
              retryBuffer += chunk;
            }
            const retryContent = extractCode(stripThinking(retryBuffer)).trim();
            if (pattern.test(retryContent)) {
              // Retry succeeded — use the better output
              const retryExtracted = extractImports(retryContent, targetLang);
              finalBufferContent = retryExtracted.remainingCode;
              retryExtracted.imports.forEach(i => globalImports.add(i));
            } else {
              // Both attempts failed — surface a hard error
              throw new Error(
                `Block '${block.name}' did not produce a valid ${targetLang} declaration after retry. ` +
                `Expected a definition matching: ${declarationHint(block.name, targetLang)}. ` +
                `Check your PSyx pseudocode and model output.`
              );
            }
          }
        }

        freshCode.set(key, finalBufferContent);
      }

      if (globalImports.size > 0) {
        let importBlock = newBlocks.find(b => b.kind === 'import');
        if (!importBlock) {
          importBlock = { kind: 'import', name: '__imports__', body: '', index: -1, hash: '', signature: '' };
          const preambleIndex = newBlocks.findIndex(b => b.kind === 'preamble');
          if (preambleIndex !== -1) newBlocks.splice(preambleIndex + 1, 0, importBlock!);
          else newBlocks.unshift(importBlock!);
        }
        
        const existingImportCode = existingCompiledBlocks.find(b => b.psyxKind === 'import' && b.psyxName === '__imports__')?.code || '';
        const existingImportLines = new Set(existingImportCode.split('\n').map(l => l.trim()).filter(l => l));
        globalImports.forEach(i => existingImportLines.add(i));
        
        freshCode.set('import:__imports__', Array.from(existingImportLines).join('\n'));
      }

      const finalAssembled = mergeBlocks(existingCompiledBlocks, newBlocks, freshCode);
      const finalText = serializeOutput(finalAssembled, ext);
      await editor.edit(eb => {
        const last = targetDoc!.lineCount - 1;
        const lastChar = targetDoc!.lineAt(last).text.length;
        eb.replace(new vscode.Range(0, 0, last, lastChar), finalText);
      }, { undoStopBefore: false, undoStopAfter: true });
      await targetDoc!.save();

    } catch (e) {
      vscode.window.showErrorMessage(`ACI Compile Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.compiling.delete(uriString);
      this.statusBar.hide();
    }
  }
}
