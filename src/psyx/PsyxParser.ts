export type PsyxBlockKind = 'func' | 'func-main' | 'class' | 'preamble' | 'import';

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
        blocks.push({ kind: 'preamble', name: '__preamble__', body: preambleLines.join('\n').trim(), index: blockIndex++ });
        preambleLines.length = 0;
      }

      let kind: PsyxBlockKind = 'class';
      if (funcMatch) kind = 'func';
      if (funcMainMatch) kind = 'func-main';
      if (importMatch) kind = 'import';
      
      const name = importMatch ? '__imports__' : (funcMainMatch ? 'main' : (funcMatch ?? classMatch)![1]);
      const endRe = importMatch ? IMPORT_END : ((funcMatch || funcMainMatch) ? FUNC_END : CLASS_END);
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
