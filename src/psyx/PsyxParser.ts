export type PsyxBlockKind = 'func' | 'func-main' | 'class' | 'preamble';

export interface PsyxBlock {
  kind: PsyxBlockKind;
  name: string;
  body: string;
  index: number;
  position?: {
    type: 'after' | 'before' | 'between';
    target1: string;
    target2?: string;
  };
}

const FUNC_START = /^FUNC-START\s+(\S+)/;
const FUNC_MAIN = /^FUNC-MAIN/;
const FUNC_END = /^FUNC-END/;
const CLASS_START = /^CLASS-START\s+(\S+)/;
const CLASS_END = /^CLASS-END/;
const AFTER_BLOCK = /^AFTER-BLOCK-(\S+)/;
const BEFORE_BLOCK = /^BEFORE-BLOCK-(\S+)/;
const BETWEEN_BLOCKS = /^BETWEEN-BLOCKS-(\S+)-(\S+)/;

export function parsePsyx(source: string): PsyxBlock[] {
  const lines = source.split('\n');
  const blocks: PsyxBlock[] = [];
  let i = 0;
  let blockIndex = 0;
  const preambleLines: string[] = [];
  let currentPosition: PsyxBlock['position'] = undefined;

  while (i < lines.length) {
    const line = lines[i].trim();

    const afterMatch = line.match(AFTER_BLOCK);
    if (afterMatch) {
      currentPosition = { type: 'after', target1: afterMatch[1] };
      i++;
      continue;
    }
    const beforeMatch = line.match(BEFORE_BLOCK);
    if (beforeMatch) {
      currentPosition = { type: 'before', target1: beforeMatch[1] };
      i++;
      continue;
    }
    const betweenMatch = line.match(BETWEEN_BLOCKS);
    if (betweenMatch) {
      currentPosition = { type: 'between', target1: betweenMatch[1], target2: betweenMatch[2] };
      i++;
      continue;
    }

    const funcMatch = line.match(FUNC_START);
    const funcMainMatch = line.match(FUNC_MAIN);
    const classMatch = line.match(CLASS_START);

    if (funcMatch || funcMainMatch || classMatch) {
      if (preambleLines.length > 0 && preambleLines.some(l => l.trim() !== '')) {
        blocks.push({ kind: 'preamble', name: '__preamble__', body: preambleLines.join('\n').trim(), index: blockIndex++ });
        preambleLines.length = 0;
      }

      const kind: PsyxBlockKind = funcMainMatch ? 'func-main' : (funcMatch ? 'func' : 'class');
      const name = funcMainMatch ? 'main' : (funcMatch ?? classMatch)![1];
      const endRe = (funcMatch || funcMainMatch) ? FUNC_END : CLASS_END;
      const bodyLines: string[] = [lines[i]];
      i++;

      while (i < lines.length) {
        bodyLines.push(lines[i]);
        if (endRe.test(lines[i].trim())) {
          i++;
          break;
        }
        i++;
      }

      blocks.push({ kind, name, body: bodyLines.join('\n').trim(), index: blockIndex++, position: currentPosition });
      currentPosition = undefined;
    } else {
      preambleLines.push(lines[i]);
      i++;
    }
  }

  if (preambleLines.some(l => l.trim() !== '')) {
    blocks.push({ kind: 'preamble', name: '__preamble__', body: preambleLines.join('\n').trim(), index: blockIndex++ });
  }

  return blocks;
}

export function blocksChanged(prev: PsyxBlock[], next: PsyxBlock[]): PsyxBlock[] {
  const prevMap = new Map(prev.map(b => [b.kind + ':' + b.name, b.body]));
  return next.filter(b => prevMap.get(b.kind + ':' + b.name) !== b.body);
}
