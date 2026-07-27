import * as vscode from 'vscode';

export class VirtualDocumentProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  public readonly onDidChange = this._onDidChange.event;
  private documents = new Map<string, string>();

  public provideTextDocumentContent(uri: vscode.Uri): string {
    return this.documents.get(uri.toString()) || '';
  }

  public update(uri: vscode.Uri, content: string): void {
    this.documents.set(uri.toString(), content);
    this._onDidChange.fire(uri);
  }

  public delete(uri: vscode.Uri): void {
    this.documents.delete(uri.toString());
  }
}
