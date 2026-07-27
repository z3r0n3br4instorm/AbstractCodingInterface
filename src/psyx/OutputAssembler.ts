import { PsyxBlock } from './PsyxParser';

export interface CompiledBlock {
  psyxName: string;
  psyxKind: string;
  code: string;
}

const BLOCK_MARKER_RE = /\/\/ ACI-BLOCK: ([^\s:]+):([^\n]+)\n([\s\S]*?)\/\/ ACI-BLOCK-END/g;

export function serializeOutput(blocks: CompiledBlock[]): string {
  return blocks
    .map(b => `// ACI-BLOCK: ${b.psyxKind}:${b.psyxName}\n${b.code.trimEnd()}\n// ACI-BLOCK-END`)
    .join('\n\n') + '\n';
}

export function deserializeOutput(source: string): CompiledBlock[] {
  const blocks: CompiledBlock[] = [];
  let match: RegExpExecArray | null;
  BLOCK_MARKER_RE.lastIndex = 0;
  while ((match = BLOCK_MARKER_RE.exec(source)) !== null) {
    blocks.push({
      psyxKind: match[1],
      psyxName: match[2],
      code: match[3].trimEnd()
    });
  }
  return blocks;
}

export function mergeBlocks(existing: CompiledBlock[], incoming: PsyxBlock[], freshCode: Map<string, string>): CompiledBlock[] {
  const existingMap = new Map(existing.map(b => [b.psyxKind + ':' + b.psyxName, b]));
  return incoming.map(block => {
    const key = block.kind + ':' + block.name;
    const fresh = freshCode.get(key);
    if (fresh !== undefined) {
      return { psyxName: block.name, psyxKind: block.kind, code: fresh };
    }
    const prev = existingMap.get(key);
    if (prev) {
      return prev;
    }
    return { psyxName: block.name, psyxKind: block.kind, code: '' };
  });
}
