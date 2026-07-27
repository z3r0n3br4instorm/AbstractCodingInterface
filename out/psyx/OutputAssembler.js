"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCommentSyntax = getCommentSyntax;
exports.extractImports = extractImports;
exports.serializeOutput = serializeOutput;
exports.deserializeOutput = deserializeOutput;
exports.mergeBlocks = mergeBlocks;
function getCommentSyntax(ext) {
    switch (ext.toLowerCase()) {
        case 'py':
        case 'rb':
        case 'sh':
        case 'yaml':
        case 'yml':
        case 'pl':
            return { start: '# ', end: '' };
        case 'html':
        case 'xml':
            return { start: '<!-- ', end: ' -->' };
        case 'css':
            return { start: '/* ', end: ' */' };
        case 'sql':
        case 'lua':
        case 'hs':
            return { start: '-- ', end: '' };
        case 'bat':
        case 'cmd':
            return { start: 'REM ', end: '' };
        default:
            // js, ts, go, rs, java, c, cpp, php, cs, swift, etc.
            return { start: '// ', end: '' };
    }
}
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const IMPORT_PATTERNS = {
    c: /^\s*#\s*include\s*[<"]/i,
    cpp: /^\s*#\s*include\s*[<"]/i,
    python: /^\s*(import\s|from\s.+\simport\s)/i,
    javascript: /^\s*(import\s|const\s.+=\s*require\()/i,
    typescript: /^\s*(import\s|const\s.+=\s*require\()/i,
    java: /^\s*import\s/i,
    go: /^\s*import\s/i,
    rust: /^\s*use\s/i,
    ruby: /^\s*require\s/i,
    php: /^\s*(require|include)(_once)?\s/i,
};
function extractImports(code, lang) {
    const lines = code.split('\n');
    const imports = [];
    const remaining = [];
    // Default to a generous catch-all if language isn't explicitly matched
    const pattern = IMPORT_PATTERNS[lang.toLowerCase()] || /^\s*(import\s|from\s|#\s*include\s|using\s|require\s*\()/i;
    for (const line of lines) {
        if (pattern.test(line)) {
            imports.push(line);
        }
        else {
            remaining.push(line);
        }
    }
    return { imports, remainingCode: remaining.join('\n').trim() };
}
function serializeOutput(blocks, ext) {
    const c = getCommentSyntax(ext);
    return blocks
        .map(b => {
        const hashPart = b.hash ? ` [hash:${b.hash}]` : '';
        return `${c.start}ACI-BLOCK: ${b.psyxKind}:${b.psyxName}${hashPart}${c.end}\n${b.code.trimEnd()}\n${c.start}ACI-BLOCK-END${c.end}`;
    })
        .join('\n\n') + '\n';
}
function deserializeOutput(source, ext) {
    const c = getCommentSyntax(ext);
    const start = escapeRegex(c.start);
    const end = escapeRegex(c.end);
    // Format: {start}ACI-BLOCK: {kind}:{name} [hash:{hash}]{end}\n{code}\n{start}ACI-BLOCK-END{end}
    const regexStr = `${start}ACI-BLOCK:\\s*([^\\s:]+):([^\\s]+)(?:\\s+\\[hash:([a-f0-9]+)\\])?${end}\\n([\\s\\S]*?)\\n${start}ACI-BLOCK-END${end}`;
    const regex = new RegExp(regexStr, 'g');
    const blocks = [];
    let match;
    while ((match = regex.exec(source)) !== null) {
        blocks.push({
            psyxKind: match[1],
            psyxName: match[2].trim(),
            hash: match[3],
            code: match[4].trimEnd()
        });
    }
    return blocks;
}
function mergeBlocks(existing, incoming, freshCode) {
    const finalBlocks = [...existing];
    for (const block of incoming) {
        const key = block.kind + ':' + block.name;
        const existingIndex = finalBlocks.findIndex(b => b.psyxKind + ':' + b.psyxName === key);
        let code = freshCode.get(key);
        if (code === undefined) {
            if (existingIndex !== -1) {
                code = finalBlocks[existingIndex].code;
            }
            else {
                code = '';
            }
        }
        const newCompiledBlock = { psyxName: block.name, psyxKind: block.kind, code, hash: block.hash };
        if (block.position) {
            if (existingIndex !== -1) {
                finalBlocks.splice(existingIndex, 1);
            }
            const target1Index = finalBlocks.findIndex(b => b.psyxName === block.position.target1);
            if (target1Index !== -1) {
                if (block.position.type === 'after' || block.position.type === 'between') {
                    finalBlocks.splice(target1Index + 1, 0, newCompiledBlock);
                }
                else if (block.position.type === 'before') {
                    finalBlocks.splice(target1Index, 0, newCompiledBlock);
                }
            }
            else {
                finalBlocks.push(newCompiledBlock);
            }
        }
        else {
            if (existingIndex !== -1) {
                finalBlocks[existingIndex] = newCompiledBlock;
            }
            else {
                if (block.kind === 'preamble') {
                    finalBlocks.unshift(newCompiledBlock);
                }
                else {
                    finalBlocks.push(newCompiledBlock);
                }
            }
        }
    }
    return finalBlocks;
}
//# sourceMappingURL=OutputAssembler.js.map