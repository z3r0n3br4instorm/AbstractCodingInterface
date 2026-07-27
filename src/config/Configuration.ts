import * as vscode from 'vscode';

export class Configuration {
  public static get backend(): string {
    return vscode.workspace.getConfiguration('aci').get<string>('backend') || 'ollama';
  }

  public static get baseUrl(): string {
    return vscode.workspace.getConfiguration('aci').get<string>('baseUrl') || 'http://localhost:11434';
  }

  public static get model(): string {
    return vscode.workspace.getConfiguration('aci').get<string>('model') || 'llama3';
  }

  public static get temperature(): number {
    return vscode.workspace.getConfiguration('aci').get<number>('temperature') ?? 0;
  }

  public static get targetLanguage(): string {
    return vscode.workspace.getConfiguration('aci').get<string>('targetLanguage') || 'python';
  }

  public static get compileTrigger(): string {
    return vscode.workspace.getConfiguration('aci').get<string>('compileTrigger') || 'onSave';
  }

  public static get onTypeDebounceMs(): number {
    return vscode.workspace.getConfiguration('aci').get<number>('onTypeDebounceMs') || 800;
  }
}
