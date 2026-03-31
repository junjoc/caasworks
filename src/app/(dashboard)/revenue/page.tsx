'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/components/ui/loading'
import { Select } from '@/components/ui/select'
import { SearchSelect } from '@/components/ui/search-select'
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

interface SiteGroup {
  site_name: string
  services: ProjectRevenue[]
  months: Record<number, number>
  total: number
}

interface RevenueSummary {
  customer_name: string
  customer_id: string
  company_type: string | null
  months: Record<number, number>
  total: number
  projects: ProjectRevenue[]
  siteGroups: SiteGroup[]
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
  const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set())
  const supabase = createClient()

  // CRUD state
  const [showAddModal, setShowAddModal] = useState(false)
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'amount' | 'is_confirmed' } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  // Inline create for empty cells
  const [creatingCell, setCreatingCell] = useState<{ customerId: string; projectId: string; month: number } | null>(null)
  const [createValue, setCreateValue] = useState('')
  // Add service to project
  const [addServiceTarget, setAddServiceTarget] = useState<{ customerId: string; siteName: string } | null>(null)
  const [newServiceName, setNewServiceName] = useState('')
  const [newServiceAmount, setNewServiceAmount] = useState('')
  const [savingService, setSavingService] = useState(false)

  // Customers & projects for dropdowns
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [allProjects, setAllProjects] = useState<ProjectOption[]>([])

  // raw revenue records for editing
  const [rawRecords, setRawRecords] = useState<RevenueRecord[]>([])

  const fetchRevenue = useCallback(async () => {
    setLoading(true)
    try {
      // Paginated fetch to bypass Supabase 1000-row default limit
      let revenues: any[] = []
      let from = 0
      const batchSize = 1000
      while (true) {
        const { data, error } = await supabase
          .from('monthly_revenues')
          .select('*, customer:customers(company_name, company_type), project:projects(project_name, service_type)')
          .eq('year', year)
          .order('month')
          .range(from, from + batchSize - 1)
        if (error || !data || data.length === 0) break
        revenues = revenues.concat(data)
        if (data.length < batchSize) break
        from += batchSize
      }

      setRawRecords(revenues as RevenueRecord[])

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
            siteGroups: [],
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

      // Build siteGroups for each customer: group projects by base name (before " - ")
      Array.from(customerMap.values()).forEach((cust) => {
        const siteMap = new Map<string, SiteGroup>()
        for (const proj of cust.projects) {
          const dashIdx = proj.project_name.indexOf(' - ')
          const siteName = dashIdx > 0 ? proj.project_name.substring(0, dashIdx) : proj.project_name
          if (!siteMap.has(siteName)) {
            siteMap.set(siteName, { site_name: siteName, services: [], months: {}, total: 0 })
          }
          const sg = siteMap.get(siteName)!
          sg.services.push(proj)
          sg.total += proj.total
          for (const [m, cell] of Object.entries(proj.months)) {
            sg.months[Number(m)] = (sg.months[Number(m)] || 0) + cell.amount
          }
        }
        cust.siteGroups = Array.from(siteMap.values()).sort((a, b) => b.total - a.total)
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

  const toggleSite = (key: string) => {
    setExpandedSites(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
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

  // Inline create new revenue for empty cell
  const startCreate = (customerId: string, projectId: string, month: number) => {
    setCreatingCell({ customerId, projectId, month })
    setCreateValue('')
    setEditingCell(null)
  }

  const saveCreate = async () => {
    if (!creatingCell) return
    const amount = Number(createValue)
    if (isNaN(amount) || amount <= 0) {
      setCreatingCell(null)
      return
    }
    const { error } = await supabase.from('monthly_revenues').insert({
      customer_id: creatingCell.customerId,
      project_id: creatingCell.projectId,
      year,
      month: creatingCell.month,
      amount,
      is_confirmed: false,
    })
    if (error) {
      toast.error('매출 등록 실패: ' + error.message)
    } else {
      toast.success(`${creatingCell.month}월 매출 ${formatCurrency(amount)} 등록`)
      fetchRevenue()
    }
    setCreatingCell(null)
    setCreateValue('')
  }

  // Add new service (project) to a site
  const handleAddService = async () => {
    if (!addServiceTarget || !newServiceName.trim()) {
      toast.error('서비스명을 입력해주세요.')
      return
    }
    setSavingService(true)
    const projectName = `${addServiceTarget.siteName} - ${newServiceName.trim()}`
    const monthlyAmount = Number(newServiceAmount) || 0

    // Create project
    const { data: newProj, error: projErr } = await supabase.from('projects').insert({
      customer_id: addServiceTarget.customerId,
      project_name: projectName,
      service_type: newServiceName.trim(),
      monthly_amount: monthlyAmount || null,
      status: 'active',
    }).select('id').single()

    if (projErr) {
      toast.error('서비스 추가 실패: ' + projErr.message)
      setSavingService(false)
      return
    }

    // If amount provided, create current month revenue
    if (monthlyAmount > 0 && newProj) {
      await supabase.from('monthly_revenues').insert({
        customer_id: addServiceTarget.customerId,
        project_id: newProj.id,
        year,
        month: new Date().getMonth() + 1,
        amount: monthlyAmount,
        is_confirmed: false,
      })
    }

    toast.success(`"${newServiceName.trim()}" 서비스가 추가되었습니다.`)
    setAddServiceTarget(null)
    setNewServiceName('')
    setNewServiceAmount('')
    setSavingService(false)
    fetchRevenue()
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
            <thead className="bg-surface-tertiary border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase min-w-[280px]">고객사 / 현장</th>
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
              {/* 월간 매출 총액 - 최상단 */}
              {data.length > 0 && (
                <tr className="bg-surface-tertiary font-semibold border-b-2 border-gray-300 sticky top-0 z-10">
                  <td className="px-4 py-3 font-semibold">월 합계</td>
                  {monthlyTotals.map((t, i) => (
                    <td key={i} className={`text-right ${i + 1 === currentMonth && year === new Date().getFullYear() ? 'bg-blue-100/50' : ''}`}>
                      {t ? formatCurrency(t) : '-'}
                    </td>
                  ))}
                  <td className="text-right">{formatCurrency(grandTotal)}</td>
                  <td></td>
                </tr>
              )}
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
                            ? <ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" />
                            : <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" />
                          }
                          <div>
                            <span className="font-medium text-gray-900">{row.customer_name}</span>
                            {row.company_type && (
                              <span className="text-xs text-text-tertiary ml-2">{row.company_type}</span>
                            )}
                            <span className="text-xs text-text-placeholder ml-1">({row.siteGroups.length}개 현장)</span>
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

                    {/* 현장(사이트) 그룹 - 접기/펼치기 */}
                    {isExpanded && row.siteGroups.map((sg) => {
                      const siteKey = `${row.customer_id}::${sg.site_name}`
                      const isSiteExpanded = expandedSites.has(siteKey)
                      return (
                        <React.Fragment key={siteKey}>
                          {/* Site header row - clickable to expand/collapse */}
                          <tr
                            className="bg-gradient-to-r from-gray-100 to-gray-50 border-t border-gray-200 cursor-pointer hover:from-gray-150 hover:to-gray-100 transition-colors"
                            onClick={() => toggleSite(siteKey)}
                          >
                            <td className="px-4 py-2 pl-10">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {isSiteExpanded
                                    ? <ChevronDown className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                                    : <ChevronRight className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                                  }
                                  <MapPin className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                                  <span className="text-sm font-semibold text-gray-800 truncate max-w-[180px]" title={sg.site_name}>{sg.site_name}</span>
                                  <span className="text-[10px] text-text-tertiary bg-white px-1.5 py-0.5 rounded-full whitespace-nowrap">{sg.services.length}개 서비스</span>
                                </div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setAddServiceTarget({ customerId: row.customer_id, siteName: sg.site_name }) }}
                                  className="text-[10px] px-2.5 py-1 rounded-full border border-dashed border-primary-300 text-primary-500 hover:bg-primary-50 hover:border-primary-500 transition-colors whitespace-nowrap"
                                >
                                  + 서비스
                                </button>
                              </div>
                            </td>
                            {months.map((m) => (
                              <td key={m} className={`text-right text-xs px-1 font-medium text-text-secondary ${m === currentMonth && year === new Date().getFullYear() ? 'bg-blue-50/30' : ''}`}>
                                {sg.months[m] ? formatCurrency(sg.months[m]) : <span className="text-gray-200">-</span>}
                              </td>
                            ))}
                            <td className="text-right text-xs font-bold text-text-secondary">{formatCurrency(sg.total)}</td>
                            <td></td>
                          </tr>

                          {/* Service rows under this site - only when expanded */}
                          {isSiteExpanded && sg.services.sort((a, b) => b.total - a.total).map((proj) => {
                            const serviceName = proj.project_name.includes(' - ')
                              ? proj.project_name.substring(proj.project_name.indexOf(' - ') + 3)
                              : (proj.service_type || proj.project_name)
                            return (
                              <tr key={proj.project_id} className="bg-white hover:bg-blue-50/30 group">
                                <td className="px-4 py-2 pl-16">
                                  <div className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary-300 shrink-0" />
                                    <span className="text-xs text-text-secondary font-medium">{serviceName}</span>
                                  </div>
                                </td>
                                {months.map((m) => {
                                  const cell = proj.months[m]
                                  const isCurrent = m === currentMonth && year === new Date().getFullYear()
                                  if (!cell) {
                                    const isCreating = creatingCell?.projectId === proj.project_id && creatingCell?.month === m
                                    return (
                                      <td key={m} className={`text-right text-xs px-1 ${isCurrent ? 'bg-blue-50/20' : ''}`}>
                                        {isCreating ? (
                                          <input
                                            type="number"
                                            className="w-20 text-right text-xs border border-primary-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                            value={createValue}
                                            onChange={(e) => setCreateValue(e.target.value)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') saveCreate()
                                              if (e.key === 'Escape') setCreatingCell(null)
                                            }}
                                            onBlur={() => { if (createValue) saveCreate(); else setCreatingCell(null) }}
                                            autoFocus
                                            placeholder="금액"
                                          />
                                        ) : (
                                          <span
                                            className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-dashed border-gray-300 text-text-placeholder hover:bg-primary-50 hover:border-primary-400 hover:text-primary-500 cursor-pointer transition-all text-[10px]"
                                            onClick={(e) => { e.stopPropagation(); startCreate(row.customer_id, proj.project_id, m) }}
                                            title="클릭하여 매출 입력"
                                          >+</span>
                                        )}
                                      </td>
                                    )
                                  }
                                  const isEditing = editingCell?.id === cell.id && editingCell?.field === 'amount'
                                  return (
                                    <td key={m} className={`text-right text-xs px-1 ${isCurrent ? 'bg-blue-50/20' : ''}`}>
                                      {isEditing ? (
                                        <div className="flex items-center gap-0.5 justify-end">
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
                                          <button onClick={saveEdit} className="text-green-600"><Check className="w-3 h-3" /></button>
                                          <button onClick={() => setEditingCell(null)} className="text-text-tertiary"><X className="w-3 h-3" /></button>
                                        </div>
                                      ) : (
                                        <span
                                          className={`cursor-pointer hover:text-primary-600 ${cell.is_confirmed ? 'text-text-secondary' : 'text-orange-500'}`}
                                          title={cell.is_confirmed ? '확정' : '미확정'}
                                          onClick={(e) => { e.stopPropagation(); startEdit(cell.id, cell.amount) }}
                                        >
                                          {formatCurrency(cell.amount)}
                                          {!cell.is_confirmed && <span className="text-[9px] text-orange-400">*</span>}
                                        </span>
                                      )}
                                    </td>
                                  )
                                })}
                                <td className="text-right text-xs text-text-secondary font-medium">{formatCurrency(proj.total)}</td>
                                <td></td>
                              </tr>
                            )
                          })}
                        </React.Fragment>
                      )
                    })}

                    {/* 펼침 시: 삭제 확인 행 */}
                    {isExpanded && row.projects.map((proj) =>
                      months.map((m) => {
                        const cell = proj.months[m]
                        if (!cell) return null
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
            </tbody>
          </table>

          {/* 펼침된 프로젝트의 매출 레코드별 수정/삭제 버튼 (테이블 아래 범례) */}
          {expandedCustomers.size > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 text-xs text-text-tertiary flex items-center gap-4">
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

      {/* Add Service Modal */}
      <Modal open={!!addServiceTarget} onClose={() => setAddServiceTarget(null)} title={`서비스 추가 — ${addServiceTarget?.siteName || ''}`}>
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            <strong>{addServiceTarget?.siteName}</strong> 현장에 새 서비스를 추가합니다.
          </p>
          <Input
            label="서비스명 *"
            placeholder="예: AI CCTV, 안전관리, 플랫폼"
            value={newServiceName}
            onChange={(e) => setNewServiceName(e.target.value)}
            autoFocus
          />
          <Input
            label="월 과금액 (선택)"
            type="number"
            placeholder="0"
            value={newServiceAmount}
            onChange={(e) => setNewServiceAmount(e.target.value)}
          />
          {newServiceAmount && Number(newServiceAmount) > 0 && (
            <p className="text-xs text-text-secondary bg-surface-tertiary rounded-lg p-2">
              이번 달({new Date().getMonth() + 1}월) 매출 <strong className="text-primary-600">{formatCurrency(Number(newServiceAmount))}</strong>이 자동 등록됩니다.
            </p>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={() => setAddServiceTarget(null)}>취소</Button>
            <Button size="sm" loading={savingService} onClick={handleAddService}>추가</Button>
          </div>
        </div>
      </Modal>
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
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectService, setNewProjectService] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)
  const [localProjects, setLocalProjects] = useState<ProjectOption[]>(projects)
  const [form, setForm] = useState({
    customer_id: '',
    project_id: '',
    year: year,
    month: new Date().getMonth() + 1,
    amount: '',
    is_confirmed: false,
    notes: '',
    // 기간 기반 자동 생성용
    autoGenerate: false,
    startMonth: new Date().getMonth() + 1,
    endMonth: 12,
    monthlyAmount: '',
  })

  useEffect(() => {
    if (open) {
      setForm(f => ({ ...f, year, customer_id: '', project_id: '', amount: '', is_confirmed: false, notes: '', autoGenerate: false, startMonth: new Date().getMonth() + 1, endMonth: 12, monthlyAmount: '' }))
      setShowNewProject(false)
      setLocalProjects(projects)
    }
  }, [open, year, projects])

  const filteredProjects = localProjects.filter(p => p.customer_id === form.customer_id)

  // 새 프로젝트 생성
  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !form.customer_id) {
      toast.error('프로젝트명을 입력해주세요.')
      return
    }
    setCreatingProject(true)
    const { data, error } = await supabase.from('projects').insert({
      customer_id: form.customer_id,
      project_name: newProjectName.trim(),
      service_type: newProjectService || null,
      status: 'active',
    }).select('id, project_name, customer_id, service_type').single()
    setCreatingProject(false)

    if (error) {
      toast.error('프로젝트 생성 실패: ' + error.message)
    } else if (data) {
      toast.success(`프로젝트 "${data.project_name}" 생성 완료`)
      setLocalProjects(prev => [...prev, data as ProjectOption])
      setForm(f => ({ ...f, project_id: data.id }))
      setShowNewProject(false)
      setNewProjectName('')
      setNewProjectService('')
    }
  }

  const handleSave = async () => {
    if (!form.customer_id || !form.project_id) {
      toast.error('고객사와 프로젝트를 선택해주세요.')
      return
    }

    setSaving(true)

    if (form.autoGenerate) {
      // 기간 기반 자동 생성
      const monthlyAmt = Number(form.monthlyAmount)
      if (!form.monthlyAmount || isNaN(monthlyAmt) || monthlyAmt <= 0) {
        toast.error('월 과금액을 입력해주세요.')
        setSaving(false)
        return
      }
      const rows = []
      for (let m = form.startMonth; m <= form.endMonth; m++) {
        rows.push({
          customer_id: form.customer_id,
          project_id: form.project_id,
          year: form.year,
          month: m,
          amount: monthlyAmt,
          is_confirmed: false,
          notes: form.notes || null,
        })
      }
      const { error } = await supabase.from('monthly_revenues').insert(rows)
      setSaving(false)
      if (error) {
        toast.error('저장에 실패했습니다: ' + error.message)
      } else {
        toast.success(`${rows.length}개월 매출이 등록되었습니다.`)
        onSaved()
        onClose()
      }
    } else {
      // 단건 등록
      const amount = Number(form.amount)
      if (!form.amount || isNaN(amount) || amount <= 0) {
        toast.error('올바른 금액을 입력해주세요.')
        setSaving(false)
        return
      }
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
        <SearchSelect
          label="고객사"
          placeholder="고객사 검색..."
          options={customers.map(c => ({ value: c.id, label: c.company_name }))}
          value={form.customer_id}
          onChange={(val) => setForm(f => ({ ...f, customer_id: val, project_id: '' }))}
        />

        {/* 프로젝트 선택 + 새 프로젝트 버튼 */}
        <div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
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
            </div>
            {form.customer_id && (
              <button
                type="button"
                onClick={() => setShowNewProject(!showNewProject)}
                className="px-3 py-2 text-xs font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors whitespace-nowrap mb-0.5"
              >
                + 새 프로젝트
              </button>
            )}
          </div>

          {/* 새 프로젝트 인라인 폼 */}
          {showNewProject && (
            <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200 space-y-2">
              <Input
                label="프로젝트명"
                placeholder="현장명 입력"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
              <Input
                label="서비스 타입 (선택)"
                placeholder="예: AI CCTV, 플랫폼"
                value={newProjectService}
                onChange={(e) => setNewProjectService(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" size="sm" onClick={() => setShowNewProject(false)}>취소</Button>
                <Button size="sm" loading={creatingProject} onClick={handleCreateProject}>생성</Button>
              </div>
            </div>
          )}
        </div>

        {/* 등록 방식 선택 */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, autoGenerate: false }))}
            className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${!form.autoGenerate ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-text-secondary border-gray-300 hover:bg-surface-tertiary'}`}
          >
            단건 등록
          </button>
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, autoGenerate: true }))}
            className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${form.autoGenerate ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-text-secondary border-gray-300 hover:bg-surface-tertiary'}`}
          >
            기간 일괄 등록
          </button>
        </div>

        {form.autoGenerate ? (
          <>
            <Select
              label="년도"
              options={yearOptions}
              value={String(form.year)}
              onChange={(e) => setForm(f => ({ ...f, year: Number(e.target.value) }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="시작월"
                options={monthOptions}
                value={String(form.startMonth)}
                onChange={(e) => setForm(f => ({ ...f, startMonth: Number(e.target.value) }))}
              />
              <Select
                label="종료월"
                options={monthOptions}
                value={String(form.endMonth)}
                onChange={(e) => setForm(f => ({ ...f, endMonth: Number(e.target.value) }))}
              />
            </div>
            <Input
              label="월 과금액 (원)"
              type="number"
              placeholder="0"
              value={form.monthlyAmount}
              onChange={(e) => setForm(f => ({ ...f, monthlyAmount: e.target.value }))}
            />
            {form.monthlyAmount && form.startMonth <= form.endMonth && (
              <div className="text-sm text-text-secondary bg-surface-tertiary rounded-lg p-3">
                {form.startMonth}월 ~ {form.endMonth}월 ({form.endMonth - form.startMonth + 1}개월) ×{' '}
                {formatCurrency(Number(form.monthlyAmount))} ={' '}
                <span className="font-semibold text-primary-600">
                  {formatCurrency(Number(form.monthlyAmount) * (form.endMonth - form.startMonth + 1))}
                </span>
              </div>
            )}
          </>
        ) : (
          <>
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
          </>
        )}

        <Input
          label="비고"
          placeholder="메모 (선택)"
          value={form.notes}
          onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
        />

        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
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
        <SearchSelect
          label="고객사"
          placeholder="고객사 검색..."
          options={customers.map(c => ({ value: c.id, label: c.company_name }))}
          value={selectedCustomer}
          onChange={(val) => setSelectedCustomer(val)}
        />

        {selectedCustomer && filteredProjects.length === 0 && (
          <p className="text-sm text-text-secondary">이 고객사에 등록된 프로젝트가 없습니다.</p>
        )}

        {selectedCustomer && filteredProjects.length > 0 && (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-surface-tertiary">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-text-secondary min-w-[180px] sticky left-0 bg-surface-tertiary z-10">프로젝트</th>
                  {months.map(m => (
                    <th key={m} className="px-1 py-2 text-center font-medium text-text-secondary min-w-[80px]">{m}월</th>
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
          <p className="text-xs text-text-tertiary">금액을 0으로 변경하면 해당 매출 레코드가 삭제됩니다.</p>
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
          <div className="px-4 py-3 border-b border-gray-200 bg-surface-tertiary rounded-t-xl">
            <h3 className="text-sm font-semibold text-gray-800">{cust.customer_name} - 매출 상세</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface-tertiary/50">
                <tr>
                  <th className="px-4 py-2 text-left text-text-secondary">프로젝트</th>
                  <th className="px-3 py-2 text-center text-text-secondary">월</th>
                  <th className="px-3 py-2 text-right text-text-secondary">금액</th>
                  <th className="px-3 py-2 text-center text-text-secondary">확정</th>
                  <th className="px-3 py-2 text-center text-text-secondary">작업</th>
                </tr>
              </thead>
              <tbody>
                {cust.projects.map(proj =>
                  months.map(m => {
                    const cell = proj.months[m]
                    if (!cell) return null
                    const isDeleting = deleteConfirm === cell.id
                    return (
                      <tr key={cell.id} className={`border-t border-gray-100 ${isDeleting ? 'bg-red-50' : 'hover:bg-surface-tertiary'}`}>
                        <td className="px-4 py-2 text-sm text-text-secondary">{proj.project_name}</td>
                        <td className="px-3 py-2 text-center text-text-secondary">{m}월</td>
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
                                className="p-1 text-text-tertiary hover:text-primary-600 transition-colors"
                                title="수정"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => onDelete(cell.id)}
                                className="p-1 text-text-tertiary hover:text-red-600 transition-colors"
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
