import { uid } from './tree'
import type { Field, FieldType } from './types'

export const FIELD_TYPES: { type: FieldType; label: string; icon: string }[] = [
  { type: 'text', label: 'Văn bản', icon: 'Aa' },
  { type: 'number', label: 'Số', icon: '#' },
  { type: 'select', label: 'Lựa chọn', icon: '◉' },
  { type: 'multi', label: 'Nhiều lựa chọn', icon: '☰' },
  { type: 'date', label: 'Ngày', icon: '📅' },
  { type: 'checkbox', label: 'Hộp kiểm', icon: '☑' },
]

export const typeIcon = (t: FieldType) => FIELD_TYPES.find((x) => x.type === t)?.icon ?? ''

/** Số màu có sẵn cho lựa chọn (xem `.chip.c0` … trong CSS). */
export const COLORS = 8

export function newField(name: string, type: FieldType, options: string[] = []): Field {
  return {
    id: uid(),
    name,
    type,
    options: options.map((label, i) => ({ id: uid(), label, color: i % COLORS })),
  }
}

export function defaultFields(): Field[] {
  const status = newField('Trạng thái', 'select', ['Chưa bắt đầu', 'Đang làm', 'Chờ duyệt'])
  status.options[0].color = 7
  status.options[1].color = 0
  status.options[2].color = 3
  const prio = newField('Ưu tiên', 'select', ['Cao', 'Trung bình', 'Thấp'])
  prio.options[0].color = 5
  prio.options[1].color = 3
  prio.options[2].color = 2
  return [status, prio, newField('Hạn chót', 'date'), newField('Người phụ trách', 'text'), newField('Nhãn', 'multi')]
}

const pad = (n: number) => String(n).padStart(2, '0')

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 'YYYY-MM-DD' → 'dd/mm' (kèm năm nếu khác năm hiện tại). */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return Number(y) === new Date().getFullYear() ? `${d}/${m}` : `${d}/${m}/${y}`
}

export const isOverdue = (iso: string) => iso < today()
