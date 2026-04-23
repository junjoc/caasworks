'use client'

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/components/ui/loading'
import { Select } from '@/components/ui/select'
import { SearchSelect } from '@/components/ui/search-select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { Plus, Search, X, Copy, Trash2 } from 'lucide-react'

/* ──── Constants ──── */
const SVC = [
  { value: '플랫폼', label: '플랫폼', color: 'bg-gray-800 text-white' },
  { value: 'AI CCTV', label: 'AI CCTV', color: 'bg-red-500 text-white' },
  { value: 'Wearable', label: 'Wearable', color: 'bg-orange-500 text-white' },
  { value: 'LTE/인터넷', label: 'LTE/인터넷', color: 'bg-yellow-500 text-white' },
  { value: 'Mobile AP', label: 'Mobile AP', color: 'bg-purple-500 text-white' },
  { value: 'Story Book', label: 'Story Book', color: 'bg-blue-500 text-white' },
]
const CAT1 = [{ value: '민간', label: '민간' }, { value: '공공', label: '공공' }]
const CAT2 = [
  { value: '신축공사', label: '신축공사' },
  { value: '리모델링·인테리어', label: '리모델링·인테리어' },
  { value: '해체·철거공사', label: '해체·철거공사' },
]
const BILL = [
  { value: '구독(월간)', label: '구독(월간)' },
  { value: '무상이용', label: '무상이용' },
  { value: '연간', label: '연간' },
]
const MS = [1,2,3,4,5,6,7,8,9,10,11,12]

function svcColor(s: string | null) { return SVC.find(o => o.value === s)?.color || 'bg-gray-200 text-gray-700' }
function fmtDate(d: string | null) { return d ? d.substring(2) : '' }

/* ──── Types ──── */
interface Rev { id: string; month: number; amount: number; is_confirmed: boolean }
interface Row {
  id: string; customer_id: string; project_name: string
  project_start: string | null; project_end: string | null
  service_type: string | null; site_category: string | null; site_category2: string | null
  billing_start: string | null; billing_end: string | null
  billing_method: string | null; invoice_day: number | null
  monthly_amount: number | null; status: string; notes: string | null; created_at: string
  customer?: { id: string; company_name: string; notes: string | null }
  revenues: Rev[]
}
interface Cust { id: string; company_name: string }

type Field = 'project_name'|'project_start'|'project_end'|'site_category'|'site_category2'|'service_type'|'billing_start'|'billing_end'|'billing_method'|'invoice_day'

/* ──── CSS ──── */
const CSS = `
.rt::-webkit-scrollbar{width:14px;height:14px}
.rt::-webkit-scrollbar-track{background:#f1f1f1;border-radius:7px}
.rt::-webkit-scrollbar-thumb{background:#b0b0b0;border-radius:7px;border:2px solid #f1f1f1}
.rt::-webkit-scrollbar-thumb:hover{background:#888}
.rt::-webkit-scrollbar-corner{background:#f1f1f1}
`
const B = 'border-r border-gray-200'

/* ──── Helpers ──── */
const selOpts = (f: Field) => f === 'site_category' ? CAT1 : f === 'site_category2' ? CAT2 : f === 'service_type' ? SVC : f === 'billing_method' ? BILL : []

function isRevInRange(month: number, year: number, dateRange: DateRange) {
  if (!dateRange.from || !dateRange.to) return true
  const revDate = `${year}-${String(month).padStart(2, '0')}-01`
  const revEndDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
  return revEndDate >= dateRange.from && revDate <= dateRange.to
}

/* ════════════════════════════════════════════════════════════════
   RevenueRow — React.memo'd row with LOCAL editing state.
   Clicking a cell only re-renders THIS row, not the entire table.
   ════════════════════════════════════════════════════════════════ */
interface RowProps {
  row: Row
  index: number
  year: number
  cm: number
  cy: number
  dateRange: DateRange
  onSaveField: (rid: string, f: Field, val: string) => void
  onSaveRevenue: (rid: string, customerId: string, month: number, amount: number, existingRev?: Rev) => void
  onCopy: (r: Row) => void
  onDelete: (id: string) => void
}

const RevenueRow = React.memo(function RevenueRow({
  row: r, index, year, cm, cy, dateRange,
  onSaveField, onSaveRevenue, onCopy, onDelete,
}: RowProps) {
  // Local editing state — isolated from other rows
  const [ec, setEc] = useState<Field | null>(null)
  const [ev, setEv] = useState('')
  const [erm, setErm] = useState<number | null>(null)
  const [erv, setErv] = useState('')

  // Revenue map (only visible revenues in dateRange)
  const rm = useMemo(() => {
    const map: Record<number, Rev> = {}
    ;(r.revenues || []).forEach(v => {
      if (isRevInRange(v.month, year, dateRange)) {
        map[v.month] = { ...v, amount: Number(v.amount) }
      }
    })
    return map
  }, [r.revenues, year, dateRange])

  const rt = useMemo(() => Object.values(rm).reduce((s, v) => s + v.amount, 0), [rm])

  /* ── Field editing ── */
  const clickField = (f: Field, val: string) => { setEc(f); setEv(val); setErm(null) }
  const cancelField = () => { setEc(null); setEv('') }
  const saveField = () => {
    if (ec === null) return
    onSaveField(r.id, ec, ev.trim())
    setEc(null); setEv('')
  }
  // For select fields: save immediately with the new value
  const saveSelect = (f: Field, val: string) => {
    onSaveField(r.id, f, val)
    setEc(null); setEv('')
  }

  /* ── Revenue editing ── */
  const clickRev = (m: number) => {
    const v = rm[m]
    setErm(m); setErv(v ? String(v.amount) : ''); setEc(null)
  }
  const cancelRev = () => { setErm(null); setErv('') }
  const saveRev = () => {
    if (erm === null) return
    const amt = Number(erv)
    // Use FULL revenues to find existing (not just visible)
    const existing = (r.revenues || []).find(v => v.month === erm)
    onSaveRevenue(r.id, r.customer_id, erm, amt, existing)
    setErm(null); setErv('')
  }

  return (
    <tr className="border-b border-gray-200 hover:bg-blue-50/30 group">
      {/* NO. */}
      <td className={`px-1.5 py-1.5 ${B} text-center font-bold text-gray-700 sticky left-0 bg-white group-hover:bg-blue-50/30 z-10`}>{index + 1}</td>
      {/* 옵션 */}
      <td className={`px-0.5 py-1 ${B} text-center sticky left-[36px] bg-white group-hover:bg-blue-50/30 z-10`}>
        <div className="flex items-center justify-center gap-0.5">
          <button onClick={() => onCopy(r)} className="p-1 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded" title="서비스 추가"><Copy className="w-3.5 h-3.5" /></button>
          <button onClick={() => onDelete(r.id)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="삭제"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </td>

      {/* 시작일 */}
      <td className={`px-1.5 py-1.5 ${B} text-center`}>
        {ec === 'project_start' ? (
          <input type="date" className="w-full text-xs border border-primary-400 rounded px-0.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500" value={ev} onChange={e => setEv(e.target.value)} onBlur={saveField} onKeyDown={e => { if (e.key === 'Enter') saveField(); if (e.key === 'Escape') cancelField() }} autoFocus />
        ) : (
          <div className="cursor-pointer min-h-[24px] flex items-center justify-center" onClick={() => clickField('project_start', r.project_start || '')}>
            <span className={r.project_start ? 'text-gray-500' : 'text-gray-300'}>{fmtDate(r.project_start) || '-'}</span>
          </div>
        )}
      </td>
      {/* 종료일 */}
      <td className={`px-1.5 py-1.5 ${B} text-center`}>
        {ec === 'project_end' ? (
          <input type="date" className="w-full text-xs border border-primary-400 rounded px-0.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500" value={ev} onChange={e => setEv(e.target.value)} onBlur={saveField} onKeyDown={e => { if (e.key === 'Enter') saveField(); if (e.key === 'Escape') cancelField() }} autoFocus />
        ) : (
          <div className="cursor-pointer min-h-[24px] flex items-center justify-center" onClick={() => clickField('project_end', r.project_end || '')}>
            <span className={r.project_end ? 'text-gray-500' : 'text-gray-300'}>{fmtDate(r.project_end) || '-'}</span>
          </div>
        )}
      </td>
      {/* 회사명 (readonly) */}
      <td className={`px-1.5 py-1.5 ${B} text-left font-medium text-gray-800 truncate max-w-[150px]`} title={r.customer?.company_name}>{r.customer?.company_name || '(미지정)'}</td>
      {/* 현장명 */}
      <td className={`px-1.5 py-1.5 ${B} text-left max-w-[220px]`}>
        {ec === 'project_name' ? (
          <input type="text" className="w-full text-xs border border-primary-400 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500" value={ev} onChange={e => setEv(e.target.value)} onBlur={saveField} onKeyDown={e => { if (e.key === 'Enter') saveField(); if (e.key === 'Escape') cancelField() }} autoFocus />
        ) : (
          <div className="cursor-pointer min-h-[24px] flex items-center truncate" onClick={() => clickField('project_name', r.project_name || '')} title={r.project_name}>
            <span className={r.project_name ? 'text-gray-700' : 'text-gray-300'}>{r.project_name || '-'}</span>
          </div>
        )}
      </td>

      {/* Select fields: 현장구분, 현장구분2, 서비스 */}
      {(['site_category', 'site_category2', 'service_type'] as Field[]).map(f => {
        const val = r[f] as string | null
        const isEdit = ec === f
        const opts = selOpts(f)
        return (
          <td key={f} className={`px-1.5 py-1.5 ${B} text-center`}>
            {isEdit ? (
              <select className="w-full text-xs border border-primary-400 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white"
                value={ev} onChange={e => saveSelect(f, e.target.value)} onBlur={cancelField} onKeyDown={e => { if (e.key === 'Escape') cancelField() }} autoFocus>
                <option value="">-</option>
                {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <div className="cursor-pointer min-h-[24px] flex items-center justify-center" onClick={() => clickField(f, val || '')}>
                {f === 'service_type' && val ? (
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${svcColor(val)}`}>{val}</span>
                ) : (
                  <span className="text-gray-500">{val || '-'}</span>
                )}
              </div>
            )}
          </td>
        )
      })}

      {/* 과금 시작일 */}
      <td className={`px-1.5 py-1.5 ${B} text-center`}>
        {ec === 'billing_start' ? (
          <input type="date" className="w-full text-xs border border-primary-400 rounded px-0.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500" value={ev} onChange={e => setEv(e.target.value)} onBlur={saveField} onKeyDown={e => { if (e.key === 'Enter') saveField(); if (e.key === 'Escape') cancelField() }} autoFocus />
        ) : (
          <div className="cursor-pointer min-h-[24px] flex items-center justify-center" onClick={() => clickField('billing_start', r.billing_start || '')}>
            <span className={r.billing_start ? 'text-gray-500' : 'text-gray-300'}>{fmtDate(r.billing_start) || '-'}</span>
          </div>
        )}
      </td>
      {/* 과금 종료일 */}
      <td className={`px-1.5 py-1.5 ${B} text-center`}>
        {ec === 'billing_end' ? (
          <input type="date" className="w-full text-xs border border-primary-400 rounded px-0.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500" value={ev} onChange={e => setEv(e.target.value)} onBlur={saveField} onKeyDown={e => { if (e.key === 'Enter') saveField(); if (e.key === 'Escape') cancelField() }} autoFocus />
        ) : (
          <div className="cursor-pointer min-h-[24px] flex items-center justify-center" onClick={() => clickField('billing_end', r.billing_end || '')}>
            <span className={r.billing_end ? 'text-gray-500' : 'text-gray-300'}>{fmtDate(r.billing_end) || '-'}</span>
          </div>
        )}
      </td>
      {/* 비고 (readonly) */}
      <td className={`px-1.5 py-1.5 ${B} text-left text-gray-500 truncate max-w-[140px]`} title={r.customer?.notes || ''}>{r.customer?.notes || ''}</td>
      {/* 과금 방식 */}
      <td className={`px-1.5 py-1.5 ${B} text-center text-[10px]`}>
        {ec === 'billing_method' ? (
          <select className="w-full text-xs border border-primary-400 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white"
            value={ev} onChange={e => saveSelect('billing_method', e.target.value)} onBlur={cancelField} onKeyDown={e => { if (e.key === 'Escape') cancelField() }} autoFocus>
            <option value="">-</option>
            {BILL.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <div className="cursor-pointer min-h-[24px] flex items-center justify-center" onClick={() => clickField('billing_method', r.billing_method || '')}>
            <span className="text-gray-500">{r.billing_method || '-'}</span>
          </div>
        )}
      </td>

      {/* 월별 매출 */}
      {MS.map(m => {
        const v = rm[m]; const cur = m === cm && year === cy
        const isEdit = erm === m
        return isEdit ? (
          <td key={m} className={`px-0.5 py-1 ${B} ${cur ? 'bg-red-50/30' : ''}`}>
            <input type="number" className="w-full text-right text-xs border border-primary-400 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
              value={erv} onChange={e => setErv(e.target.value)} onBlur={() => { if (erv) saveRev(); else cancelRev() }} onKeyDown={e => { if (e.key === 'Enter') saveRev(); if (e.key === 'Escape') cancelRev() }} autoFocus placeholder="금액" />
          </td>
        ) : (
          <td key={m} className={`px-1 py-1.5 ${B} text-right cursor-pointer hover:bg-primary-50 ${cur ? 'bg-red-50/20' : ''}`} onClick={() => clickRev(m)}>
            {v ? <span className={v.is_confirmed ? 'text-gray-700' : 'text-orange-500'}>{formatCurrency(v.amount)}{!v.is_confirmed && <span className="text-[8px]">*</span>}</span>
              : <span className="text-gray-200">-</span>}
          </td>
        )
      })}
      <td className="px-2 py-1.5 text-right font-semibold text-gray-800">{rt > 0 ? formatCurrency(rt) : '-'}</td>
    </tr>
  )
})

/* ════════════════════════════════════════════════════════════════
   RevenuePage
   ════════════════════════════════════════════════════════════════ */
export default function RevenuePage() {
  const sb = useRef(createClient()).current
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' })
  const [rows, setRows] = useState<Row[]>([])
  const [q, setQ] = useState('')
  const [custs, setCusts] = useState<Cust[]>([])

  // 헤더별 컬럼 필터
  const [colFilter, setColFilter] = useState<{
    site_category: string
    site_category2: string
    service_type: string
    billing_method: string
  }>({ site_category: '', site_category2: '', service_type: '', billing_method: '' })

  const [modal, setModal] = useState(false)
  const [copyFrom, setCopyFrom] = useState<Row | null>(null)

  // 새 행
  const blank = { customer_id: '', project_name: '', project_start: '', project_end: '', site_category: '', site_category2: '', service_type: '', billing_start: '', billing_end: '', billing_method: '', invoice_day: '' }
  const [nr, setNr] = useState(blank)

  const cm = new Date().getMonth() + 1
  const cy = new Date().getFullYear()

  /* ── Fetch ALL (batch 1000 to bypass Supabase default limit) ── */
  const load = useCallback(async () => {
    setLoading(true)
    let all: Row[] = []
    let from = 0
    const size = 1000
    while (true) {
      const { data, error } = await sb
        .from('projects')
        .select('id,customer_id,project_name,project_start,project_end,service_type,site_category,site_category2,billing_start,billing_end,billing_method,invoice_day,monthly_amount,status,notes,created_at,customer:customers(id,company_name,notes),revenues:monthly_revenues(id,month,amount,is_confirmed)')
        .eq('revenues.year', year)
        .order('created_at', { ascending: true })
        .range(from, from + size - 1)
      if (error) { console.error(error); break }
      if (!data || data.length === 0) break
      all = all.concat(data as unknown as Row[])
      if (data.length < size) break
      from += size
    }
    // 해당 연도에 매출 데이터가 있는 프로젝트만 표시
    setRows(all.filter(r => r.revenues && r.revenues.length > 0))
    setLoading(false)
  }, [year, sb])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    sb.from('customers').select('id,company_name').order('company_name')
      .then(({ data }) => setCusts((data || []) as Cust[]))
  }, [sb])

  /* ── Filter (.filter only — preserves row references for React.memo) ── */
  const filtered = useMemo(() => {
    let result = rows
    if (colFilter.site_category) result = result.filter(r => r.site_category === colFilter.site_category)
    if (colFilter.site_category2) result = result.filter(r => r.site_category2 === colFilter.site_category2)
    if (colFilter.service_type) result = result.filter(r => r.service_type === colFilter.service_type)
    if (colFilter.billing_method) result = result.filter(r => r.billing_method === colFilter.billing_method)
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      result = result.filter(r => r.customer?.company_name?.toLowerCase().includes(s) || r.project_name.toLowerCase().includes(s) || r.service_type?.toLowerCase().includes(s))
    }
    if (dateRange.from && dateRange.to) {
      result = result.filter(r =>
        (r.revenues || []).some(v => isRevInRange(v.month, year, dateRange))
      )
    }
    return result
  }, [rows, q, dateRange, year])

  /* ── Totals (dateRange-aware) ── */
  const totals = useMemo(() => {
    const t: Record<number, number> = {}; MS.forEach(m => t[m] = 0); let g = 0
    filtered.forEach(r => (r.revenues || []).forEach(v => {
      if (isRevInRange(v.month, year, dateRange)) {
        t[v.month] = (t[v.month] || 0) + Number(v.amount); g += Number(v.amount)
      }
    }))
    return { t, g }
  }, [filtered, year, dateRange])

  /* ── Stable callbacks for RevenueRow ── */
  const handleSaveField = useCallback(async (rid: string, f: Field, val: string) => {
    const dbVal = f === 'invoice_day' ? (val ? Number(val) : null) : (val || null)
    setRows(prev => prev.map(r => r.id === rid ? { ...r, [f]: dbVal } : r))
    const { error } = await sb.from('projects').update({ [f]: dbVal }).eq('id', rid)
    if (error) { toast.error('수정 실패'); load() }
  }, [sb, load])

  const handleSaveRevenue = useCallback(async (
    rid: string, customerId: string, month: number, amount: number, existingRev?: Rev
  ) => {
    if (existingRev) {
      if (isNaN(amount) || amount <= 0) {
        // Delete
        setRows(prev => prev.map(r => r.id === rid ? { ...r, revenues: r.revenues.filter(v => v.id !== existingRev.id) } : r))
        await sb.from('monthly_revenues').delete().eq('id', existingRev.id)
        toast.success('삭제'); return
      }
      // Update
      setRows(prev => prev.map(r => r.id === rid ? { ...r, revenues: r.revenues.map(v => v.id === existingRev.id ? { ...v, amount } : v) } : r))
      const { error } = await sb.from('monthly_revenues').update({ amount }).eq('id', existingRev.id)
      if (error) { toast.error('실패'); load() }
    } else {
      if (isNaN(amount) || amount <= 0) return
      // Create
      const tid = `t${Date.now()}`
      setRows(prev => prev.map(r => r.id === rid ? { ...r, revenues: [...r.revenues, { id: tid, month, amount, is_confirmed: false }] } : r))
      const { data, error } = await sb.from('monthly_revenues')
        .insert({ customer_id: customerId, project_id: rid, year, month, amount, is_confirmed: false })
        .select('id').single()
      if (error) { toast.error('실패'); load(); return }
      if (data) setRows(prev => prev.map(r => r.id === rid ? { ...r, revenues: r.revenues.map(v => v.id === tid ? { ...v, id: data.id } : v) } : r))
      toast.success(`${month}월 매출 등록`)
    }
  }, [sb, year, load])

  const handleCopy = useCallback((r: Row) => { setCopyFrom(r); setModal(true) }, [])
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('삭제하시겠습니까?\n매출 데이터도 함께 삭제됩니다.')) return
    setRows(prev => prev.filter(r => r.id !== id))
    await sb.from('monthly_revenues').delete().eq('project_id', id)
    await sb.from('projects').delete().eq('id', id)
    toast.success('삭제 완료')
  }, [sb])

  /* ── New row save ── */
  const saveNew = useCallback(async () => {
    if (!nr.customer_id) { toast.error('회사명 선택 필요'); return }
    if (!nr.project_name) { toast.error('현장명 입력 필요'); return }
    const { data, error } = await sb.from('projects').insert({
      customer_id: nr.customer_id, project_name: nr.project_name,
      project_start: nr.project_start || null, project_end: nr.project_end || null,
      site_category: nr.site_category || null, site_category2: nr.site_category2 || null,
      service_type: nr.service_type || null, billing_start: nr.billing_start || null,
      billing_end: nr.billing_end || null, billing_method: nr.billing_method || null,
      invoice_day: nr.invoice_day ? Number(nr.invoice_day) : null,
      status: 'active', source: 'manual',
    }).select('*,customer:customers(id,company_name,notes)').single()
    if (error) { toast.error('등록 실패'); return }
    if (data) setRows(prev => [...prev, { ...data, revenues: [] } as Row])
    toast.success('등록 완료')
    setNr({ customer_id: '', project_name: '', project_start: '', project_end: '', site_category: '', site_category2: '', service_type: '', billing_start: '', billing_end: '', billing_method: '', invoice_day: '' })
  }, [nr, sb])

  const yOpts = useMemo(() => Array.from({ length: 5 }, (_, i) => ({ value: String(cy - i), label: `${cy - i}년` })), [cy])

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="page-header">
        <h1 className="page-title">CaaS.Works 현장별 매출 현황</h1>
        <div className="flex items-center gap-2">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <Select value={String(year)} onChange={e => setYear(Number(e.target.value))} options={yOpts} className="w-32" />
        </div>
      </div>

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input type="text" placeholder="고객사 / 현장명 / 서비스 검색..." value={q} onChange={e => setQ(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          {q && <button onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"><X className="w-4 h-4" /></button>}
        </div>
      </div>

      {/* Summary */}
      <div className="card mb-4 overflow-x-auto">
        <table className="w-full text-xs"><thead><tr className="border-b border-gray-200">
          <th className="px-3 py-2 text-left font-semibold text-gray-600 w-20">구분</th>
          {MS.map(m => <th key={m} className={`px-1 py-2 text-center font-medium min-w-[80px] ${m === cm && year === cy ? 'bg-red-50 text-red-700 font-bold' : 'text-gray-600'}`}>{m}월</th>)}
          <th className="px-2 py-2 text-right font-semibold text-gray-600 min-w-[100px]">합계</th>
        </tr></thead><tbody><tr className="font-semibold bg-gray-50">
          <td className="px-3 py-2 text-gray-700">합계</td>
          {MS.map(m => <td key={m} className={`px-1 py-2 text-right ${m === cm && year === cy ? 'bg-red-50 text-red-700 font-bold' : ''}`}>{totals.t[m] ? formatCurrency(totals.t[m]) : '-'}</td>)}
          <td className="px-2 py-2 text-right font-bold text-primary-600">{formatCurrency(totals.g)}</td>
        </tr></tbody></table>
      </div>

      {loading ? <Loading /> : (
        <div className="card rt overflow-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
          <table className="w-full text-xs border-collapse">
            <thead className="bg-red-600 text-white sticky top-0 z-20"><tr>
              <th className={`px-1.5 py-2.5 text-center font-medium w-[36px] sticky left-0 bg-red-600 z-30 border-r border-red-500`}>NO.</th>
              <th className={`px-1 py-2.5 text-center font-medium w-[60px] sticky left-[36px] bg-red-600 z-30 border-r border-red-500`}>옵션</th>
              <th className="px-1.5 py-2.5 text-center font-medium min-w-[85px] border-r border-red-500">시작일</th>
              <th className="px-1.5 py-2.5 text-center font-medium min-w-[85px] border-r border-red-500">종료일</th>
              <th className="px-1.5 py-2.5 text-left font-medium min-w-[120px] border-r border-red-500">회사명</th>
              <th className="px-1.5 py-2.5 text-left font-medium min-w-[200px] border-r border-red-500">프로젝트 명 (현장명)</th>
              <th className="px-1.5 py-1 text-center font-medium min-w-[60px] border-r border-red-500">
                <div>현장<br/>구분</div>
                <select value={colFilter.site_category} onChange={e => setColFilter(p => ({...p, site_category: e.target.value}))} className="mt-1 w-full text-[10px] bg-red-700 text-white border border-red-500 rounded px-0.5 py-0" onClick={e => e.stopPropagation()}>
                  <option value="">전체</option>
                  {CAT1.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </th>
              <th className="px-1.5 py-1 text-center font-medium min-w-[110px] border-r border-red-500">
                <div>현장<br/>구분2</div>
                <select value={colFilter.site_category2} onChange={e => setColFilter(p => ({...p, site_category2: e.target.value}))} className="mt-1 w-full text-[10px] bg-red-700 text-white border border-red-500 rounded px-0.5 py-0">
                  <option value="">전체</option>
                  {CAT2.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </th>
              <th className="px-1.5 py-1 text-center font-medium min-w-[95px] border-r border-red-500">
                <div>이용 서비스</div>
                <select value={colFilter.service_type} onChange={e => setColFilter(p => ({...p, service_type: e.target.value}))} className="mt-1 w-full text-[10px] bg-red-700 text-white border border-red-500 rounded px-0.5 py-0">
                  <option value="">전체</option>
                  {SVC.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </th>
              <th className="px-1.5 py-2.5 text-center font-medium min-w-[85px] border-r border-red-500">과금<br />시작일</th>
              <th className="px-1.5 py-2.5 text-center font-medium min-w-[85px] border-r border-red-500">과금<br />종료일</th>
              <th className="px-1.5 py-2.5 text-left font-medium min-w-[120px] border-r border-red-500">비고</th>
              <th className="px-1.5 py-1 text-center font-medium min-w-[90px] border-r border-red-500">
                <div>과금<br/>방식</div>
                <select value={colFilter.billing_method} onChange={e => setColFilter(p => ({...p, billing_method: e.target.value}))} className="mt-1 w-full text-[10px] bg-red-700 text-white border border-red-500 rounded px-0.5 py-0">
                  <option value="">전체</option>
                  {BILL.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </th>
              {MS.map(m => <th key={m} className={`px-1 py-2.5 text-center font-medium min-w-[80px] border-r border-red-500 ${m === cm && year === cy ? 'bg-red-700' : ''}`}>{m}월</th>)}
              <th className="px-2 py-2.5 text-right font-medium min-w-[90px]">합계</th>
            </tr></thead>

            <tbody>
              {/* 신규 작성 행 — 최상단에 배치 (아래로 스크롤 없이 바로 입력 가능) */}
              <tr className="border-b-2 border-primary-300 bg-primary-50/40 sticky top-[48px] z-[15]">
                <td className={`px-1.5 py-1.5 ${B} text-center font-bold text-primary-600 sticky left-0 bg-primary-50/90 z-10`}>NEW</td>
                <td className={`px-0.5 py-1 ${B} text-center sticky left-[36px] bg-primary-50/90 z-10`}>
                  <button onClick={saveNew} className="p-1 text-primary-500 hover:text-primary-700 hover:bg-primary-100 rounded" title="저장"><Plus className="w-3.5 h-3.5" /></button>
                </td>
                <td className={`px-1.5 py-1.5 ${B}`}><input type="date" className="w-full text-xs border border-gray-300 rounded px-0.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500" value={nr.project_start} onChange={e => setNr(p => ({ ...p, project_start: e.target.value }))} /></td>
                <td className={`px-1.5 py-1.5 ${B}`}><input type="date" className="w-full text-xs border border-gray-300 rounded px-0.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500" value={nr.project_end} onChange={e => setNr(p => ({ ...p, project_end: e.target.value }))} /></td>
                <td className={`px-1.5 py-1.5 ${B} overflow-visible`}>
                  <SearchSelect placeholder="회사 검색..." options={custs.map(c => ({ value: c.id, label: c.company_name }))} value={nr.customer_id} onChange={v => setNr(p => ({ ...p, customer_id: v }))} className="min-w-[120px]" />
                </td>
                <td className={`px-1.5 py-1.5 ${B}`}><input type="text" className="w-full text-xs border border-gray-300 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500" value={nr.project_name} onChange={e => setNr(p => ({ ...p, project_name: e.target.value }))} placeholder="현장명" onKeyDown={e => { if (e.key === 'Enter') saveNew() }} /></td>
                <td className={`px-1.5 py-1.5 ${B}`}><select className="w-full text-xs border border-gray-300 rounded px-0.5 py-1 bg-white" value={nr.site_category} onChange={e => setNr(p => ({ ...p, site_category: e.target.value }))}><option value="">-</option>{CAT1.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></td>
                <td className={`px-1.5 py-1.5 ${B}`}><select className="w-full text-xs border border-gray-300 rounded px-0.5 py-1 bg-white" value={nr.site_category2} onChange={e => setNr(p => ({ ...p, site_category2: e.target.value }))}><option value="">-</option>{CAT2.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></td>
                <td className={`px-1.5 py-1.5 ${B}`}><select className="w-full text-xs border border-gray-300 rounded px-0.5 py-1 bg-white" value={nr.service_type} onChange={e => setNr(p => ({ ...p, service_type: e.target.value }))}><option value="">-</option>{SVC.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></td>
                <td className={`px-1.5 py-1.5 ${B}`}><input type="date" className="w-full text-xs border border-gray-300 rounded px-0.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500" value={nr.billing_start} onChange={e => setNr(p => ({ ...p, billing_start: e.target.value }))} /></td>
                <td className={`px-1.5 py-1.5 ${B}`}><input type="date" className="w-full text-xs border border-gray-300 rounded px-0.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500" value={nr.billing_end} onChange={e => setNr(p => ({ ...p, billing_end: e.target.value }))} /></td>
                <td className={`px-1.5 py-1.5 ${B} text-gray-300`}>-</td>
                <td className={`px-1.5 py-1.5 ${B}`}><select className="w-full text-xs border border-gray-300 rounded px-0.5 py-1 bg-white" value={nr.billing_method} onChange={e => setNr(p => ({ ...p, billing_method: e.target.value }))}><option value="">-</option>{BILL.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></td>
                {MS.map(m => <td key={m} className={`px-1 py-1.5 ${B} text-center text-gray-300`}>-</td>)}
                <td className="px-2 py-1.5 text-right text-gray-300">-</td>
              </tr>

              {filtered.map((r, i) => (
                <RevenueRow
                  key={r.id}
                  row={r}
                  index={i}
                  year={year}
                  cm={cm}
                  cy={cy}
                  dateRange={dateRange}
                  onSaveField={handleSaveField}
                  onSaveRevenue={handleSaveRevenue}
                  onCopy={handleCopy}
                  onDelete={handleDelete}
                />
              ))}

            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => { setCopyFrom(null); setModal(true) }} className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-800 font-medium py-1 px-2 rounded hover:bg-primary-50"><Plus className="w-4 h-4" />행 추가</button>
              <span className="text-xs text-text-tertiary">총 {filtered.length}건</span>
              <span className="text-xs text-text-tertiary">* 미확정</span>
            </div>
            <span className="text-[10px] text-text-tertiary">셀 클릭=편집 | Enter=저장 | Esc=취소</span>
          </div>
        </div>
      )}

      <ProjectModal open={modal} onClose={() => { setModal(false); setCopyFrom(null) }} customers={custs} copyFrom={copyFrom}
        onSaved={p => { if (p) setRows(prev => [...prev, p]); setModal(false); setCopyFrom(null) }} />
    </div>
  )
}

/* ──── Modal ──── */
function ProjectModal({ open, onClose, customers, copyFrom, onSaved }: {
  open: boolean; onClose: () => void; customers: Cust[]; copyFrom: Row | null; onSaved: (p?: Row) => void
}) {
  const sb = createClient()
  const [saving, setSaving] = useState(false)
  const [f, setF] = useState({ customer_id: '', project_name: '', project_start: '', project_end: '', site_category: '', site_category2: '', service_type: '', billing_start: '', billing_end: '', billing_method: '', invoice_day: '', monthly_amount: '', notes: '' })
  const u = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    if (copyFrom) {
      setF({ customer_id: copyFrom.customer_id || '', project_name: copyFrom.project_name || '', project_start: copyFrom.project_start || '', project_end: copyFrom.project_end || '', site_category: copyFrom.site_category || '', site_category2: copyFrom.site_category2 || '', service_type: '', billing_start: '', billing_end: '', billing_method: copyFrom.billing_method || '', invoice_day: copyFrom.invoice_day ? String(copyFrom.invoice_day) : '', monthly_amount: '', notes: '' })
    } else {
      setF({ customer_id: '', project_name: '', project_start: '', project_end: '', site_category: '', site_category2: '', service_type: '', billing_start: '', billing_end: '', billing_method: '', invoice_day: '', monthly_amount: '', notes: '' })
    }
  }, [open, copyFrom])

  const save = async () => {
    if (!f.customer_id) { toast.error('회사명 선택 필요'); return }
    if (!f.project_name) { toast.error('현장명 입력 필요'); return }
    setSaving(true)
    const { data, error } = await sb.from('projects').insert({
      customer_id: f.customer_id, project_name: f.project_name, project_start: f.project_start || null, project_end: f.project_end || null,
      site_category: f.site_category || null, site_category2: f.site_category2 || null, service_type: f.service_type || null,
      billing_start: f.billing_start || null, billing_end: f.billing_end || null, billing_method: f.billing_method || null,
      invoice_day: f.invoice_day ? Number(f.invoice_day) : null, monthly_amount: f.monthly_amount ? Number(f.monthly_amount) : null,
      status: 'active', source: 'manual'
    }).select('*,customer:customers(id,company_name,notes)').single()
    setSaving(false)
    if (error) { toast.error('등록 실패'); return }
    toast.success('등록 완료')
    if (data && (f.service_type === 'AI CCTV' || f.service_type === 'Wearable')) {
      if (confirm('카메라 반출 현황을 등록하시겠습니까?')) { window.location.href = `/operations/camera-shipments?project_id=${data.id}&customer_id=${data.customer_id}`; return }
    }
    onSaved(data ? { ...data, revenues: [] } as Row : undefined)
  }

  return (
    <Modal open={open} onClose={onClose} title={copyFrom ? '같은 현장 서비스 추가' : '프로젝트 등록'} className="max-w-2xl">
      <div className="space-y-4">
        {copyFrom && <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700"><strong>{copyFrom.customer?.company_name}</strong>의 <strong>{copyFrom.project_name}</strong> 현장에 새 서비스를 추가합니다.</div>}
        <SearchSelect label="회사명 *" placeholder="고객사 검색..." options={customers.map(c => ({ value: c.id, label: c.company_name }))} value={f.customer_id} onChange={v => u('customer_id', v)} disabled={!!copyFrom} />
        <Input label="프로젝트 명 (현장명) *" placeholder="현장 주소" value={f.project_name} onChange={e => u('project_name', e.target.value)} disabled={!!copyFrom} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="프로젝트 시작일" type="date" value={f.project_start} onChange={e => u('project_start', e.target.value)} />
          <Input label="프로젝트 종료일" type="date" value={f.project_end} onChange={e => u('project_end', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="현장 구분" options={[{ value: '', label: '선택' }, ...CAT1]} value={f.site_category} onChange={e => u('site_category', e.target.value)} />
          <Select label="현장 구분2" options={[{ value: '', label: '선택' }, ...CAT2]} value={f.site_category2} onChange={e => u('site_category2', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="이용 서비스" options={[{ value: '', label: '선택' }, ...SVC]} value={f.service_type} onChange={e => u('service_type', e.target.value)} />
          <Select label="과금 방식" options={[{ value: '', label: '선택' }, ...BILL]} value={f.billing_method} onChange={e => u('billing_method', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="과금 시작일" type="date" value={f.billing_start} onChange={e => u('billing_start', e.target.value)} />
          <Input label="과금 종료일" type="date" value={f.billing_end} onChange={e => u('billing_end', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="월정액 (원)" type="number" placeholder="0" value={f.monthly_amount} onChange={e => u('monthly_amount', e.target.value)} />
          <Select label="계산서 발행일" options={[{ value: '', label: '선택' }, { value: '1', label: '매월 1일' }, { value: '15', label: '매월 15일' }, { value: '25', label: '매월 25일' }, { value: '0', label: '말일' }]} value={f.invoice_day} onChange={e => u('invoice_day', e.target.value)} />
        </div>
        {(f.service_type === 'AI CCTV' || f.service_type === 'Wearable') && <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">카메라 관련 서비스입니다. 저장 후 반출 등록 가능합니다.</div>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button onClick={save} loading={saving}>등록</Button>
        </div>
      </div>
    </Modal>
  )
}
