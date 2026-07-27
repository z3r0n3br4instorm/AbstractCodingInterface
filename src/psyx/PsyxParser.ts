export type PsyxBlockKind = 'func' | 'class' | 'preamble';

export interface PsyxBlock {
  kind: PsyxBlockKind;
  name: string;
  body: string;
  index: number;
}

const FUNC_START = /^FUNC-START\s+(\S+)/;
const FUNC_END = /^FUNC-END/;
const CLASS_START = /^CLASS-START\s+(\S+)/;
const CLASS_END = /^CLASS-END/;

export function parsePsyx(source: string): PsyxBlock[] {
  const lines = source.split('\n');
  const blocks: PsyxBlock[] = [];
  let i = 0;
  let blockIndex = 0;
  const preambleLines: string[] = [];

  while (i < lines.length) {
    const line = lines[i].trim();

    const funcMatch = line.match(FUNC_START);
    const classMatch = line.match(CLASS_START);

    if (funcMatch || classMatch) {
      if (preambleLines.length > 0 && preambleLines.some(l => l.trim() !== '')) {
        blocks.push({ kind: 'preamble', name: '__preamble__', body: preambleLines.join('\n').trim(), index: blockIndex++ });
        preambleLines.length = 0;
      }

      const kind: PsyxBlockKind = funcMatch ? 'func' : 'class';
      const name = (funcMatch ?? classMatch)![1];
      const endRe = funcMatch ? FUNC_END : CLASS_END;
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

      blocks.push({ kind, name, body: bodyLines.join('\n').trim(), index: blockIndex++ });
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
