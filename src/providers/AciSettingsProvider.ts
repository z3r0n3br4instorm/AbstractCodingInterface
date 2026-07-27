import * as vscode from 'vscode';
import { Configuration } from '../config/Configuration';

export class SettingItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly key: string,
    public readonly value: any,
    public readonly descriptionStr: string,
    public readonly type: 'string' | 'number' | 'enum',
    public readonly enumValues?: string[]
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = this.descriptionStr;
    this.description = String(value);
    
    // Add icon based on type or key
    if (key.includes('backend') || key.includes('url')) {
      this.iconPath = new vscode.ThemeIcon('server');
    } else if (key.includes('model')) {
      this.iconPath = new vscode.ThemeIcon('hubot');
    } else if (key.includes('Language')) {
      this.iconPath = new vscode.ThemeIcon('code');
    } else {
      this.iconPath = new vscode.ThemeIcon('gear');
    }

    this.command = {
      command: 'aci.editSetting',
      title: 'Edit Setting',
      arguments: [this]
    };
  }
}

export class AciSettingsProvider implements vscode.TreeDataProvider<SettingItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SettingItem | undefined | void> = new vscode.EventEmitter<SettingItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<SettingItem | undefined | void> = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SettingItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SettingItem): Thenable<SettingItem[]> {
    if (element) {
      return Promise.resolve([]);
    }

    const config = vscode.workspace.getConfiguration('aci');

    return Promise.resolve([
      new SettingItem('Backend', 'backend', config.get('backend'), 'The backend to use for generating code', 'enum', ['ollama', 'openai-compatible']),
      new SettingItem('Base URL', 'baseUrl', config.get('baseUrl'), 'The base URL of the local model API', 'string'),
      new SettingItem('Model', 'model', config.get('model'), 'The model to use for generation', 'string'),
      new SettingItem('Target Language', 'targetLanguage', config.get('targetLanguage'), 'The target language to compile to', 'string'),
      new SettingItem('Compile Trigger', 'compileTrigger', config.get('compileTrigger'), 'When to trigger code generation', 'enum', ['onSave', 'onType']),
      new SettingItem('Debounce (ms)', 'onTypeDebounceMs', config.get('onTypeDebounceMs'), 'Debounce time in milliseconds for onType trigger', 'number')
    ]);
  }
}

export async function editSettingCommand(item: SettingItem, provider: AciSettingsProvider) {
  let newValue: any = undefined;

  if (item.type === 'enum' && item.enumValues) {
    const selected = await vscode.window.showQuickPick(item.enumValues, {
      placeHolder: `Select value for ${item.label}`,
      title: `Edit ${item.label}`
    });
    if (selected) {
      newValue = selected;
    }
  } else if (item.type === 'string') {
    const input = await vscode.window.showInputBox({
      prompt: `Enter new value for ${item.label}`,
      value: String(item.value),
      title: `Edit ${item.label}`
    });
    if (input !== undefined) {
      newValue = input;
    }
  } else if (item.type === 'number') {
    const input = await vscode.window.showInputBox({
      prompt: `Enter new numeric value for ${item.label}`,
      value: String(item.value),
      title: `Edit ${item.label}`,
      validateInput: text => isNaN(Number(text)) ? 'Must be a number' : null
    });
    if (input !== undefined && !isNaN(Number(input))) {
      newValue = Number(input);
    }
  }

  if (newValue !== undefined) {
    await vscode.workspace.getConfiguration('aci').update(item.key, newValue, vscode.ConfigurationTarget.Global);
    provider.refresh();
  }
}
