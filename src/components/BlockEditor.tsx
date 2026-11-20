import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { newBlock, parseLine, type Block, type BlockType } from '../blocks'

interface Item {
  type: BlockType
  icon: string
  label: string
  keys: string
}

const ITEMS: Item[] = [
  { type: 'p', icon: '¶', label: 'Văn bản', keys: 'text paragraph' },
  { type: 'h1', icon: 'H1', label: 'Tiêu đề 1', keys: 'heading h1' },
  { type: 'h2', icon: 'H2', label: 'Tiêu đề 2', keys: 'heading h2' },
  { type: 'h3', icon: 'H3', label: 'Tiêu đề 3', keys: 'heading h3' },
  { type: 'bullet', icon: '•', label: 'Danh sách', keys: 'bullet list' },
  { type: 'number', icon: '1.', label: 'Danh sách số', keys: 'numbered list' },
  { type: 'todo', icon: '☑', label: 'Việc cần làm', keys: 'todo checkbox' },
  { type: 'quote', icon: '❝', label: 'Trích dẫn', keys: 'quote' },
  { type: 'code', icon: '</>', label: 'Code', keys: 'code' },
  { type: 'divider', icon: '—', label: 'Đường kẻ', keys: 'divider hr line' },
]

const PLACEHOLDER: Partial<Record<BlockType, string>> = {
  p: "Gõ '/' để chọn kiểu khối…",
  h1: 'Tiêu đề 1',
  h2: 'Tiêu đề 2',
  h3: 'Tiêu đề 3',
  bullet: 'Danh sách',
  number: 'Danh sách',
  todo: 'Việc cần làm',
  quote: 'Trích dẫn',
  code: 'Code',
}

const SHORTCUT: Record<string, BlockType> = {
  '#': 'h1',
  '##': 'h2',
  '###': 'h3',
  '-': 'bullet',
  '*': 'bullet',
  '1.': 'number',
  '1)': 'number',
  '[]': 'todo',
  '[ ]': 'todo',
  '>': 'quote',
}

const CONTINUES: BlockType[] = ['bullet', 'number', 'todo']

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

const read = (el: HTMLElement) => {
  const t = el.textContent ?? ''
  return t === '\n' ? '' : t
}

function caretOffset(el: HTMLElement): number {
  const s = getSelection()
  if (!s || !s.rangeCount) return 0
  const r = s.getRangeAt(0)
  if (!el.contains(r.startContainer)) return 0
  const pre = r.cloneRange()
  pre.selectNodeContents(el)
  pre.setEnd(r.startContainer, r.startOffset)
  return pre.toString().length
}

function setCaret(el: HTMLElement, offset: number) {
  const s = getSelection()
  if (!s) return
  const r = document.createRange()
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let rem = offset
  let placed = false
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const len = n.textContent?.length ?? 0
    if (rem <= len) {
      r.setStart(n, rem)
      placed = true
      break
    }
    rem -= len
  }
  if (!placed) {
    r.selectNodeContents(el)
    r.collapse(false)
  } else {
    r.collapse(true)
  }
  s.removeAllRanges()
  s.addRange(r)
}

/** Con trỏ đang ở dòng hiển thị đầu / cuối của khối? */
function caretLine(el: HTMLElement): { first: boolean; last: boolean } {
  const s = getSelection()
  const rect = s && s.rangeCount ? s.getRangeAt(0).getClientRects()[0] : undefined
  if (!rect) return { first: true, last: true }
  const box = el.getBoundingClientRect()
  return { first: rect.top - box.top < rect.height, last: box.bottom - rect.bottom < rect.height }
}

interface Props {
  blocks: Block[]
  onChange: (blocks: Block[]) => void
}

type Menu = { id: string; kind: 'slash' | 'handle'; index: number }

export default function BlockEditor({ blocks, onChange }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const pending = useRef<{ id: string; offset: number | 'end' } | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  // Đặt lại con trỏ sau mỗi lần cấu trúc khối thay đổi.
  useLayoutEffect(() => {
    const p = pending.current
    if (!p) return
    pending.current = null
    const el = root.current?.querySelector<HTMLElement>(`[data-bid="${p.id}"]`)
    if (!el) return
    el.focus()
    setCaret(el, p.offset === 'end' ? read(el).length : p.offset)
  })

  // Đóng menu của tay nắm khi bấm ra ngoài.
  useEffect(() => {
    if (menu?.kind !== 'handle') return
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.blk-menu, .blk-handle')) setMenu(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])

  const commit = (next: Block[], focus?: { id: string; offset: number | 'end' }) => {
    const safe = next.length ? next : [newBlock()]
    pending.current = focus ?? (next.length ? null : { id: safe[0].id, offset: 0 })
    onChange(safe)
  }
  const patch = (id: string, p: Partial<Block>) => blocks.map((b) => (b.id === id ? { ...b, ...p } : b))

  const slashItems = (text: string) => {
    const q = fold(text.slice(1))
    return ITEMS.filter((i) => fold(i.label + ' ' + i.keys).includes(q))
  }

  const setType = (id: string, type: BlockType, text: string) => {
    const i = blocks.findIndex((b) => b.id === id)
    if (i < 0) return
    if (type === 'divider') {
      const next = [...blocks]
      next[i] = { id, type: 'divider', text: '' }
      let after = next[i + 1]
      if (!after || after.type === 'divider') {
        after = newBlock()
        next.splice(i + 1, 0, after)
      }
      commit(next, { id: after.id, offset: 0 })
      return
    }
    const b = blocks[i]
    const nb: Block = { id, type, text }
    if (type === 'todo') nb.checked = !!b.checked
    commit(
      blocks.map((x) => (x.id === id ? nb : x)),
      { id, offset: 'end' },
    )
  }

  const pick = (m: Menu, item: Item) => {
    const b = blocks.find((x) => x.id === m.id)
    setMenu(null)
    if (!b) return
    if (m.kind === 'slash') return setType(b.id, item.type, '')
    if (item.type === 'divider') {
      const i = blocks.indexOf(b)
      const next = [...blocks]
      next.splice(i + 1, 0, newBlock('divider'))
      return commit(next)
    }
    if (b.type === 'divider') return setType(b.id, item.type, '')
    setType(b.id, item.type, b.text)
  }

  const removeBlock = (id: string) => {
    setMenu(null)
    commit(blocks.filter((b) => b.id !== id))
  }

  const onInput = (b: Block, el: HTMLElement) => {
    const text = read(el)
    if (text === '' && el.firstChild) el.textContent = ''

    if (b.type === 'p') {
      const off = caretOffset(el)
      const m = text.match(/^(#{1,3}|[-*]|1[.)]|\[ ?\]|>)[  ]/)
      if (m && off === m[0].length) return setTypeAt(b.id, SHORTCUT[m[1]], text.slice(m[0].length))
      if (text.startsWith('```') && off === 3) return setTypeAt(b.id, 'code', text.slice(3))
      if (text === '---') return setType(b.id, 'divider', '')
    }

    const isSlash = b.type !== 'code' && /^\/\S*$/.test(text)
    if (isSlash && dismissed !== b.id) setMenu({ id: b.id, kind: 'slash', index: 0 })
    else if (menu?.kind === 'slash' && menu.id === b.id) setMenu(null)
    if (!isSlash && dismissed === b.id) setDismissed(null)

    onChange(patch(b.id, { text }))
  }

  /** Đổi kiểu qua phím tắt markdown: giữ phần chữ còn lại, con trỏ về đầu khối. */
  const setTypeAt = (id: string, type: BlockType, text: string) => {
    const nb: Block = { id, type, text }
    if (type === 'todo') nb.checked = false
    commit(
      blocks.map((x) => (x.id === id ? nb : x)),
      { id, offset: 0 },
    )
  }

  const neighbor = (i: number, dir: -1 | 1): Block | undefined => {
    for (let j = i + dir; j >= 0 && j < blocks.length; j += dir) {
      if (blocks[j].type !== 'divider') return blocks[j]
    }
    return undefined
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, b: Block, i: number) => {
    if (e.nativeEvent.isComposing) return
    const el = e.currentTarget
    const text = read(el)

    if (menu?.kind === 'slash' && menu.id === b.id) {
      const items = slashItems(text)
      if (items.length) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          const d = e.key === 'ArrowDown' ? 1 : -1
          setMenu({ ...menu, index: (menu.index + d + items.length) % items.length })
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          pick(menu, items[Math.min(menu.index, items.length - 1)])
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMenu(null)
        setDismissed(b.id)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      if (b.type === 'code') {
        if (!(e.metaKey || e.ctrlKey)) return // xuống dòng trong khối code
        e.preventDefault()
        const nb = newBlock()
        const next = [...blocks]
        next.splice(i + 1, 0, nb)
        return commit(next, { id: nb.id, offset: 0 })
      }
      e.preventDefault()
      const off = caretOffset(el)
      if (text === '' && b.type !== 'p') return setTypeAt(b.id, 'p', '')
      if (off === 0 && text !== '') {
        const next = [...blocks]
        next.splice(i, 0, newBlock())
        return commit(next, { id: b.id, offset: 0 })
      }
      const nb = newBlock(CONTINUES.includes(b.type) ? b.type : 'p', text.slice(off))
      const next = patch(b.id, { text: text.slice(0, off) })
      next.splice(i + 1, 0, nb)
      return commit(next, { id: nb.id, offset: 0 })
    }

    if (e.key === 'Backspace' && getSelection()?.isCollapsed && caretOffset(el) === 0) {
      if (b.type !== 'p') {
        e.preventDefault()
        return setTypeAt(b.id, 'p', text)
      }
      const prev = blocks[i - 1]
      if (!prev) return
      e.preventDefault()
      if (prev.type === 'divider') {
        return commit(
          blocks.filter((x) => x.id !== prev.id),
          { id: b.id, offset: 0 },
        )
      }
      const next = patch(prev.id, { text: prev.text + text }).filter((x) => x.id !== b.id)
      return commit(next, { id: prev.id, offset: prev.text.length })
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (e.shiftKey) return
      const line = caretLine(el)
      const up = e.key === 'ArrowUp'
      if (up ? !line.first : !line.last) return
      const target = neighbor(i, up ? -1 : 1)
      if (!target) return
      e.preventDefault()
      const tel = root.current?.querySelector<HTMLElement>(`[data-bid="${target.id}"]`)
      if (tel) {
        tel.focus()
        setCaret(tel, up ? read(tel).length : 0)
      }
      return
    }

    if (e.key === 'Tab' && b.type === 'code') {
      e.preventDefault()
      document.execCommand('insertText', false, '  ')
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLDivElement>, b: Block, i: number) => {
    const data = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n')
    if (b.type === 'code' || !data.includes('\n')) return
    e.preventDefault()
    const el = e.currentTarget
    const text = read(el)
    const off = caretOffset(el)
    const lines = data.split('\n').filter((l) => l.trim() !== '')
    if (!lines.length) return
    const added = lines.slice(1).map(parseLine)
    let head: Block
    if (text === '') {
      head = { ...parseLine(lines[0]), id: b.id }
    } else {
      head = { ...b, text: text.slice(0, off) + lines[0] }
    }
    const tail = text.slice(off)
    let focus: { id: string; offset: number }
    if (added.length) {
      const last = added[added.length - 1]
      if (last.type === 'divider') {
        const nb = newBlock('p', tail)
        added.push(nb)
        focus = { id: nb.id, offset: 0 }
      } else {
        focus = { id: last.id, offset: last.text.length }
        last.text += tail
      }
    } else {
      focus = { id: head.id, offset: head.text.length }
      head.text += tail
    }
    const next = [...blocks]
    next.splice(i, 1, head, ...added)
    commit(next, focus)
  }

  const onDrop = () => {
    if (dragId !== null && dropAt !== null) {
      const from = blocks.findIndex((b) => b.id === dragId)
      if (from >= 0 && dropAt !== from && dropAt !== from + 1) {
        const next = [...blocks]
        const [moved] = next.splice(from, 1)
        next.splice(dropAt > from ? dropAt - 1 : dropAt, 0, moved)
        onChange(next)
      }
    }
    setDragId(null)
    setDropAt(null)
  }

  const clickTail = () => {
    const last = blocks[blocks.length - 1]
    if (last && last.type === 'p' && last.text === '') {
      pending.current = { id: last.id, offset: 0 }
      onChange(blocks)
      return
    }
    const nb = newBlock()
    commit([...blocks, nb], { id: nb.id, offset: 0 })
  }

  let num = 0
  return (
    <div
      ref={root}
      className="blk-editor"
      onDragOver={(e) => dragId && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
    >
      {blocks.map((b, i) => {
        num = b.type === 'number' ? num + 1 : 0
        const open = menu?.id === b.id ? menu : null
        const items = open ? (open.kind === 'slash' ? slashItems(b.text) : ITEMS) : []
        return (
          <div
            key={b.id}
            className={
              `blk blk-${b.type}` +
              (dragId === b.id ? ' dragging' : '') +
              (dropAt === i ? ' drop-before' : '') +
              (dropAt === blocks.length && i === blocks.length - 1 ? ' drop-after' : '')
            }
            onDragOver={(e) => {
              if (!dragId) return
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1)
            }}
          >
            <div className="blk-gutter" contentEditable={false}>
              <button
                className="blk-add"
                title="Thêm khối bên dưới"
                tabIndex={-1}
                onClick={() => {
                  const nb = newBlock()
                  const next = [...blocks]
                  next.splice(i + 1, 0, nb)
                  commit(next, { id: nb.id, offset: 0 })
                }}
              >
                +
              </button>
              <button
                className="blk-handle"
                title="Kéo để di chuyển · Bấm để mở menu"
                tabIndex={-1}
                draggable
                onDragStart={(e) => {
                  setMenu(null)
                  setDragId(b.id)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', '')
                  const row = e.currentTarget.closest('.blk')
                  if (row) e.dataTransfer.setDragImage(row, 0, 0)
                }}
                onDragEnd={() => {
                  setDragId(null)
                  setDropAt(null)
                }}
                onClick={() => setMenu(open?.kind === 'handle' ? null : { id: b.id, kind: 'handle', index: -1 })}
              >
                ⋮⋮
              </button>
            </div>

            {b.type === 'bullet' && <span className="blk-prefix">•</span>}
            {b.type === 'number' && <span className="blk-prefix">{num}.</span>}
            {b.type === 'todo' && (
              <input
                type="checkbox"
                className="check blk-check"
                checked={!!b.checked}
                tabIndex={-1}
                onChange={(e) => onChange(patch(b.id, { checked: e.target.checked }))}
              />
            )}

            {b.type === 'divider' ? (
              <hr />
            ) : (
              <EditableText
                block={b}
                placeholder={PLACEHOLDER[b.type] ?? ''}
                alwaysPlaceholder={blocks.length === 1}
                onInput={(el) => onInput(b, el)}
                onKeyDown={(e) => onKeyDown(e, b, i)}
                onPaste={(e) => onPaste(e, b, i)}
                onBlur={() => menu?.kind === 'slash' && menu.id === b.id && setMenu(null)}
              />
            )}

            {open && (
              <div className={'blk-menu' + (open.kind === 'handle' ? ' from-handle' : '')}>
                {open.kind === 'handle' && <div className="blk-menu-label">Chuyển thành</div>}
                {items.map((it, k) => (
                  <button
                    key={it.type}
                    className={
                      (k === open.index ? 'on' : '') + (open.kind === 'handle' && it.type === b.type ? ' current' : '')
                    }
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(open, it)}
                  >
                    <span className="blk-menu-icon">{it.icon}</span>
                    {open.kind === 'handle' && it.type === 'divider' ? 'Chèn đường kẻ bên dưới' : it.label}
                  </button>
                ))}
                {items.length === 0 && <div className="blk-menu-label">Không có kết quả</div>}
                {open.kind === 'handle' && (
                  <button className="danger" onClick={() => removeBlock(b.id)}>
                    <span className="blk-menu-icon">✕</span>
                    Xoá khối
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
      <div className="blk-tail" onClick={clickTail} />
    </div>
  )
}

interface EditableProps {
  block: Block
  placeholder: string
  alwaysPlaceholder: boolean
  onInput: (el: HTMLElement) => void
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void
  onPaste: (e: ClipboardEvent<HTMLDivElement>) => void
  onBlur: () => void
}

function EditableText({ block, placeholder, alwaysPlaceholder, onInput, onKeyDown, onPaste, onBlur }: EditableProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Chỉ ghi đè DOM khi nội dung thật sự lệch với state, để không làm mất con trỏ khi đang gõ.
  useLayoutEffect(() => {
    const el = ref.current
    if (el && read(el) !== block.text) el.textContent = block.text
  }, [block.text])

  useLayoutEffect(() => {
    // 'plaintext-only' chặn định dạng dán vào; React chưa có kiểu cho giá trị này.
    ref.current?.setAttribute('contenteditable', 'plaintext-only')
  }, [])

  return (
    <div
      ref={ref}
      data-bid={block.id}
      className={
        'blk-text' + (block.type === 'todo' && block.checked ? ' done' : '') + (alwaysPlaceholder ? ' show-ph' : '')
      }
      data-placeholder={placeholder}
      spellCheck={block.type !== 'code'}
      suppressContentEditableWarning
      onInput={(e) => onInput(e.currentTarget)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onBlur={onBlur}
    />
  )
}
