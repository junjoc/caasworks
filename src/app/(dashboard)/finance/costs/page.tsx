'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { Loading } from '@/components/ui/loading'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Wallet, TrendingDown, Building2, Wrench, Search, Pencil, Trash2, Calendar } from 'lucide-react'
import { toast } from 'sonner'

// -- costs 테이블이 없으면 로컬 state + Supabase upsert 시도 --
// SQL for creating the table (run in Supabase if not exists):
/*
CREATE TABLE IF NOT EXISTS costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  subcategory TEXT,
  cost_type TEXT NOT NULL DEFAULT 'fixed' CHECK (cost_type IN ('fixed', 'variable')),
  title TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  cost_date DATE NOT NULL DEFAULT CURRENT_DATE,
  year INT NOT NULL,
  month INT NOT NULL,
  vendor TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated crud costs" ON costs FOR ALL TO authenticated USING (true) WITH CHECK (true);
*/

const FIXED_CATEGORIES = [
  { value: '임대료', label: '임대료' },
  { value: '인건비', label: '인건비' },
  { value: '보험료', label: '보험료' },
  { value: '감가상각비', label: '감가상각비' },
  { value: '관리비', label: '관리비' },
  { value: '기타고정비', label: '기타 고정비' },
]
const VARIABLE_CATEGORIES = [
  { value: '장비구매', label: '장비구매' },
  { value: '통신비', label: '통신비' },
  { value: '출장비', label: '출장비' },
  { value: '소프트웨어', label: '소프트웨어/라이선스' },
  { value: '외주비', label: '외주비' },
  { value: '마케팅비', label: '마케팅비' },
  { value: '소모품', label: '소모품' },
  { value: '기타변동비', label: '기타 변동비' },
]
const ALL_CATEGORIES = [...FIXED_CATEGORIES, ...VARIABLE_CATEGORIES]

const COST_TYPE_OPTIONS = [
  { value: 'fixed', label: '고정비' },
  { value: 'variable', label: '변동비' },
]

interface Cost {
  id: string
  category: string
  subcategory: string | null
  cost_type: 'fixed' | 'variable'
  title: string
  amount: number
  cost_date: string
  year: number
  month: number
  vendor: string | null
  notes: string | null
  created_at: string
}

export default function CostsPage() {
  const [costs, setCosts] = useState<Cost[]>([])
  const [loading, setLoading] = useState(true)
  const [tableExists, setTableExists] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(0) // 0 = all months
  const [typeFilter, setTypeFilter] = useState('전체')
  const [searchQuery, setSearchQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCost, setEditingCost] = useState<Cost | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteModal, setDeleteModal] = useState<Cost | null>(null)
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()

  const [form, setForm] = useState({
    cost_type: 'fixed' as string,
    category: '',
    title: '',
    amount: '',
    cost_date: new Date().toISOString().split('T')[0],
    vendor: '',
    notes: '',
  })

  const fetchCosts = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('costs')
        .select('*')
        .eq('year', year)
        .order('cost_date', { ascending: false })

      if (month > 0) query = query.eq('month', month)

      const { data, error } = await query
      if (error) {
        if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
          setTableExists(false)
          setCosts([])
        } else {
          console.error('Fetch costs error:', error)
        }
      } else {
        setTableExists(true)
        setCosts(data || [])
      }
    } catch (err) {
      console.error('fetchCosts error:', err)
    }
    setLoading(false)
  }, [year, month])

  useEffect(() => { fetchCosts() }, [fetchCosts])

  const categoryOptions = useMemo(() => {
    return form.cost_type === 'fixed' ? FIXED_CATEGORIES : VARIABLE_CATEGORIES
  }, [form.cost_type])

  // Filtered data
  const filtered = useMemo(() => {
    let result = costs
    if (typeFilter !== '전체') result = result.filter(c => c.cost_type === typeFilter)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.vendor?.toLowerCase().includes(q)
      )
    }
    return result
  }, [costs, typeFilter, searchQuery])

  // Summary stats
  const totalCosts = costs.reduce((s, c) => s + Number(c.amount || 0), 0)
  const fixedCosts = costs.filter(c => c.cost_type === 'fixed').reduce((s, c) => s + Number(c.amount || 0), 0)
  const variableCosts = costs.filter(c => c.cost_type === 'variable').reduce((s, c) => s + Number(c.amount || 0), 0)

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    costs.forEach(c => {
      map[c.category] = (map[c.category] || 0) + Number(c.amount || 0)
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [costs])

  // Monthly breakdown
  const monthlyBreakdown = useMemo(() => {
    const map: Record<number, { fixed: number; variable: number }> = {}
    for (let m = 1; m <= 12; m++) map[m] = { fixed: 0, variable: 0 }
    costs.forEach(c => {
      if (map[c.month]) {
        if (c.cost_type === 'fixed') map[c.month].fixed += Number(c.amount || 0)
        else map[c.month].variable += Number(c.amount || 0)
      }
    })
    return map
  }, [costs])

  const openNew = () => {
    setEditingCost(null)
    setForm({
      cost_type: 'fixed',
      category: '',
      title: '',
      amount: '',
      cost_date: new Date().toISOString().split('T')[0],
      vendor: '',
      notes: '',
    })
    setModalOpen(true)
  }

  const openEdit = (cost: Cost) => {
    setEditingCost(cost)
    setForm({
      cost_type: cost.cost_type,
      category: cost.category,
      title: cost.title,
      amount: String(cost.amount),
      cost_date: cost.cost_date || new Date().toISOString().split('T')[0],
      vendor: cost.vendor || '',
      notes: cost.notes || '',
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('항목명을 입력해주세요.'); return }
    if (!form.category) { toast.error('카테고리를 선택해주세요.'); return }
    if (!form.amount || Number(form.amount) <= 0) { toast.error('금액을 입력해주세요.'); return }

    setSaving(true)
    try {
      const dateObj = new Date(form.cost_date)
      const payload = {
        cost_type: form.cost_type,
        category: form.category,
        title: form.title,
        amount: Number(form.amount),
        cost_date: form.cost_date,
        year: dateObj.getFullYear(),
        month: dateObj.getMonth() + 1,
        vendor: form.vendor || null,
        notes: form.notes || null,
      }

      if (editingCost) {
        const { error } = await supabase.from('costs').update(payload).eq('id', editingCost.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('costs').insert(payload)
        if (error) throw error
      }

      toast.success(editingCost ? '비용이 수정되었습니다.' : '비용이 등록되었습니다.')
      setModalOpen(false)
      fetchCosts()
    } catch (err: any) {
      console.error('Save error:', err)
      toast.error('저장에 실패했습니다: ' + (err?.message || ''))
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteModal) return
    setDeleting(true)
    const { error } = await supabase.from('costs').delete().eq('id', deleteModal.id)
    if (error) {
      toast.error('삭제에 실패했습니다.')
    } else {
      toast.success('비용이 삭제되었습니다.')
      setDeleteModal(null)
      fetchCosts()
    }
    setDeleting(false)
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => ({ value: String(new Date().getFullYear() - i), label: `${new Date().getFullYear() - i}년` }))
  const monthOptions = [
    { value: '0', label: '전체 월' },
    ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}월` }))
  ]
  const typeFilterOptions = [
    { value: '전체', label: '전체' },
    { value: 'fixed', label: '고정비' },
    { value: 'variable', label: '변동비' },
  ]

  if (!tableExists) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">매입/비용 관리</h1>
        </div>
        <div className="card p-12 text-center">
          <Wallet className="w-12 h-12 text-text-placeholder mx-auto mb-4" />
          <p className="text-text-secondary mb-2">비용 관리 테이블이 아직 생성되지 않았습니다.</p>
          <p className="text-sm text-text-tertiary mb-4">Supabase에서 costs 테이블을 먼저 생성해주세요.</p>
          <pre className="text-xs text-left bg-surface-tertiary p-4 rounded-lg max-w-lg mx-auto overflow-auto text-text-secondary">
{`CREATE TABLE costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  subcategory TEXT,
  cost_type TEXT NOT NULL DEFAULT 'fixed',
  title TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  cost_date DATE NOT NULL DEFAULT CURRENT_DATE,
  year INT NOT NULL,
  month INT NOT NULL,
  vendor TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);`}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">매입/비용 관리</h1>
        <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> 비용 등록</Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><Wallet className="w-4 h-4 text-primary-500" /><span className="stat-label">총 비용</span></div>
          <div className="stat-value">{formatCurrency(totalCosts)}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><Building2 className="w-4 h-4 text-blue-500" /><span className="stat-label">고정비</span></div>
          <div className="stat-value text-blue-600">{formatCurrency(fixedCosts)}</div>
          <div className="text-xs text-text-tertiary mt-1">{totalCosts > 0 ? Math.round(fixedCosts / totalCosts * 100) : 0}%</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><Wrench className="w-4 h-4 text-orange-500" /><span className="stat-label">변동비</span></div>
          <div className="stat-value text-orange-600">{formatCurrency(variableCosts)}</div>
          <div className="text-xs text-text-tertiary mt-1">{totalCosts > 0 ? Math.round(variableCosts / totalCosts * 100) : 0}%</div>
        </div>
      </div>

      {/* Monthly Overview */}
      {month === 0 && (
        <div className="card p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">월별 비용 추이</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 text-text-secondary">구분</th>
                  {Array.from({ length: 12 }, (_, i) => (
                    <th key={i} className="text-right py-2 px-2 text-text-secondary">{i + 1}월</th>
                  ))}
                  <th className="text-right py-2 px-2 text-gray-700 font-semibold">합계</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-2 px-2 text-blue-600 font-medium">고정비</td>
                  {Array.from({ length: 12 }, (_, i) => (
                    <td key={i} className="text-right py-2 px-2">{monthlyBreakdown[i + 1]?.fixed ? formatCurrency(monthlyBreakdown[i + 1].fixed) : '-'}</td>
                  ))}
                  <td className="text-right py-2 px-2 font-semibold">{formatCurrency(fixedCosts)}</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 px-2 text-orange-600 font-medium">변동비</td>
                  {Array.from({ length: 12 }, (_, i) => (
                    <td key={i} className="text-right py-2 px-2">{monthlyBreakdown[i + 1]?.variable ? formatCurrency(monthlyBreakdown[i + 1].variable) : '-'}</td>
                  ))}
                  <td className="text-right py-2 px-2 font-semibold">{formatCurrency(variableCosts)}</td>
                </tr>
                <tr>
                  <td className="py-2 px-2 font-semibold">합계</td>
                  {Array.from({ length: 12 }, (_, i) => {
                    const t = (monthlyBreakdown[i + 1]?.fixed || 0) + (monthlyBreakdown[i + 1]?.variable || 0)
                    return <td key={i} className="text-right py-2 px-2 font-semibold">{t > 0 ? formatCurrency(t) : '-'}</td>
                  })}
                  <td className="text-right py-2 px-2 font-bold text-primary-600">{formatCurrency(totalCosts)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {categoryBreakdown.length > 0 && (
        <div className="card p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">카테고리별 비용</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {categoryBreakdown.map(([cat, amt]) => {
              const catLabel = ALL_CATEGORIES.find(c => c.value === cat)?.label || cat
              const isFixed = FIXED_CATEGORIES.some(c => c.value === cat)
              return (
                <div key={cat} className="flex items-center justify-between p-3 bg-surface-tertiary rounded-lg">
                  <div>
                    <div className="text-xs text-text-secondary">{catLabel}</div>
                    <div className="text-sm font-semibold">{formatCurrency(amt)}</div>
                  </div>
                  <Badge className={isFixed ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}>
                    {isFixed ? '고정' : '변동'}
                  </Badge>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-200" placeholder="항목명, 카테고리, 거래처 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <Select options={typeFilterOptions} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-24" />
        <Select options={yearOptions} value={String(year)} onChange={(e) => setYear(Number(e.target.value))} className="w-28" />
        <Select options={monthOptions} value={String(month)} onChange={(e) => setMonth(Number(e.target.value))} className="w-28" />
      </div>

      {/* Costs Table */}
      {loading ? <Loading /> : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <TrendingDown className="w-12 h-12 text-text-placeholder mx-auto mb-4" />
          <p className="text-text-secondary mb-2">등록된 비용이 없습니다.</p>
          <p className="text-sm text-text-tertiary">상단의 &apos;비용 등록&apos; 버튼으로 비용을 추가할 수 있습니다.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-tertiary border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">날짜</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">구분</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">카테고리</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">항목명</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">거래처</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-text-secondary">금액</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-text-secondary">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((cost) => (
                <tr key={cost.id} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-4 py-3 text-text-secondary">{formatDate(cost.cost_date, 'MM/dd')}</td>
                  <td className="px-4 py-3">
                    <Badge className={cost.cost_type === 'fixed' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}>
                      {cost.cost_type === 'fixed' ? '고정' : '변동'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{ALL_CATEGORIES.find(c => c.value === cost.category)?.label || cost.category}</td>
                  <td className="px-4 py-3 font-medium">{cost.title}</td>
                  <td className="px-4 py-3 text-text-secondary">{cost.vendor || '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(cost.amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(cost)} className="p-1 text-text-tertiary hover:text-primary-600 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDeleteModal(cost)} className="p-1 text-text-tertiary hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingCost ? '비용 수정' : '비용 등록'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="구분 *"
              value={form.cost_type}
              onChange={(e) => {
                setForm(f => ({ ...f, cost_type: e.target.value, category: '' }))
              }}
              options={COST_TYPE_OPTIONS}
            />
            <Select
              label="카테고리 *"
              value={form.category}
              onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
              options={categoryOptions}
              placeholder="카테고리 선택"
            />
          </div>
          <Input
            label="항목명 *"
            value={form.title}
            onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="비용 항목명"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="금액 (원) *"
              type="number"
              value={form.amount}
              onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="0"
            />
            <Input
              label="비용 발생일 *"
              type="date"
              value={form.cost_date}
              onChange={(e) => setForm(f => ({ ...f, cost_date: e.target.value }))}
            />
          </div>
          <Input
            label="거래처"
            value={form.vendor}
            onChange={(e) => setForm(f => ({ ...f, vendor: e.target.value }))}
            placeholder="거래처명"
          />
          <Textarea
            label="비고"
            value={form.notes}
            onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="메모"
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>취소</Button>
            <Button size="sm" loading={saving} onClick={handleSave}>{editingCost ? '수정' : '등록'}</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="비용 삭제">
        <p className="text-sm text-text-secondary mb-4">
          <strong>{deleteModal?.title}</strong> ({deleteModal ? formatCurrency(deleteModal.amount) : ''})을(를) 정말 삭제하시겠습니까?
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setDeleteModal(null)}>취소</Button>
          <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>삭제</Button>
        </div>
      </Modal>
    </div>
  )
}
