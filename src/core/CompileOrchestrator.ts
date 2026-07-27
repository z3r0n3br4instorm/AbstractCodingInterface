import * as vscode from 'vscode';
import { BackendFactory } from '../backends/BackendFactory';
import { Configuration } from '../config/Configuration';
import { parsePsyx, blocksChanged, PsyxBlock } from '../psyx/PsyxParser';
import { serializeOutput, deserializeOutput, mergeBlocks, CompiledBlock, getCommentSyntax } from '../psyx/OutputAssembler';

const LANG_EXTS: Record<string, string> = {
  python: 'py', javascript: 'js', typescript: 'ts',
  go: 'go', rust: 'rs', java: 'java',
  cpp: 'cpp', c: 'c', html: 'html',
  css: 'css', ruby: 'rb', php: 'php'
};

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

function buildCompileSystemPrompt(targetLang: string, kind: string): string {
  let prompt = `You are a PSyx compiler. Translate the following PSyx pseudocode block into ${targetLang} code.
Output ONLY the raw ${targetLang} code — no markdown fences, no explanations, no comments, no <think> blocks.
Preserve correct indentation and style for ${targetLang}.`;

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
      let existingPsyxBlocks: PsyxBlock[] = [];
      let targetDoc: vscode.TextDocument | null = null;

      try {
        targetDoc = await vscode.workspace.openTextDocument(targetUri);
        existingText = targetDoc.getText();
        existingCompiledBlocks = deserializeOutput(existingText, ext);
      } catch {
        existingText = null;
      }

      const blocksToCompile = existingText
        ? blocksChanged(existingPsyxBlocks, newBlocks)
        : newBlocks;

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

      for (let i = 0; i < blocksToCompile.length; i++) {
        const block = blocksToCompile[i];
        const key = block.kind + ':' + block.name;

        this.statusBar.text = `$(sync~spin) ACI: Compiling ${block.name} (${i + 1}/${blocksToCompile.length})`;
        this.statusBar.show();

        const messages = [
          { role: 'system', content: buildCompileSystemPrompt(targetLang, block.kind) },
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

        freshCode.set(key, extractCode(stripThinking(blockBuffer)));
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
