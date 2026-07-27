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
exports.CompileOrchestrator = void 0;
const vscode = __importStar(require("vscode"));
const BackendFactory_1 = require("../backends/BackendFactory");
const Configuration_1 = require("../config/Configuration");
const PsyxParser_1 = require("../psyx/PsyxParser");
const OutputAssembler_1 = require("../psyx/OutputAssembler");
const LANG_EXTS = {
    python: 'py', javascript: 'js', typescript: 'ts',
    go: 'go', rust: 'rs', java: 'java',
    cpp: 'cpp', c: 'c', html: 'html',
    css: 'css', ruby: 'rb', php: 'php'
};
function stripThinking(text) {
    return text
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .replace(/<think>[\s\S]*$/, '');
}
function extractCode(text) {
    const closed = text.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
    if (closed)
        return closed[1];
    const open = text.match(/```[a-zA-Z]*\n([\s\S]*)/);
    if (open)
        return open[1];
    return text;
}
function buildSystemPrompt(targetLang) {
    return `You are a PSyx compiler. Translate the following PSyx pseudocode block into ${targetLang} code.
Output ONLY the raw ${targetLang} code — no markdown fences, no explanations, no comments, no <think> blocks.
Preserve correct indentation and style for ${targetLang}.`;
}
class CompileOrchestrator {
    compiling = new Set();
    typingTimeout = null;
    statusBar;
    constructor(statusBar) {
        this.statusBar = statusBar;
    }
    async handleSave(document) {
        if (Configuration_1.Configuration.compileTrigger !== 'onSave' || document.languageId !== 'aci') {
            return;
        }
        await this.compile(document);
    }
    handleType(event) {
        if (Configuration_1.Configuration.compileTrigger !== 'onType' || event.document.languageId !== 'aci') {
            return;
        }
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }
        this.typingTimeout = setTimeout(() => {
            this.compile(event.document);
        }, Configuration_1.Configuration.onTypeDebounceMs);
    }
    targetUri(document) {
        const lang = Configuration_1.Configuration.targetLanguage;
        const ext = LANG_EXTS[lang.toLowerCase()] || lang;
        let p = document.uri.path;
        p = p.endsWith('.aci') ? p.slice(0, -4) + '.' + ext : p + '.' + ext;
        return document.uri.with({ path: p });
    }
    async compile(document) {
        const uriString = document.uri.toString();
        if (this.compiling.has(uriString)) {
            return;
        }
        this.compiling.add(uriString);
        const targetLang = Configuration_1.Configuration.targetLanguage;
        const targetUri = this.targetUri(document);
        try {
            const newBlocks = (0, PsyxParser_1.parsePsyx)(document.getText());
            let existingText = null;
            let existingCompiledBlocks = [];
            let existingPsyxBlocks = [];
            let targetDoc = null;
            try {
                targetDoc = await vscode.workspace.openTextDocument(targetUri);
                existingText = targetDoc.getText();
                existingCompiledBlocks = (0, OutputAssembler_1.deserializeOutput)(existingText);
            }
            catch {
                existingText = null;
            }
            const blocksToCompile = existingText
                ? (0, PsyxParser_1.blocksChanged)(existingPsyxBlocks, newBlocks)
                : newBlocks;
            if (!existingText) {
                const we = new vscode.WorkspaceEdit();
                we.createFile(targetUri, { overwrite: true });
                await vscode.workspace.applyEdit(we);
                targetDoc = await vscode.workspace.openTextDocument(targetUri);
            }
            const editor = await vscode.window.showTextDocument(targetDoc, {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: true
            });
            if (blocksToCompile.length === 0) {
                return;
            }
            const backend = BackendFactory_1.BackendFactory.getBackend();
            const freshCode = new Map();
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
                        const assembled = (0, OutputAssembler_1.mergeBlocks)(existingCompiledBlocks, newBlocks, freshCode);
                        const newText = (0, OutputAssembler_1.serializeOutput)(assembled);
                        await editor.edit(eb => {
                            const last = targetDoc.lineCount - 1;
                            const lastChar = targetDoc.lineAt(last).text.length;
                            eb.replace(new vscode.Range(0, 0, last, lastChar), newText);
                        }, { undoStopBefore: false, undoStopAfter: false });
                        lastUpdate = now;
                    }
                }
                freshCode.set(key, extractCode(stripThinking(blockBuffer)));
            }
            const finalAssembled = (0, OutputAssembler_1.mergeBlocks)(existingCompiledBlocks, newBlocks, freshCode);
            const finalText = (0, OutputAssembler_1.serializeOutput)(finalAssembled);
            await editor.edit(eb => {
                const last = targetDoc.lineCount - 1;
                const lastChar = targetDoc.lineAt(last).text.length;
                eb.replace(new vscode.Range(0, 0, last, lastChar), finalText);
            }, { undoStopBefore: false, undoStopAfter: true });
            await targetDoc.save();
        }
        catch (e) {
            vscode.window.showErrorMessage(`ACI Compile Error: ${e instanceof Error ? e.message : String(e)}`);
        }
        finally {
            this.compiling.delete(uriString);
            this.statusBar.hide();
        }
    }
}
exports.CompileOrchestrator = CompileOrchestrator;
//# sourceMappingURL=CompileOrchestrator.js.map