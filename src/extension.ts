import * as vscode from 'vscode';
import { CompileOrchestrator } from './core/CompileOrchestrator';

export function activate(context: vscode.ExtensionContext) {
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  context.subscriptions.push(statusBar);

  const orchestrator = new CompileOrchestrator(statusBar);

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => orchestrator.handleSave(doc))
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => orchestrator.handleType(e))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aci.compile', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        orchestrator.handleSave(editor.document);
      }
    })
  );
}

export function deactivate() {}
