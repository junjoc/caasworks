'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/components/ui/loading'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import {
  DollarSign, ChevronDown, ChevronRight, MapPin,
  Plus, Pencil, Trash2, X, Check, Grid3X3,
} from 'lucide-react'

/* ──────────── Types ──────────── */

interface RevenueRecord {
  id: string
  project_id: string
  customer_id: string
  year: number
  month: number
  amount: number
  is_confirmed: boolean
  notes: string | null
}

interface ProjectRevenue {
  project_id: string
  project_name: string
  service_type: string | null
  months: Record<number, { amount: number; id: string; is_confirmed: boolean }>
  total: number
}

interface RevenueSummary {
  customer_name: string
  customer_id: string
  company_type: string | null
  months: Record<number, number>
  total: number
  projects: ProjectRevenue[]
}

interface CustomerOption {
  id: string
  company_name: string
}

interface ProjectOption {
  id: string
  project_name: string
  customer_id: string
  service_type: string | null
}

/* ──────────── Main Page ──────────── */

export default function RevenuePage() {
  const [data, setData] = useState<RevenueSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set())
  const supabase = createClient()

  // CRUD state
  const [showAddModal, setShowAddModal] = useState(false)
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'amount' | 'is_confirmed' } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Customers & projects for dropdowns
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [allProjects, setAllProjects] = useState<ProjectOption[]>([])

  // raw revenue records for editing
  const [rawRecords, setRawRecords] = useState<RevenueRecord[]>([])

  const fetchRevenue = useCallback(async () => {
    setLoading(true)
    try {
      const { data: revenues } = await Promise.race([
        supabase
          .from('monthly_revenues')
          .select('*, customer:customers(company_name, company_type), project:projects(project_name, service_type)')
          .eq('year', year)
          .order('month'),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
      ])

      setRawRecords((revenues || []) as RevenueRecord[])

      // 고객별 -> 프로젝트별 집계
      const customerMap = new Map<string, RevenueSummary>()
      ;(revenues || []).forEach((r: any) => {
        const custKey = r.customer_id
        if (!customerMap.has(custKey)) {
          customerMap.set(custKey, {
            customer_name: r.customer?.company_name || '(알수없음)',
            customer_id: custKey,
            company_type: r.customer?.company_type || null,
            months: {},
            total: 0,
            projects: [],
          })
        }
        const cust = customerMap.get(custKey)!
        cust.months[r.month] = (cust.months[r.month] || 0) + Number(r.amount)
        cust.total += Number(r.amount)

        let proj = cust.projects.find(p => p.project_id === r.project_id)
        if (!proj) {
          proj = {
            project_id: r.project_id,
            project_name: r.project?.project_name || '(미지정)',
            service_type: r.project?.service_type || null,
            months: {},
            total: 0,
          }
          cust.projects.push(proj)
        }
        proj.months[r.month] = {
          amount: Number(r.amount),
          id: r.id,
          is_confirmed: r.is_confirmed,
        }
        proj.total += Number(r.amount)
      })

      setData(Array.from(customerMap.values()).sort((a, b) => b.total - a.total))
    } catch (err) {
      console.error('Revenue fetch error:', err)
      setData([])
    }
    setLoading(false)
  }, [year])

  useEffect(() => {
    fetchRevenue()
  }, [fetchRevenue])

  useEffect(() => {
    async function loadOptions() {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from('customers').select('id, company_name').order('company_name'),
        supabase.from('projects').select('id, project_name, customer_id, service_type').order('project_name'),
      ])
      setCustomers((c || []) as CustomerOption[])
      setAllProjects((p || []) as ProjectOption[])
    }
    loadOptions()
  }, [])

  const toggleCustomer = (id: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /* ── Inline edit handlers ── */
  const startEdit = (id: string, currentAmount: number) => {
    setEditingCell({ id, field: 'amount' })
    setEditValue(String(currentAmount))
  }

  const saveEdit = async () => {
    if (!editingCell) return
    const amount = Number(editValue)
    if (isNaN(amount) || amount < 0) {
      toast.error('올바른 금액을 입력해주세요.')
      return
    }
    const { error } = await supabase
      .from('monthly_revenues')
      .update({ amount })
      .eq('id', editingCell.id)
    if (error) {
      toast.error('수정에 실패했습니다.')
    } else {
      toast.success('매출이 수정되었습니다.')
      setEditingCell(null)
      fetchRevenue()
    }
  }

  const toggleConfirmed = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from('monthly_revenues')
      .update({ is_confirmed: !current })
      .eq('id', id)
    if (error) {
      toast.error('확정 상태 변경에 실패했습니다.')
    } else {
      toast.success(!current ? '매출이 확정되었습니다.' : '확정이 취소되었습니다.')
      fetchRevenue()
    }
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('monthly_revenues').delete().eq('id', id)
    if (error) {
      toast.error('삭제에 실패했습니다.')
    } else {
      toast.success('매출이 삭제되었습니다.')
      setDeleteConfirm(null)
      fetchRevenue()
    }
  }

  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const currentMonth = new Date().getMonth() + 1
  const grandTotal = data.reduce((sum, d) => sum + d.total, 0)
  const monthlyTotals = months.map((m) =>
    data.reduce((sum, d) => sum + (d.months[m] || 0), 0)
  )

  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const y = new Date().getFullYear() - i
    return { value: String(y), label: `${y}년` }
  })

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">매출 현황</h1>
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => setShowBatchModal(true)}>
            <Grid3X3 className="w-4 h-4 mr-1.5" />
            일괄 입력
          </Button>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            매출 등록
          </Button>
          <Select
            value={String(year)}
            onChange={(e) => setYear(Number(e.target.value))}
            options={yearOptions}
            className="w-32"
          />
        </div>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-primary-600" />
            <span className="stat-label">연간 매출</span>
          </div>
          <div className="stat-value">{formatCurrency(grandTotal)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">고객 수</div>
          <div className="stat-value">{data.length}사</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">월 평균</div>
          <div className="stat-value">{formatCurrency(grandTotal / 12)}</div>
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[200px]">고객사 / 현장</th>
                {months.map((m) => (
                  <th key={m} className={`text-center min-w-[90px] ${m === currentMonth && year === new Date().getFullYear() ? 'bg-blue-50' : ''}`}>
                    {m}월
                  </th>
                ))}
                <th className="text-right min-w-[110px]">합계</th>
                <th className="text-center min-w-[60px]"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const isExpanded = expandedCustomers.has(row.customer_id)
                return (
                  <React.Fragment key={row.customer_id}>
                    {/* 고객사 행 */}
                    <tr
                      className="cursor-pointer hover:bg-blue-50/50 transition-colors"
                      onClick={() => toggleCustomer(row.customer_id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                            : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                          }
                          <div>
                            <span className="font-medium text-gray-900">{row.customer_name}</span>
                            {row.company_type && (
                              <span className="text-xs text-gray-400 ml-2">{row.company_type}</span>
                            )}
                            <span className="text-xs text-gray-300 ml-1">({row.projects.length}개 현장)</span>
                          </div>
                        </div>
                      </td>
                      {months.map((m) => (
                        <td key={m} className={`text-right text-sm ${m === currentMonth && year === new Date().getFullYear() ? 'bg-blue-50/30' : ''}`}>
                          {row.months[m] ? formatCurrency(row.months[m]) : <span className="text-gray-200">-</span>}
                        </td>
                      ))}
                      <td className="text-right font-semibold">{formatCurrency(row.total)}</td>
                      <td></td>
                    </tr>

                    {/* 프로젝트 상세 행 (펼침) */}
                    {isExpanded && row.projects.sort((a, b) => b.total - a.total).map((proj) => (
                      <tr key={proj.project_id} className="bg-gray-50/70 group">
                        <td className="px-4 py-3 pl-10">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                            <div>
                              <span className="text-sm text-gray-700">{proj.project_name}</span>
                              {proj.service_type && (
                                <span className="text-xs text-blue-500 ml-2 bg-blue-50 px-1.5 py-0.5 rounded">
                                  {proj.service_type}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        {months.map((m) => {
                          const cell = proj.months[m]
                          if (!cell) {
                            return (
                              <td key={m} className={`text-right text-xs text-gray-500 ${m === currentMonth && year === new Date().getFullYear() ? 'bg-blue-50/20' : ''}`}>
                                <span className="text-gray-200">-</span>
                              </td>
                            )
                          }
                          const isEditing = editingCell?.id === cell.id && editingCell?.field === 'amount'
                          return (
                            <td key={m} className={`text-right text-xs relative ${m === currentMonth && year === new Date().getFullYear() ? 'bg-blue-50/20' : ''}`}>
                              {isEditing ? (
                                <div className="flex items-center gap-1 justify-end">
                                  <input
                                    type="number"
                                    className="w-20 text-right text-xs border border-primary-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveEdit()
                                      if (e.key === 'Escape') setEditingCell(null)
                                    }}
                                    autoFocus
                                  />
                                  <button onClick={saveEdit} className="text-green-600 hover:text-green-800">
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => setEditingCell(null)} className="text-gray-400 hover:text-gray-600">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 justify-end">
                                  <span
                                    className={`cursor-pointer hover:text-primary-600 ${cell.is_confirmed ? 'text-gray-600' : 'text-orange-500'}`}
                                    title={cell.is_confirmed ? '확정' : '미확정 - 클릭하여 수정'}
                                    onClick={(e) => { e.stopPropagation(); startEdit(cell.id, cell.amount) }}
                                  >
                                    {formatCurrency(cell.amount)}
                                  </span>
                                  {!cell.is_confirmed && (
                                    <span className="text-[10px] text-orange-400" title="미확정">*</span>
                                  )}
                                </div>
                              )}
                            </td>
                          )
                        })}
                        <td className="text-right text-sm text-gray-600">{formatCurrency(proj.total)}</td>
                        <td className="text-center">
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* 개별 행 actions: 각 월별 셀에서 인라인 편집 가능, 여기서는 프로젝트 전체에 대한 actions */}
                          </div>
                        </td>
                      </tr>
                    ))}

                    {/* 펼침 시: 월별 행 단위 편집/삭제 */}
                    {isExpanded && row.projects.map((proj) =>
                      months.map((m) => {
                        const cell = proj.months[m]
                        if (!cell) return null
                        // 삭제 확인 모달
                        if (deleteConfirm === cell.id) {
                          return (
                            <tr key={`del-${cell.id}`} className="bg-red-50">
                              <td colSpan={15} className="px-4 py-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-red-700">
                                    {proj.project_name} - {m}월 매출 ({formatCurrency(cell.amount)}) 을 삭제하시겠습니까?
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <Button variant="danger" size="sm" onClick={() => handleDelete(cell.id)}>
                                      삭제
                                    </Button>
                                    <Button variant="secondary" size="sm" onClick={() => setDeleteConfirm(null)}>
                                      취소
                                    </Button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )
                        }
                        return null
                      })
                    )}
                  </React.Fragment>
                )
              })}
              {data.length > 0 && (
                <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                  <td className="px-4 py-3 font-semibold">합계</td>
                  {monthlyTotals.map((t, i) => (
                    <td key={i} className={`text-right ${i + 1 === currentMonth && year === new Date().getFullYear() ? 'bg-blue-100/50' : ''}`}>
                      {t ? formatCurrency(t) : '-'}
                    </td>
                  ))}
                  <td className="text-right">{formatCurrency(grandTotal)}</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>

          {/* 펼침된 프로젝트의 매출 레코드별 수정/삭제 버튼 (테이블 아래 범례) */}
          {expandedCustomers.size > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 flex items-center gap-4">
              <span>* 미확정 매출</span>
              <span>셀 금액 클릭 = 수정</span>
            </div>
          )}
        </div>
      )}

      {/* 매출 등록 모달 */}
      <AddRevenueModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        customers={customers}
        projects={allProjects}
        year={year}
        onSaved={fetchRevenue}
      />

      {/* 일괄 입력 모달 */}
      <BatchRevenueModal
        open={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        customers={customers}
        projects={allProjects}
        year={year}
        existingRecords={rawRecords}
        onSaved={fetchRevenue}
      />

      {/* 펼침된 프로젝트의 월별 상세 패널 */}
      {expandedCustomers.size > 0 && (
        <RevenueDetailPanel
          data={data}
          expandedCustomers={expandedCustomers}
          year={year}
          onEdit={startEdit}
          onDelete={(id) => setDeleteConfirm(id)}
          onToggleConfirm={toggleConfirmed}
          deleteConfirm={deleteConfirm}
          onDeleteConfirm={handleDelete}
          onDeleteCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}

/* ──────────── Add Revenue Modal ──────────── */

function AddRevenueModal({
  open, onClose, customers, projects, year, onSaved,
}: {
  open: boolean
  onClose: () => void
  customers: CustomerOption[]
  projects: ProjectOption[]
  year: number
  onSaved: () => void
}) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    customer_id: '',
    project_id: '',
    year: year,
    month: new Date().getMonth() + 1,
    amount: '',
    is_confirmed: false,
    notes: '',
  })

  useEffect(() => {
    if (open) {
      setForm(f => ({ ...f, year, customer_id: '', project_id: '', amount: '', is_confirmed: false, notes: '' }))
    }
  }, [open, year])

  const filteredProjects = projects.filter(p => p.customer_id === form.customer_id)

  const handleSave = async () => {
    if (!form.customer_id || !form.project_id) {
      toast.error('고객사와 프로젝트를 선택해주세요.')
      return
    }
    const amount = Number(form.amount)
    if (!form.amount || isNaN(amount) || amount <= 0) {
      toast.error('올바른 금액을 입력해주세요.')
      return
    }

    setSaving(true)
    const { error } = await supabase.from('monthly_revenues').insert({
      customer_id: form.customer_id,
      project_id: form.project_id,
      year: form.year,
      month: form.month,
      amount,
      is_confirmed: form.is_confirmed,
      notes: form.notes || null,
    })
    setSaving(false)

    if (error) {
      toast.error('저장에 실패했습니다: ' + error.message)
    } else {
      toast.success('매출이 등록되었습니다.')
      onSaved()
      onClose()
    }
  }

  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1}월`,
  }))

  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const y = new Date().getFullYear() - i
    return { value: String(y), label: `${y}년` }
  })

  return (
    <Modal open={open} onClose={onClose} title="매출 등록">
      <div className="space-y-4">
        <Select
          label="고객사"
          placeholder="고객사 선택"
          options={customers.map(c => ({ value: c.id, label: c.company_name }))}
          value={form.customer_id}
          onChange={(e) => setForm(f => ({ ...f, customer_id: e.target.value, project_id: '' }))}
        />

        <Select
          label="프로젝트 / 현장"
          placeholder={form.customer_id ? '프로젝트 선택' : '먼저 고객사를 선택하세요'}
          options={filteredProjects.map(p => ({
            value: p.id,
            label: `${p.project_name}${p.service_type ? ` (${p.service_type})` : ''}`,
          }))}
          value={form.project_id}
          onChange={(e) => setForm(f => ({ ...f, project_id: e.target.value }))}
          disabled={!form.customer_id}
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="년도"
            options={yearOptions}
            value={String(form.year)}
            onChange={(e) => setForm(f => ({ ...f, year: Number(e.target.value) }))}
          />
          <Select
            label="월"
            options={monthOptions}
            value={String(form.month)}
            onChange={(e) => setForm(f => ({ ...f, month: Number(e.target.value) }))}
          />
        </div>

        <Input
          label="금액 (원)"
          type="number"
          placeholder="0"
          value={form.amount}
          onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
        />

        <Input
          label="비고"
          placeholder="메모 (선택)"
          value={form.notes}
          onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
        />

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_confirmed}
            onChange={(e) => setForm(f => ({ ...f, is_confirmed: e.target.checked }))}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          매출 확정
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button onClick={handleSave} loading={saving}>저장</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ──────────── Batch Revenue Modal (스프레드시트 스타일) ──────────── */

function BatchRevenueModal({
  open, onClose, customers, projects, year, existingRecords, onSaved,
}: {
  open: boolean
  onClose: () => void
  customers: CustomerOption[]
  projects: ProjectOption[]
  year: number
  existingRecords: RevenueRecord[]
  onSaved: () => void
}) {
  const supabase = createClient()
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [saving, setSaving] = useState(false)
  // grid: projectId -> month -> amount string
  const [grid, setGrid] = useState<Record<string, Record<number, string>>>({})
  // track which cells are confirmed
  const [confirmedGrid, setConfirmedGrid] = useState<Record<string, Record<number, boolean>>>({})
  // track which cells have existing record IDs
  const [idGrid, setIdGrid] = useState<Record<string, Record<number, string>>>({})

  const filteredProjects = projects.filter(p => p.customer_id === selectedCustomer)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  useEffect(() => {
    if (!selectedCustomer) {
      setGrid({})
      setConfirmedGrid({})
      setIdGrid({})
      return
    }
    // populate grid from existing records
    const newGrid: Record<string, Record<number, string>> = {}
    const newConfirmed: Record<string, Record<number, boolean>> = {}
    const newIds: Record<string, Record<number, string>> = {}
    filteredProjects.forEach(p => {
      newGrid[p.id] = {}
      newConfirmed[p.id] = {}
      newIds[p.id] = {}
    })
    existingRecords
      .filter(r => r.customer_id === selectedCustomer && r.year === year)
      .forEach(r => {
        if (!newGrid[r.project_id]) {
          newGrid[r.project_id] = {}
          newConfirmed[r.project_id] = {}
          newIds[r.project_id] = {}
        }
        newGrid[r.project_id][r.month] = String(r.amount)
        newConfirmed[r.project_id][r.month] = r.is_confirmed
        newIds[r.project_id][r.month] = r.id
      })
    setGrid(newGrid)
    setConfirmedGrid(newConfirmed)
    setIdGrid(newIds)
  }, [selectedCustomer, existingRecords, year])

  const updateCell = (projectId: string, month: number, value: string) => {
    setGrid(prev => ({
      ...prev,
      [projectId]: { ...prev[projectId], [month]: value },
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    let insertCount = 0
    let updateCount = 0
    let errorCount = 0

    for (const projectId of Object.keys(grid)) {
      for (const m of months) {
        const val = grid[projectId]?.[m]
        const existingId = idGrid[projectId]?.[m]
        const amount = val ? Number(val) : 0

        if (existingId && amount > 0) {
          // update existing
          const { error } = await supabase
            .from('monthly_revenues')
            .update({ amount })
            .eq('id', existingId)
          if (error) errorCount++
          else updateCount++
        } else if (existingId && amount === 0) {
          // delete if amount set to 0
          const { error } = await supabase
            .from('monthly_revenues')
            .delete()
            .eq('id', existingId)
          if (error) errorCount++
        } else if (!existingId && amount > 0) {
          // insert new
          const { error } = await supabase
            .from('monthly_revenues')
            .insert({
              customer_id: selectedCustomer,
              project_id: projectId,
              year,
              month: m,
              amount,
              is_confirmed: false,
            })
          if (error) errorCount++
          else insertCount++
        }
      }
    }

    setSaving(false)
    if (errorCount > 0) {
      toast.error(`${errorCount}건 저장 실패`)
    }
    if (insertCount + updateCount > 0) {
      toast.success(`${insertCount}건 추가, ${updateCount}건 수정 완료`)
    }
    onSaved()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`일괄 매출 입력 - ${year}년`} className="max-w-6xl">
      <div className="space-y-4">
        <Select
          label="고객사"
          placeholder="고객사 선택"
          options={customers.map(c => ({ value: c.id, label: c.company_name }))}
          value={selectedCustomer}
          onChange={(e) => setSelectedCustomer(e.target.value)}
        />

        {selectedCustomer && filteredProjects.length === 0 && (
          <p className="text-sm text-gray-500">이 고객사에 등록된 프로젝트가 없습니다.</p>
        )}

        {selectedCustomer && filteredProjects.length > 0 && (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 min-w-[180px] sticky left-0 bg-gray-50 z-10">프로젝트</th>
                  {months.map(m => (
                    <th key={m} className="px-1 py-2 text-center font-medium text-gray-600 min-w-[80px]">{m}월</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map(proj => (
                  <tr key={proj.id} className="border-t border-gray-100 hover:bg-blue-50/30">
                    <td className="px-3 py-2 text-sm text-gray-800 sticky left-0 bg-white z-10">
                      <div>
                        {proj.project_name}
                        {proj.service_type && (
                          <span className="text-xs text-blue-500 ml-1">({proj.service_type})</span>
                        )}
                      </div>
                    </td>
                    {months.map(m => (
                      <td key={m} className="px-1 py-1">
                        <input
                          type="number"
                          className="w-full text-right text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400"
                          placeholder="0"
                          value={grid[proj.id]?.[m] || ''}
                          onChange={(e) => updateCell(proj.id, m, e.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-400">금액을 0으로 변경하면 해당 매출 레코드가 삭제됩니다.</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>취소</Button>
            <Button onClick={handleSave} loading={saving} disabled={!selectedCustomer || filteredProjects.length === 0}>
              일괄 저장
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ──────────── Revenue Detail Panel (펼침 시 레코드별 수정/삭제) ──────────── */

function RevenueDetailPanel({
  data, expandedCustomers, year, onEdit, onDelete, onToggleConfirm,
  deleteConfirm, onDeleteConfirm, onDeleteCancel,
}: {
  data: RevenueSummary[]
  expandedCustomers: Set<string>
  year: number
  onEdit: (id: string, amount: number) => void
  onDelete: (id: string) => void
  onToggleConfirm: (id: string, current: boolean) => void
  deleteConfirm: string | null
  onDeleteConfirm: (id: string) => void
  onDeleteCancel: () => void
}) {
  const expandedData = data.filter(d => expandedCustomers.has(d.customer_id))
  if (expandedData.length === 0) return null

  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="mt-6 space-y-4">
      {expandedData.map(cust => (
        <div key={cust.customer_id} className="card">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-xl">
            <h3 className="text-sm font-semibold text-gray-800">{cust.customer_name} - 매출 상세</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-4 py-2 text-left text-gray-600">프로젝트</th>
                  <th className="px-3 py-2 text-center text-gray-600">월</th>
                  <th className="px-3 py-2 text-right text-gray-600">금액</th>
                  <th className="px-3 py-2 text-center text-gray-600">확정</th>
                  <th className="px-3 py-2 text-center text-gray-600">작업</th>
                </tr>
              </thead>
              <tbody>
                {cust.projects.map(proj =>
                  months.map(m => {
                    const cell = proj.months[m]
                    if (!cell) return null
                    const isDeleting = deleteConfirm === cell.id
                    return (
                      <tr key={cell.id} className={`border-t border-gray-100 ${isDeleting ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                        <td className="px-4 py-2 text-sm text-gray-700">{proj.project_name}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{m}월</td>
                        <td className="px-3 py-2 text-right font-medium">{formatCurrency(cell.amount)}</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => onToggleConfirm(cell.id, cell.is_confirmed)}
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                              cell.is_confirmed
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                            }`}
                          >
                            {cell.is_confirmed ? '확정' : '미확정'}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isDeleting ? (
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="danger" size="sm" onClick={() => onDeleteConfirm(cell.id)}>
                                삭제
                              </Button>
                              <Button variant="secondary" size="sm" onClick={onDeleteCancel}>
                                취소
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => onEdit(cell.id, cell.amount)}
                                className="p-1 text-gray-400 hover:text-primary-600 transition-colors"
                                title="수정"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => onDelete(cell.id)}
                                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                                title="삭제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
