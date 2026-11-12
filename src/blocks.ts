import { uid } from './tree'

export type BlockType = 'p' | 'h1' | 'h2' | 'h3' | 'bullet' | 'number' | 'todo' | 'quote' | 'code' | 'divider'

export interface Block {
  id: string
  type: BlockType
  text: string
  checked?: boolean
}

export function newBlock(type: BlockType = 'p', text = '', checked?: boolean): Block {
  return { id: uid(), type, text, ...(type === 'todo' ? { checked: !!checked } : {}) }
}

/** Đọc một dòng văn bản thuần / markdown đơn giản thành một khối. */
export function parseLine(line: string): Block {
  let m: RegExpMatchArray | null
  if ((m = line.match(/^(#{1,3}) (.*)$/))) return newBlock(`h${m[1].length}` as BlockType, m[2])
  if ((m = line.match(/^(?:[-*] )?\[( |x)?\] (.*)$/i))) return newBlock('todo', m[2], m[1]?.toLowerCase() === 'x')
  if ((m = line.match(/^[-*•] (.*)$/))) return newBlock('bullet', m[1])
  if ((m = line.match(/^\d+[.)] (.*)$/))) return newBlock('number', m[1])
  if ((m = line.match(/^> (.*)$/))) return newBlock('quote', m[1])
  if (/^---+$/.test(line.trim())) return newBlock('divider')
  return newBlock('p', line)
}

export function textToBlocks(text: string): Block[] {
  const blocks = text
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map(parseLine)
  return blocks.length ? blocks : [newBlock()]
}
