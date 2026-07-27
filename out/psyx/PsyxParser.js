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
exports.parsePsyx = parsePsyx;
exports.blocksChanged = blocksChanged;
const crypto = __importStar(require("crypto"));
const FUNC_START = /^FUNC-START\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:[\s\(].*)?$/;
const FUNC_MAIN = /^FUNC-MAIN$/;
const FUNC_END = /^FUNC-END$/;
const CLASS_START = /^CLASS-START\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:[\s\(].*)?$/;
const CLASS_END = /^CLASS-END$/;
const IMPORT_START = /^IMPORT-BLK-START$/;
const IMPORT_END = /^IMPORT-BLK-END$/;
const AFTER_BLOCK = /^AFTER-BLOCK-([a-zA-Z_][a-zA-Z0-9_]*)$/;
const BEFORE_BLOCK = /^BEFORE-BLOCK-([a-zA-Z_][a-zA-Z0-9_]*)$/;
const BETWEEN_BLOCKS = /^BETWEEN-BLOCKS-([a-zA-Z_][a-zA-Z0-9_]*)-([a-zA-Z_][a-zA-Z0-9_]*)$/;
function parsePsyx(source) {
    const lines = source.split('\n');
    const blocks = [];
    let i = 0;
    let blockIndex = 0;
    const preambleLines = [];
    let currentPosition = undefined;
    while (i < lines.length) {
        const line = lines[i].trim();
        const afterMatch = line.match(AFTER_BLOCK);
        if (line.startsWith('AFTER-BLOCK-') && !afterMatch) {
            throw new Error(`Syntax Error on line ${i + 1}: '${line}'. Expected 'AFTER-BLOCK-<target>' where <target> is a single word.`);
        }
        if (afterMatch) {
            currentPosition = { type: 'after', target1: afterMatch[1] };
            i++;
            continue;
        }
        const beforeMatch = line.match(BEFORE_BLOCK);
        if (line.startsWith('BEFORE-BLOCK-') && !beforeMatch) {
            throw new Error(`Syntax Error on line ${i + 1}: '${line}'. Expected 'BEFORE-BLOCK-<target>' where <target> is a single word.`);
        }
        if (beforeMatch) {
            currentPosition = { type: 'before', target1: beforeMatch[1] };
            i++;
            continue;
        }
        const betweenMatch = line.match(BETWEEN_BLOCKS);
        if (line.startsWith('BETWEEN-BLOCKS-') && !betweenMatch) {
            throw new Error(`Syntax Error on line ${i + 1}: '${line}'. Expected 'BETWEEN-BLOCKS-<target1>-<target2>' where targets are single words.`);
        }
        if (betweenMatch) {
            currentPosition = { type: 'between', target1: betweenMatch[1], target2: betweenMatch[2] };
            i++;
            continue;
        }
        const funcMatch = line.match(FUNC_START);
        const funcMainMatch = line.match(FUNC_MAIN);
        const classMatch = line.match(CLASS_START);
        const importMatch = line.match(IMPORT_START);
        if (line.startsWith('FUNC-START') && !funcMatch) {
            throw new Error(`Syntax Error on line ${i + 1}: '${line}'. Expected 'FUNC-START <name>' where <name> is a valid identifier. You can optionally include arguments after the name.`);
        }
        if (line.startsWith('CLASS-START') && !classMatch) {
            throw new Error(`Syntax Error on line ${i + 1}: '${line}'. Expected 'CLASS-START <name>' where <name> is a valid identifier. You can optionally include inheritance after the name.`);
        }
        if (line.startsWith('FUNC-MAIN') && !funcMainMatch) {
            throw new Error(`Syntax Error on line ${i + 1}: '${line}'. Expected exactly 'FUNC-MAIN'.`);
        }
        if (line.startsWith('IMPORT-BLK-START') && !importMatch) {
            throw new Error(`Syntax Error on line ${i + 1}: '${line}'. Expected exactly 'IMPORT-BLK-START'.`);
        }
        if (line.startsWith('FUNC-END') && !line.match(FUNC_END)) {
            throw new Error(`Syntax Error on line ${i + 1}: '${line}'. Expected exactly 'FUNC-END'.`);
        }
        if (line.startsWith('CLASS-END') && !line.match(CLASS_END)) {
            throw new Error(`Syntax Error on line ${i + 1}: '${line}'. Expected exactly 'CLASS-END'.`);
        }
        if (line.startsWith('IMPORT-BLK-END') && !line.match(IMPORT_END)) {
            throw new Error(`Syntax Error on line ${i + 1}: '${line}'. Expected exactly 'IMPORT-BLK-END'.`);
        }
        if (funcMatch || funcMainMatch || classMatch || importMatch) {
            if (preambleLines.length > 0 && preambleLines.some(l => l.trim() !== '')) {
                const body = preambleLines.join('\n').trim();
                const hash = crypto.createHash('md5').update(body).digest('hex').substring(0, 8);
                blocks.push({ kind: 'preamble', name: '__preamble__', body, index: blockIndex++, hash, signature: '' });
                preambleLines.length = 0;
            }
            let kind = 'class';
            if (funcMatch)
                kind = 'func';
            if (funcMainMatch)
                kind = 'func-main';
            if (importMatch)
                kind = 'import';
            const name = importMatch ? '__imports__' : (funcMainMatch ? 'main' : (funcMatch ?? classMatch)[1]);
            let signature = '';
            if (funcMatch || classMatch) {
                signature = line.replace(/^(FUNC-START|CLASS-START)\s+/, '').trim();
            }
            else if (funcMainMatch) {
                signature = 'main()';
            }
            const endRe = importMatch ? IMPORT_END : ((funcMatch || funcMainMatch) ? FUNC_END : CLASS_END);
            const bodyLines = [lines[i]];
            i++;
            while (i < lines.length) {
                bodyLines.push(lines[i]);
                if (endRe.test(lines[i].trim())) {
                    i++;
                    break;
                }
                i++;
            }
            const body = bodyLines.join('\n').trim();
            const hash = crypto.createHash('md5').update(body).digest('hex').substring(0, 8);
            blocks.push({ kind, name, body, index: blockIndex++, position: currentPosition, hash, signature });
            currentPosition = undefined;
        }
        else {
            preambleLines.push(lines[i]);
            i++;
        }
    }
    if (preambleLines.some(l => l.trim() !== '')) {
        const body = preambleLines.join('\n').trim();
        const hash = crypto.createHash('md5').update(body).digest('hex').substring(0, 8);
        blocks.push({ kind: 'preamble', name: '__preamble__', body, index: blockIndex++, hash, signature: '' });
    }
    // Validate CALL statements
    const definedNames = new Set(blocks.filter(b => b.kind === 'func' || b.kind === 'class').map(b => b.name));
    for (const block of blocks) {
        const blockLines = block.body.split('\n');
        for (let j = 0; j < blockLines.length; j++) {
            const match = blockLines[j].match(/\bCALL\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
            if (match) {
                const target = match[1];
                if (!definedNames.has(target)) {
                    throw new Error(`Syntax Error: Unknown CALL target '${target}'. It does not match any defined FUNC-START or CLASS-START block in this file.`);
                }
            }
        }
    }
    return blocks;
}
function blocksChanged(prev, next) {
    const prevMap = new Map(prev.map(b => [b.kind + ':' + b.name, b.body]));
    return next.filter(b => prevMap.get(b.kind + ':' + b.name) !== b.body);
}
//# sourceMappingURL=PsyxParser.js.map