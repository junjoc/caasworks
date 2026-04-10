'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/ui/loading'
import { toast } from 'sonner'
import {
  ChevronLeft, Star, Upload, X, GripVertical, ImageIcon
} from 'lucide-react'
import type { QuotationTemplate, TemplateColumn } from '@/types/database'

// ─── Column definitions ───────────────────────────────────────────────────────

const ALL_COLUMNS: TemplateColumn[] = [
  { key: 'no', label: 'No.', visible: true, order: 0 },
  { key: 'category', label: '구분', visible: true, order: 1 },
  { key: 'item_name', label: '품명', visible: true, order: 2 },
  { key: 'description', label: '상세', visible: false, order: 3 },
  { key: 'unit_price', label: '단가', visible: true, order: 4 },
  { key: 'quantity', label: '수량', visible: true, order: 5 },
  { key: 'unit', label: '단위', visible: true, order: 6 },
  { key: 'period', label: '기간(월)', visible: false, order: 7 },
  { key: 'supply_method', label: '공급방식', visible: false, order: 8 },
  { key: 'amount', label: '공급가/금액', visible: true, order: 9 },
  { key: 'notes', label: '비고', visible: false, order: 10 },
]

// ─── Types ─────────────────────────────────────────────────────────────────────

type FormData = {
  name: string
  description: string
  title_format: string
  layout_type: 'A' | 'B' | 'custom'
  company_name: string
  biz_number: string
  ceo_name: string
  company_address: string
  company_phone: string
  bank_info: string
  logo_left_url: string
  logo_right_url: string
  stamp_url: string
  columns: TemplateColumn[]
  max_rows: string
  show_vat_row: boolean
  show_deposit_row: boolean
  show_discount_row: boolean
  default_notes: string
  default_terms: string
  footer_left: string
  footer_right: string
  is_default: boolean
}

const defaultForm: FormData = {
  name: '',
  description: '',
  title_format: '견적서',
  layout_type: 'A',
  company_name: '',
  biz_number: '',
  ceo_name: '',
  company_address: '',
  company_phone: '',
  bank_info: '',
  logo_left_url: '',
  logo_right_url: '',
  stamp_url: '',
  columns: ALL_COLUMNS.map((c) => ({ ...c })),
  max_rows: '20',
  show_vat_row: true,
  show_deposit_row: false,
  show_discount_row: false,
  default_notes: '',
  default_terms: '',
  footer_left: '',
  footer_right: '',
  is_default: false,
}

// ─── Image Upload Component ────────────────────────────────────────────────────

function ImageUploadField({
  label,
  value,
  onChange,
  fieldName,
}: {
  label: string
  value: string
  onChange: (url: string) => void
  fieldName: string
}) {
  const supabase = createClient()
  const [uploading, setUploading] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드할 수 있습니다.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('파일 크기는 5MB 이하여야 합니다.')
      return
    }

    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${fieldName}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('templates')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('templates').getPublicUrl(path)
      onChange(data.publicUrl)
      toast.success('이미지가 업로드되었습니다.')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '업로드에 실패했습니다.'
      toast.error(msg)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <label className="input-label">{label}</label>
      <div className="flex items-start gap-3">
        {/* Preview */}
        <div className="w-24 h-16 rounded-lg border border-border bg-surface-tertiary flex items-center justify-center overflow-hidden flex-shrink-0">
          {value ? (
            <img
              src={value}
              alt={label}
              className="w-full h-full object-contain"
            />
          ) : (
            <ImageIcon className="w-6 h-6 text-text-tertiary" />
          )}
        </div>

        {/* Controls */}
        <div className="flex-1 space-y-2">
          <label className={`
            inline-flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg
            border border-border bg-surface text-xs font-medium text-text-secondary
            hover:bg-surface-tertiary transition-colors
            ${uploading ? 'opacity-50 pointer-events-none' : ''}
          `}>
            <Upload className="w-3.5 h-3.5" />
            {uploading ? '업로드 중...' : '이미지 선택'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
          </label>

          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="flex items-center gap-1 text-xs text-status-red hover:text-red-600 transition-colors"
            >
              <X className="w-3 h-3" />
              이미지 제거
            </button>
          )}

          {value && (
            <p className="text-[11px] text-text-tertiary break-all line-clamp-1">{value}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Column List (checkbox + drag-to-reorder) ─────────────────────────────────

function ColumnSettings({
  columns,
  onChange,
}: {
  columns: TemplateColumn[]
  onChange: (cols: TemplateColumn[]) => void
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const sorted = [...columns].sort((a, b) => a.order - b.order)

  const toggleVisible = (key: string) => {
    onChange(
      columns.map((c) =>
        c.key === key ? { ...c, visible: !c.visible } : c
      )
    )
  }

  const handleDragStart = (idx: number) => setDragIndex(idx)
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDragOverIndex(idx)
  }

  const handleDrop = (dropIdx: number) => {
    if (dragIndex === null || dragIndex === dropIdx) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }

    const reordered = [...sorted]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(dropIdx, 0, moved)

    onChange(reordered.map((c, i) => ({ ...c, order: i })))
    setDragIndex(null)
    setDragOverIndex(null)
  }

  return (
    <div className="space-y-1.5">
      {sorted.map((col, idx) => (
        <div
          key={col.key}
          draggable
          onDragStart={() => handleDragStart(idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDrop={() => handleDrop(idx)}
          onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
          className={`
            flex items-center gap-3 px-3 py-2 rounded-lg border transition-all
            ${dragOverIndex === idx ? 'border-primary-500 bg-primary-50' : 'border-border bg-surface'}
            ${dragIndex === idx ? 'opacity-50' : ''}
            cursor-grab active:cursor-grabbing
          `}
        >
          <GripVertical className="w-4 h-4 text-text-tertiary flex-shrink-0" />
          <input
            type="checkbox"
            id={`col-${col.key}`}
            checked={col.visible}
            onChange={() => toggleVisible(col.key)}
            className="w-4 h-4 rounded border-border text-primary-600 cursor-pointer"
          />
          <label
            htmlFor={`col-${col.key}`}
            className="text-sm text-text-primary cursor-pointer flex-1 select-none"
          >
            {col.label}
          </label>
          <span className="text-[11px] text-text-tertiary font-mono">{col.key}</span>
        </div>
      ))}
      <p className="text-xs text-text-tertiary pt-1">
        드래그하여 순서를 변경하고, 체크박스로 표시 여부를 설정합니다.
      </p>
    </div>
  )
}

// ─── Section Card ──────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-header-title">{title}</h2>
      </div>
      <div className="card-body">
        {children}
      </div>
    </div>
  )
}

// ─── Toggle Switch ─────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`
          relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
          transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-1 mt-0.5
          ${checked ? 'bg-primary-600' : 'bg-gray-200'}
        `}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`
            pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0
            transition-transform duration-200
            ${checked ? 'translate-x-4' : 'translate-x-0'}
          `}
        />
      </button>
      <div>
        <div className="text-sm font-medium text-text-primary">{label}</div>
        {description && (
          <div className="text-xs text-text-secondary mt-0.5">{description}</div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TemplateEditorPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string
  const isNew = id === 'new'

  const supabase = createClient()

  const [form, setForm] = useState<FormData>(defaultForm)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)

  const setField = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  useEffect(() => {
    if (isNew) return

    async function fetchTemplate() {
      const { data, error } = await supabase
        .from('quotation_templates')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) {
        toast.error('템플릿을 불러오지 못했습니다.')
        router.push('/settings/templates')
        return
      }

      const tpl = data as QuotationTemplate

      // Merge stored columns with ALL_COLUMNS to handle new keys
      const storedCols: TemplateColumn[] = tpl.columns || []
      const mergedCols = ALL_COLUMNS.map((def) => {
        const stored = storedCols.find((c) => c.key === def.key)
        return stored ? { ...def, ...stored } : { ...def }
      }).sort((a, b) => a.order - b.order)

      setForm({
        name: tpl.name || '',
        description: tpl.description || '',
        title_format: tpl.title_format || '견적서',
        layout_type: tpl.layout_type || 'A',
        company_name: tpl.company_name || '',
        biz_number: tpl.biz_number || '',
        ceo_name: tpl.ceo_name || '',
        company_address: tpl.company_address || '',
        company_phone: tpl.company_phone || '',
        bank_info: tpl.bank_info || '',
        logo_left_url: tpl.logo_left_url || '',
        logo_right_url: tpl.logo_right_url || '',
        stamp_url: tpl.stamp_url || '',
        columns: mergedCols,
        max_rows: tpl.max_rows != null ? String(tpl.max_rows) : '20',
        show_vat_row: tpl.show_vat_row ?? true,
        show_deposit_row: tpl.show_deposit_row ?? false,
        show_discount_row: tpl.show_discount_row ?? false,
        default_notes: tpl.default_notes || '',
        default_terms: tpl.default_terms || '',
        footer_left: tpl.footer_left || '',
        footer_right: tpl.footer_right || '',
        is_default: tpl.is_default ?? false,
      })
      setLoading(false)
    }

    fetchTemplate()
  }, [id, isNew])

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('템플릿 이름을 입력해주세요.')
      return
    }

    setSaving(true)

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      title_format: form.title_format.trim() || null,
      layout_type: form.layout_type,
      company_name: form.company_name.trim() || null,
      biz_number: form.biz_number.trim() || null,
      ceo_name: form.ceo_name.trim() || null,
      company_address: form.company_address.trim() || null,
      company_phone: form.company_phone.trim() || null,
      bank_info: form.bank_info.trim() || null,
      logo_left_url: form.logo_left_url || null,
      logo_right_url: form.logo_right_url || null,
      stamp_url: form.stamp_url || null,
      columns: form.columns,
      max_rows: form.max_rows ? parseInt(form.max_rows, 10) : null,
      show_vat_row: form.show_vat_row,
      show_deposit_row: form.show_deposit_row,
      show_discount_row: form.show_discount_row,
      default_notes: form.default_notes.trim() || null,
      default_terms: form.default_terms.trim() || null,
      footer_left: form.footer_left.trim() || null,
      footer_right: form.footer_right.trim() || null,
      is_default: form.is_default,
      updated_at: new Date().toISOString(),
    }

    try {
      // If setting as default, unset others first
      if (form.is_default) {
        await supabase
          .from('quotation_templates')
          .update({ is_default: false })
          .neq('id', isNew ? '00000000-0000-0000-0000-000000000000' : id)
      }

      if (isNew) {
        const { error } = await supabase
          .from('quotation_templates')
          .insert({ ...payload, created_at: new Date().toISOString() })

        if (error) throw error
        toast.success('템플릿이 생성되었습니다.')
      } else {
        const { error } = await supabase
          .from('quotation_templates')
          .update(payload)
          .eq('id', id)

        if (error) throw error
        toast.success('템플릿이 저장되었습니다.')
      }

      router.push('/settings/templates')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '저장에 실패했습니다.'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loading />

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/settings/templates')}
            className="icon-btn"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="page-title">
              {isNew ? '새 견적서 템플릿' : '템플릿 수정'}
            </h1>
            {!isNew && form.name && (
              <p className="page-subtitle">{form.name}</p>
            )}
          </div>
          {form.is_default && (
            <Badge className="bg-amber-100 text-amber-700 flex items-center gap-1">
              <Star className="w-3 h-3" />
              기본 템플릿
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => router.push('/settings/templates')}>
            취소
          </Button>
          <Button size="sm" onClick={handleSave} loading={saving}>
            저장
          </Button>
        </div>
      </div>

      <div className="space-y-4 max-w-3xl">

        {/* ── 기본 정보 ── */}
        <Section title="기본 정보">
          <div className="space-y-4">
            <Input
              label="템플릿 이름 *"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="예: 기본 견적서 양식"
            />
            <Textarea
              label="설명"
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="이 템플릿에 대한 간단한 설명을 입력하세요."
              rows={2}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="제목 형식"
                value={form.title_format}
                onChange={(e) => setField('title_format', e.target.value)}
                placeholder="견적서"
              />
              <Select
                label="레이아웃 유형"
                value={form.layout_type}
                onChange={(e) => setField('layout_type', e.target.value as 'A' | 'B' | 'custom')}
                options={[
                  { value: 'A', label: '레이아웃 A' },
                  { value: 'B', label: '레이아웃 B' },
                  { value: 'custom', label: '커스텀' },
                ]}
              />
            </div>

            {/* Default toggle */}
            <div className="pt-2 border-t border-border-light">
              <Toggle
                checked={form.is_default}
                onChange={(v) => setField('is_default', v)}
                label="기본 템플릿으로 설정"
                description="견적서 생성 시 이 템플릿이 기본으로 선택됩니다."
              />
            </div>
          </div>
        </Section>

        {/* ── 회사 정보 ── */}
        <Section title="회사 정보">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="상호명"
                value={form.company_name}
                onChange={(e) => setField('company_name', e.target.value)}
                placeholder="(주)카스웍스"
              />
              <Input
                label="사업자등록번호"
                value={form.biz_number}
                onChange={(e) => setField('biz_number', e.target.value)}
                placeholder="000-00-00000"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="대표자명"
                value={form.ceo_name}
                onChange={(e) => setField('ceo_name', e.target.value)}
                placeholder="홍길동"
              />
              <Input
                label="전화번호"
                value={form.company_phone}
                onChange={(e) => setField('company_phone', e.target.value)}
                placeholder="02-0000-0000"
              />
            </div>
            <Input
              label="주소"
              value={form.company_address}
              onChange={(e) => setField('company_address', e.target.value)}
              placeholder="서울특별시 강남구 테헤란로 00길 00"
            />
            <Textarea
              label="계좌 정보"
              value={form.bank_info}
              onChange={(e) => setField('bank_info', e.target.value)}
              placeholder="예: 국민은행 000-0000-0000-00 (주)카스웍스"
              rows={2}
            />
          </div>
        </Section>

        {/* ── 이미지 ── */}
        <Section title="이미지">
          <div className="space-y-5">
            <ImageUploadField
              label="좌측 로고"
              value={form.logo_left_url}
              onChange={(url) => setField('logo_left_url', url)}
              fieldName="logo_left"
            />
            <ImageUploadField
              label="우측 로고"
              value={form.logo_right_url}
              onChange={(url) => setField('logo_right_url', url)}
              fieldName="logo_right"
            />
            <ImageUploadField
              label="직인/도장"
              value={form.stamp_url}
              onChange={(url) => setField('stamp_url', url)}
              fieldName="stamp"
            />
          </div>
        </Section>

        {/* ── 컬럼 설정 ── */}
        <Section title="컬럼 설정">
          <ColumnSettings
            columns={form.columns}
            onChange={(cols) => setField('columns', cols)}
          />
        </Section>

        {/* ── 표시 옵션 ── */}
        <Section title="표시 옵션">
          <div className="space-y-4">
            <Input
              label="최대 행 수"
              type="number"
              value={form.max_rows}
              onChange={(e) => setField('max_rows', e.target.value)}
              placeholder="20"
              min={1}
              max={100}
            />
            <div className="space-y-3 pt-2">
              <Toggle
                checked={form.show_vat_row}
                onChange={(v) => setField('show_vat_row', v)}
                label="부가세 행 표시"
                description="합계 하단에 부가세(VAT) 항목을 표시합니다."
              />
              <Toggle
                checked={form.show_deposit_row}
                onChange={(v) => setField('show_deposit_row', v)}
                label="선수금 행 표시"
                description="계약금 / 선수금 항목을 표시합니다."
              />
              <Toggle
                checked={form.show_discount_row}
                onChange={(v) => setField('show_discount_row', v)}
                label="할인 행 표시"
                description="할인 금액 항목을 표시합니다."
              />
            </div>
          </div>
        </Section>

        {/* ── 기본 문구 ── */}
        <Section title="기본 문구">
          <div className="space-y-4">
            <Textarea
              label="기본 비고"
              value={form.default_notes}
              onChange={(e) => setField('default_notes', e.target.value)}
              placeholder="견적서에 기본으로 표시될 비고 내용을 입력하세요."
              rows={3}
            />
            <Textarea
              label="기본 계약 조건"
              value={form.default_terms}
              onChange={(e) => setField('default_terms', e.target.value)}
              placeholder="계약 조건, 납기, 지불 조건 등을 입력하세요."
              rows={4}
            />
            <div className="grid grid-cols-2 gap-4">
              <Textarea
                label="하단 좌측 문구"
                value={form.footer_left}
                onChange={(e) => setField('footer_left', e.target.value)}
                placeholder="하단 좌측에 표시될 문구"
                rows={2}
              />
              <Textarea
                label="하단 우측 문구"
                value={form.footer_right}
                onChange={(e) => setField('footer_right', e.target.value)}
                placeholder="하단 우측에 표시될 문구"
                rows={2}
              />
            </div>
          </div>
        </Section>

        {/* Bottom save */}
        <div className="flex justify-end gap-2 pb-8">
          <Button variant="secondary" onClick={() => router.push('/settings/templates')}>
            취소
          </Button>
          <Button onClick={handleSave} loading={saving}>
            저장
          </Button>
        </div>
      </div>
    </div>
  )
}
