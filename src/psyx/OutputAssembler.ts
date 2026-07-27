import { PsyxBlock } from './PsyxParser';

export interface CompiledBlock {
  psyxName: string;
  psyxKind: string;
  code: string;
}

export function getCommentSyntax(ext: string): { start: string, end: string } {
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

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractImports(code: string): { imports: string[], remainingCode: string } {
  const lines = code.split('\n');
  const imports: string[] = [];
  const remaining: string[] = [];
  let readingImports = true;

  for (const line of lines) {
    if (readingImports) {
      const t = line.trim();
      if (!t) {
        // skip empty lines at the top, or keep them if you want, but we ignore them
        continue;
      }
      if (t.startsWith('import ') || t.startsWith('from ') || t.startsWith('#include ') || t.startsWith('using ') || t.startsWith('require(')) {
        imports.push(line);
      } else {
        readingImports = false;
        remaining.push(line);
      }
    } else {
      remaining.push(line);
    }
  }

  return { imports, remainingCode: remaining.join('\n').trim() };
}

export function serializeOutput(blocks: CompiledBlock[], ext: string): string {
  const c = getCommentSyntax(ext);
  return blocks
    .map(b => `${c.start}ACI-BLOCK: ${b.psyxKind}:${b.psyxName}${c.end}\n${b.code.trimEnd()}\n${c.start}ACI-BLOCK-END${c.end}`)
    .join('\n\n') + '\n';
}

export function deserializeOutput(source: string, ext: string): CompiledBlock[] {
  const c = getCommentSyntax(ext);
  const start = escapeRegex(c.start);
  const end = escapeRegex(c.end);
  
  // Format: {start}ACI-BLOCK: {kind}:{name}{end}\n{code}\n{start}ACI-BLOCK-END{end}
  const regexStr = `${start}ACI-BLOCK:\\s*([^\\s:]+):([^\\n]+?)${end}\\n([\\s\\S]*?)\\n${start}ACI-BLOCK-END${end}`;
  const regex = new RegExp(regexStr, 'g');

  const blocks: CompiledBlock[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    blocks.push({
      psyxKind: match[1],
      psyxName: match[2].trim(),
      code: match[3].trimEnd()
    });
  }
  return blocks;
}

export function mergeBlocks(existing: CompiledBlock[], incoming: PsyxBlock[], freshCode: Map<string, string>): CompiledBlock[] {
  const finalBlocks = [...existing];

  for (const block of incoming) {
    const key = block.kind + ':' + block.name;
    const existingIndex = finalBlocks.findIndex(b => b.psyxKind + ':' + b.psyxName === key);
    
    let code = freshCode.get(key);
    if (code === undefined) {
      if (existingIndex !== -1) {
        code = finalBlocks[existingIndex].code;
      } else {
        code = '';
      }
    }

    const newCompiledBlock = { psyxName: block.name, psyxKind: block.kind, code };

    if (block.position) {
      if (existingIndex !== -1) {
        finalBlocks.splice(existingIndex, 1);
      }
      
      const target1Index = finalBlocks.findIndex(b => b.psyxName === block.position!.target1);
      if (target1Index !== -1) {
        if (block.position.type === 'after' || block.position.type === 'between') {
          finalBlocks.splice(target1Index + 1, 0, newCompiledBlock);
        } else if (block.position.type === 'before') {
          finalBlocks.splice(target1Index, 0, newCompiledBlock);
        }
      } else {
        finalBlocks.push(newCompiledBlock);
      }
    } else {
      if (existingIndex !== -1) {
        finalBlocks[existingIndex] = newCompiledBlock;
      } else {
        if (block.kind === 'preamble') {
          finalBlocks.unshift(newCompiledBlock);
        } else {
          finalBlocks.push(newCompiledBlock);
        }
      }
    }
  }

  return finalBlocks;
}
