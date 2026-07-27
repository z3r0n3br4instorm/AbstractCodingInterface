"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AciSettingsProvider = exports.SettingItem = void 0;
exports.editSettingCommand = editSettingCommand;
const vscode = __importStar(require("vscode"));
class SettingItem extends vscode.TreeItem {
    label;
    key;
    value;
    descriptionStr;
    type;
    enumValues;
    constructor(label, key, value, descriptionStr, type, enumValues) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.label = label;
        this.key = key;
        this.value = value;
        this.descriptionStr = descriptionStr;
        this.type = type;
        this.enumValues = enumValues;
        this.tooltip = this.descriptionStr;
        this.description = String(value);
        // Add icon based on type or key
        if (key.includes('backend') || key.includes('url')) {
            this.iconPath = new vscode.ThemeIcon('server');
        }
        else if (key.includes('model')) {
            this.iconPath = new vscode.ThemeIcon('hubot');
        }
        else if (key.includes('Language')) {
            this.iconPath = new vscode.ThemeIcon('code');
        }
        else {
            this.iconPath = new vscode.ThemeIcon('gear');
        }
        this.command = {
            command: 'aci.editSetting',
            title: 'Edit Setting',
            arguments: [this]
        };
    }
}
exports.SettingItem = SettingItem;
class AciSettingsProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
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
exports.AciSettingsProvider = AciSettingsProvider;
async function editSettingCommand(item, provider) {
    let newValue = undefined;
    if (item.type === 'enum' && item.enumValues) {
        const selected = await vscode.window.showQuickPick(item.enumValues, {
            placeHolder: `Select value for ${item.label}`,
            title: `Edit ${item.label}`
        });
        if (selected) {
            newValue = selected;
        }
    }
    else if (item.type === 'string') {
        const input = await vscode.window.showInputBox({
            prompt: `Enter new value for ${item.label}`,
            value: String(item.value),
            title: `Edit ${item.label}`
        });
        if (input !== undefined) {
            newValue = input;
        }
    }
    else if (item.type === 'number') {
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
//# sourceMappingURL=AciSettingsProvider.js.map