import * as vscode from 'vscode';
import { BackendFactory } from '../backends/BackendFactory';
import { Configuration } from '../config/Configuration';
import { parsePsyx, blocksChanged, PsyxBlock } from '../psyx/PsyxParser';
import { serializeOutput, deserializeOutput, mergeBlocks, CompiledBlock } from '../psyx/OutputAssembler';

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

function buildSystemPrompt(targetLang: string): string {
  return `You are a PSyx compiler. Translate the following PSyx pseudocode block into ${targetLang} code.
Output ONLY the raw ${targetLang} code — no markdown fences, no explanations, no comments, no <think> blocks.
Preserve correct indentation and style for ${targetLang}.`;
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

  private async compile(document: vscode.TextDocument): Promise<void> {
    const uriString = document.uri.toString();
    if (this.compiling.has(uriString)) {
      return;
    }
    this.compiling.add(uriString);

    const targetLang = Configuration.targetLanguage;
    const targetUri = this.targetUri(document);

    try {
      const newBlocks = parsePsyx(document.getText());

      let existingText: string | null = null;
      let existingCompiledBlocks: CompiledBlock[] = [];
      let existingPsyxBlocks: PsyxBlock[] = [];
      let targetDoc: vscode.TextDocument | null = null;

      try {
        targetDoc = await vscode.workspace.openTextDocument(targetUri);
        existingText = targetDoc.getText();
        existingCompiledBlocks = deserializeOutput(existingText);
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
          { role: 'system', content: buildSystemPrompt(targetLang) },
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
            const newText = serializeOutput(assembled);
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
      const finalText = serializeOutput(finalAssembled);
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
