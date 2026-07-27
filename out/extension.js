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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const CompileOrchestrator_1 = require("./core/CompileOrchestrator");
const AciSettingsProvider_1 = require("./providers/AciSettingsProvider");
function activate(context) {
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    context.subscriptions.push(statusBar);
    const orchestrator = new CompileOrchestrator_1.CompileOrchestrator(statusBar);
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => orchestrator.handleSave(doc)));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => orchestrator.handleType(e)));
    context.subscriptions.push(vscode.commands.registerCommand('aci.compile', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            orchestrator.compile(editor.document);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('aci.makePsyxCompatible', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            orchestrator.makePsyxCompatible(editor.document);
        }
        else {
            vscode.window.showWarningMessage('ACI: No active editor window focused.');
        }
    }));
    const settingsProvider = new AciSettingsProvider_1.AciSettingsProvider();
    context.subscriptions.push(vscode.window.registerTreeDataProvider('aci-settings', settingsProvider));
    context.subscriptions.push(vscode.commands.registerCommand('aci.editSetting', (item) => (0, AciSettingsProvider_1.editSettingCommand)(item, settingsProvider)));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('aci')) {
            settingsProvider.refresh();
        }
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map