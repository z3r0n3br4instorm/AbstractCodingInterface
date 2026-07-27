import * as vscode from 'vscode';
import { CompileOrchestrator } from './core/CompileOrchestrator';
import { AciSettingsProvider, editSettingCommand } from './providers/AciSettingsProvider';

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
        orchestrator.compile(editor.document);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aci.makePsyxCompatible', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        orchestrator.makePsyxCompatible(editor.document);
      } else {
        vscode.window.showWarningMessage('ACI: No active editor window focused.');
      }
    })
  );

  const settingsProvider = new AciSettingsProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('aci-settings', settingsProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aci.editSetting', (item) => editSettingCommand(item, settingsProvider))
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('aci')) {
        settingsProvider.refresh();
      }
    })
  );
}

export function deactivate() {}
