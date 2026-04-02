'use client'

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
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
  Plus, Search, X, Copy, MoreHorizontal, ExternalLink,
} from 'lucide-react'

/* ──────────── Constants ──────────── */

const SERVICE_TYPE_OPTIONS = [
  { value: '플랫폼', label: '플랫폼', color: 'bg-gray-800 text-white' },
  { value: 'AI CCTV', label: 'AI CCTV', color: 'bg-red-500 text-white' },
  { value: 'Wearable', label: 'Wearable', color: 'bg-orange-500 text-white' },
  { value: 'LTE/인터넷', label: 'LTE/인터넷', color: 'bg-yellow-500 text-white' },
  { value: 'Mobile AP', label: 'Mobile AP', color: 'bg-purple-500 text-white' },
  { value: 'Story Book', label: 'Story Book', color: 'bg-blue-500 text-white' },
]

const SITE_CATEGORY_OPTIONS = [
  { value: '민간', label: '민간' },
  { value: '공공', label: '공공' },
]

const SITE_CATEGORY2_OPTIONS = [
  { value: '신축공사', label: '신축공사' },
  { value: '리모델링·인테리어', label: '리모델링·인테리어' },
  { value: '해체·철거공사', label: '해체·철거공사' },
]

const BILLING_METHOD_OPTIONS = [
  { value: '구독(월간)', label: '구독(월간)' },
  { value: '무상이용', label: '무상이용' },
  { value: '연간', label: '연간' },
]

function getServiceColor(serviceType: string | null) {
  const opt = SERVICE_TYPE_OPTIONS.find(o => o.value === serviceType)
  return opt?.color || 'bg-gray-200 text-gray-700'
}

/* ──────────── Types ──────────── */

interface ProjectRow {
  id: string
  customer_id: string
  project_name: string
  project_start: string | null
  project_end: string | null
  service_type: string | null
  site_category: string | null
  site_category2: string | null
  billing_start: string | null
  billing_end: string | null
  billing_method: string | null
  invoice_day: number | null
  monthly_amount: number | null
  status: string
  notes: string | null
  created_at: string
  customer?: {
    id: string
    company_name: string
    notes: string | null
  }
  revenues: {
    id: string
    month: number
    amount: number
    is_confirmed: boolean
  }[]
}

interface CustomerOption {
  id: string
  company_name: string
}

/* ──────────── Main Page ──────────── */

export default function RevenuePage() {
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const supabase = createClient()

  // Inline edit
  const [editingCell, setEditingCell] = useState<{ projectId: string; month: number; revenueId?: string } | null>(null)
  const [editValue, setEditValue] = useState('')

  // Project modal
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [copyFromProject, setCopyFromProject] = useState<ProjectRow | null>(null)

  // Row menu
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch all projects with customer info and year's revenues
      let allProjects: any[] = []
      let from = 0
      const batchSize = 1000
      while (true) {
        const { data, error } = await supabase
          .from('projects')
          .select(`
            *,
            customer:customers(id, company_name, notes),
            revenues:monthly_revenues(id, month, amount, is_confirmed)
          `)
          .eq('revenues.year', year)
          .order('created_at', { ascending: true })
          .range(from, from + batchSize - 1)
        if (error) { console.error(error); break }
        if (!data || data.length === 0) break
        allProjects = allProjects.concat(data)
        if (data.length < batchSize) break
        from += batchSize
      }
      setProjects(allProjects as ProjectRow[])
    } catch (err) {
      console.error('Revenue fetch error:', err)
    }
    setLoading(false)
  }, [year])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    async function loadCustomers() {
      const { data } = await supabase.from('customers').select('id, company_name').order('company_name')
      setCustomers((data || []) as CustomerOption[])
    }
    loadCustomers()
  }, [])

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Filter
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects
    const q = searchQuery.trim().toLowerCase()
    return projects.filter(p =>
      p.customer?.company_name?.toLowerCase().includes(q) ||
      p.project_name.toLowerCase().includes(q) ||
      p.service_type?.toLowerCase().includes(q)
    )
  }, [projects, searchQuery])

  // Monthly totals
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), [])
  const currentMonth = new Date().getMonth() + 1

  const monthlyTotals = useMemo(() => {
    const totals: Record<number, number> = {}
    months.forEach(m => { totals[m] = 0 })
    let grand = 0
    filteredProjects.forEach(p => {
      (p.revenues || []).forEach(r => {
        totals[r.month] = (totals[r.month] || 0) + Number(r.amount)
        grand += Number(r.amount)
      })
    })
    return { totals, grand }
  }, [filteredProjects, months])

  /* ── Inline cell handlers ── */
  const startCellEdit = (projectId: string, month: number, revenue?: { id: string; amount: number }) => {
    setEditingCell({ projectId, month, revenueId: revenue?.id })
    setEditValue(revenue ? String(revenue.amount) : '')
  }

  const saveCellEdit = async () => {
    if (!editingCell) return
    const amount = Number(editValue)

    if (editingCell.revenueId) {
      // Update existing
      if (isNaN(amount) || amount < 0) { setEditingCell(null); return }
      if (amount === 0) {
        // Delete
        await supabase.from('monthly_revenues').delete().eq('id', editingCell.revenueId)
        toast.success('매출이 삭제되었습니다.')
      } else {
        await supabase.from('monthly_revenues').update({ amount }).eq('id', editingCell.revenueId)
        toast.success('매출이 수정되었습니다.')
      }
    } else {
      // Create new
      if (isNaN(amount) || amount <= 0) { setEditingCell(null); return }
      const project = projects.find(p => p.id === editingCell.projectId)
      if (!project) { setEditingCell(null); return }
      await supabase.from('monthly_revenues').insert({
        customer_id: project.customer_id,
        project_id: editingCell.projectId,
        year,
        month: editingCell.month,
        amount,
        is_confirmed: false,
      })
      toast.success(`${editingCell.month}월 매출 ${formatCurrency(amount)} 등록`)
    }
    setEditingCell(null)
    setEditValue('')
    fetchData()
  }

  /* ── Row actions ── */
  const handleCopyRow = (project: ProjectRow) => {
    setCopyFromProject(project)
    setShowProjectModal(true)
    setMenuOpen(null)
  }

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('이 서비스 라인을 삭제하시겠습니까? 연관된 매출 데이터도 모두 삭제됩니다.')) return
    await supabase.from('monthly_revenues').delete().eq('project_id', projectId)
    await supabase.from('projects').delete().eq('id', projectId)
    toast.success('삭제되었습니다.')
    setMenuOpen(null)
    fetchData()
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const y = new Date().getFullYear() - i
    return { value: String(y), label: `${y}년` }
  })

  const formatDate = (d: string | null) => {
    if (!d) return ''
    // YYYY-MM-DD → YY-MM-DD or MM-DD
    return d.substring(2) // 26-04-01
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">CaaS.Works 현장별 매출 현황</h1>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => { setCopyFromProject(null); setShowProjectModal(true) }}>
            <Plus className="w-4 h-4 mr-1.5" />
            프로젝트 등록
          </Button>
          <Select
            value={String(year)}
            onChange={(e) => setYear(Number(e.target.value))}
            options={yearOptions}
            className="w-32"
          />
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="고객사 / 현장명 / 서비스 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Summary - 월별 합계 (시트 상단 요약처럼) */}
      <div className="card mb-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-3 py-2 text-left font-semibold text-gray-600 w-20">구분</th>
              {months.map(m => (
                <th key={m} className={`px-1 py-2 text-center font-medium min-w-[80px] ${m === currentMonth && year === new Date().getFullYear() ? 'bg-red-50 text-red-700 font-bold' : 'text-gray-600'}`}>
                  {m}월
                </th>
              ))}
              <th className="px-2 py-2 text-right font-semibold text-gray-600 min-w-[100px]">합계</th>
            </tr>
          </thead>
          <tbody>
            <tr className="font-semibold bg-gray-50">
              <td className="px-3 py-2 text-gray-700">합계</td>
              {months.map(m => (
                <td key={m} className={`px-1 py-2 text-right ${m === currentMonth && year === new Date().getFullYear() ? 'bg-red-50 text-red-700 font-bold' : ''}`}>
                  {monthlyTotals.totals[m] ? formatCurrency(monthlyTotals.totals[m]) : '-'}
                </td>
              ))}
              <td className="px-2 py-2 text-right font-bold text-primary-600">{formatCurrency(monthlyTotals.grand)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {loading ? (
        <Loading />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-red-600 text-white sticky top-0 z-20">
              <tr>
                <th className="px-2 py-2.5 text-center font-medium w-[40px] sticky left-0 bg-red-600 z-30">NO.</th>
                <th className="px-2 py-2.5 text-center font-medium min-w-[70px]">시작일</th>
                <th className="px-2 py-2.5 text-center font-medium min-w-[70px]">종료일</th>
                <th className="px-2 py-2.5 text-left font-medium min-w-[120px] sticky left-[40px] bg-red-600 z-30">회사명</th>
                <th className="px-2 py-2.5 text-left font-medium min-w-[200px]">프로젝트 명 (현장명)</th>
                <th className="px-2 py-2.5 text-center font-medium min-w-[50px]">현장<br/>구분</th>
                <th className="px-2 py-2.5 text-center font-medium min-w-[90px]">현장<br/>구분2</th>
                <th className="px-2 py-2.5 text-center font-medium min-w-[80px]">이용 서비스</th>
                <th className="px-2 py-2.5 text-center font-medium min-w-[70px]">과금<br/>시작일</th>
                <th className="px-2 py-2.5 text-center font-medium min-w-[70px]">과금<br/>종료일</th>
                <th className="px-2 py-2.5 text-left font-medium min-w-[120px]">비고</th>
                <th className="px-2 py-2.5 text-center font-medium min-w-[60px]">과금<br/>방식</th>
                {months.map(m => (
                  <th key={m} className={`px-1 py-2.5 text-center font-medium min-w-[80px] ${m === currentMonth && year === new Date().getFullYear() ? 'bg-red-700' : ''}`}>
                    {m}월
                  </th>
                ))}
                <th className="px-2 py-2.5 text-right font-medium min-w-[90px]">합계</th>
                <th className="px-1 py-2.5 text-center w-[36px]"></th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={26} className="py-16 text-center text-sm text-text-tertiary">
                    {searchQuery ? '검색 결과가 없습니다.' : '등록된 프로젝트가 없습니다.'}
                  </td>
                </tr>
              ) : (
                filteredProjects.map((project, idx) => {
                  const revenueMap: Record<number, { id: string; amount: number; is_confirmed: boolean }> = {}
                  let rowTotal = 0
                  ;(project.revenues || []).forEach(r => {
                    revenueMap[r.month] = { id: r.id, amount: Number(r.amount), is_confirmed: r.is_confirmed }
                    rowTotal += Number(r.amount)
                  })

                  return (
                    <tr key={project.id} className="border-b border-gray-100 hover:bg-blue-50/30 group">
                      {/* NO */}
                      <td className="px-2 py-2 text-center font-bold text-gray-700 sticky left-0 bg-white group-hover:bg-blue-50/30 z-10 border-r border-gray-100">
                        {idx + 1}
                      </td>
                      {/* 시작일 */}
                      <td className="px-2 py-2 text-center text-gray-500">{formatDate(project.project_start)}</td>
                      {/* 종료일 */}
                      <td className="px-2 py-2 text-center text-gray-500">{formatDate(project.project_end)}</td>
                      {/* 회사명 */}
                      <td className="px-2 py-2 text-left font-medium text-gray-800 sticky left-[40px] bg-white group-hover:bg-blue-50/30 z-10 border-r border-gray-100 truncate max-w-[150px]" title={project.customer?.company_name}>
                        {project.customer?.company_name || '(미지정)'}
                      </td>
                      {/* 현장명 */}
                      <td className="px-2 py-2 text-left text-gray-700 truncate max-w-[220px]" title={project.project_name}>
                        {project.project_name}
                      </td>
                      {/* 현장구분 */}
                      <td className="px-2 py-2 text-center text-gray-600">{project.site_category || ''}</td>
                      {/* 현장구분2 */}
                      <td className="px-2 py-2 text-center text-gray-600 truncate max-w-[100px]" title={project.site_category2 || ''}>
                        {project.site_category2 || ''}
                      </td>
                      {/* 이용 서비스 */}
                      <td className="px-2 py-2 text-center">
                        {project.service_type ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${getServiceColor(project.service_type)}`}>
                            {project.service_type}
                          </span>
                        ) : '-'}
                      </td>
                      {/* 과금 시작일 */}
                      <td className="px-2 py-2 text-center text-gray-500">{formatDate(project.billing_start)}</td>
                      {/* 과금 종료일 */}
                      <td className="px-2 py-2 text-center text-gray-500">{formatDate(project.billing_end)}</td>
                      {/* 비고 (회사 특이사항) */}
                      <td className="px-2 py-2 text-left text-gray-500 truncate max-w-[140px]" title={project.customer?.notes || ''}>
                        {project.customer?.notes || ''}
                      </td>
                      {/* 과금 방식 */}
                      <td className="px-2 py-2 text-center text-gray-600 text-[10px]">{project.billing_method || ''}</td>
                      {/* 월별 매출 */}
                      {months.map(m => {
                        const rev = revenueMap[m]
                        const isCurrent = m === currentMonth && year === new Date().getFullYear()
                        const isEditing = editingCell?.projectId === project.id && editingCell?.month === m

                        if (isEditing) {
                          return (
                            <td key={m} className={`px-0.5 py-1 ${isCurrent ? 'bg-red-50/30' : ''}`}>
                              <input
                                type="number"
                                className="w-full text-right text-xs border border-primary-400 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveCellEdit()
                                  if (e.key === 'Escape') setEditingCell(null)
                                }}
                                onBlur={() => { if (editValue) saveCellEdit(); else setEditingCell(null) }}
                                autoFocus
                                placeholder="금액"
                              />
                            </td>
                          )
                        }

                        return (
                          <td
                            key={m}
                            className={`px-1 py-2 text-right cursor-pointer hover:bg-primary-50 transition-colors ${isCurrent ? 'bg-red-50/20' : ''}`}
                            onClick={() => startCellEdit(project.id, m, rev)}
                          >
                            {rev ? (
                              <span className={rev.is_confirmed ? 'text-gray-700' : 'text-orange-500'}>
                                {formatCurrency(rev.amount)}
                                {!rev.is_confirmed && <span className="text-[8px]">*</span>}
                              </span>
                            ) : (
                              <span className="text-gray-200 group-hover:text-gray-300">-</span>
                            )}
                          </td>
                        )
                      })}
                      {/* 합계 */}
                      <td className="px-2 py-2 text-right font-semibold text-gray-800">
                        {rowTotal > 0 ? formatCurrency(rowTotal) : '-'}
                      </td>
                      {/* Actions */}
                      <td className="px-1 py-2 text-center relative">
                        <button
                          onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === project.id ? null : project.id) }}
                          className="p-1 text-text-tertiary hover:text-text-secondary rounded hover:bg-gray-100"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                        {menuOpen === project.id && (
                          <div ref={menuRef} className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 min-w-[140px]">
                            <button
                              onClick={() => handleCopyRow(project)}
                              className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Copy className="w-3.5 h-3.5" /> 같은 현장 서비스 추가
                            </button>
                            {(project.service_type === 'AI CCTV' || project.service_type === 'Wearable') && (
                              <button
                                onClick={() => { window.location.href = `/operations/camera-shipments?project_id=${project.id}&customer_id=${project.customer_id}`; setMenuOpen(null) }}
                                className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50 flex items-center gap-2"
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> 카메라 반출 등록
                              </button>
                            )}
                            <hr className="my-1" />
                            <button
                              onClick={() => handleDeleteProject(project.id)}
                              className="w-full px-3 py-2 text-left text-xs hover:bg-red-50 text-red-600 flex items-center gap-2"
                            >
                              <X className="w-3.5 h-3.5" /> 삭제
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

          {/* Footer */}
          {filteredProjects.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 text-xs text-text-tertiary flex items-center gap-4">
              <span>총 {filteredProjects.length}건</span>
              <span>* 미확정 매출</span>
              <span>셀 클릭 = 매출 입력/수정</span>
            </div>
          )}
        </div>
      )}

      {/* Project Registration Modal */}
      <ProjectModal
        open={showProjectModal}
        onClose={() => { setShowProjectModal(false); setCopyFromProject(null) }}
        customers={customers}
        copyFrom={copyFromProject}
        onSaved={() => { fetchData(); setShowProjectModal(false); setCopyFromProject(null) }}
      />
    </div>
  )
}

/* ──────────── Project Registration Modal ──────────── */

function ProjectModal({
  open, onClose, customers, copyFrom, onSaved,
}: {
  open: boolean
  onClose: () => void
  customers: CustomerOption[]
  copyFrom: ProjectRow | null
  onSaved: () => void
}) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    customer_id: '',
    project_name: '',
    project_start: '',
    project_end: '',
    site_category: '',
    site_category2: '',
    service_type: '',
    billing_start: '',
    billing_end: '',
    billing_method: '',
    invoice_day: '',
    monthly_amount: '',
    notes: '',
  })

  // Auto-fill when copying from existing project
  useEffect(() => {
    if (open) {
      if (copyFrom) {
        setForm({
          customer_id: copyFrom.customer_id || '',
          project_name: copyFrom.project_name || '',
          project_start: copyFrom.project_start || '',
          project_end: copyFrom.project_end || '',
          site_category: copyFrom.site_category || '',
          site_category2: copyFrom.site_category2 || '',
          service_type: '', // 서비스만 새로 선택
          billing_start: '',
          billing_end: '',
          billing_method: copyFrom.billing_method || '',
          invoice_day: copyFrom.invoice_day ? String(copyFrom.invoice_day) : '',
          monthly_amount: '',
          notes: '',
        })
      } else {
        setForm({
          customer_id: '', project_name: '', project_start: '', project_end: '',
          site_category: '', site_category2: '', service_type: '',
          billing_start: '', billing_end: '', billing_method: '',
          invoice_day: '', monthly_amount: '', notes: '',
        })
      }
    }
  }, [open, copyFrom])

  const handleSave = async () => {
    if (!form.customer_id) { toast.error('회사명을 선택해주세요.'); return }
    if (!form.project_name) { toast.error('프로젝트명(현장명)을 입력해주세요.'); return }

    setSaving(true)
    const { data, error } = await supabase.from('projects').insert({
      customer_id: form.customer_id,
      project_name: form.project_name,
      project_start: form.project_start || null,
      project_end: form.project_end || null,
      site_category: form.site_category || null,
      site_category2: form.site_category2 || null,
      service_type: form.service_type || null,
      billing_start: form.billing_start || null,
      billing_end: form.billing_end || null,
      billing_method: form.billing_method || null,
      invoice_day: form.invoice_day ? Number(form.invoice_day) : null,
      monthly_amount: form.monthly_amount ? Number(form.monthly_amount) : null,
      status: 'active',
      source: 'manual',
    }).select('id, service_type, customer_id').single()

    setSaving(false)

    if (error) {
      toast.error('등록 실패: ' + error.message)
      return
    }

    toast.success('프로젝트가 등록되었습니다.')

    // 카메라 서비스면 반출 등록 안내
    if (data && (form.service_type === 'AI CCTV' || form.service_type === 'Wearable')) {
      const goToShipment = confirm('카메라 반출 현황을 등록하시겠습니까?')
      if (goToShipment) {
        window.location.href = `/operations/camera-shipments?project_id=${data.id}&customer_id=${data.customer_id}`
        return
      }
    }

    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={copyFrom ? '같은 현장 서비스 추가' : '프로젝트 등록'} className="max-w-2xl">
      <div className="space-y-4">
        {copyFrom && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            <strong>{copyFrom.customer?.company_name}</strong>의 <strong>{copyFrom.project_name}</strong> 현장에 새 서비스를 추가합니다.
            현장 정보가 자동 채워집니다.
          </div>
        )}

        {/* Row 1: 회사명 */}
        <SearchSelect
          label="회사명 *"
          placeholder="고객사 검색..."
          options={customers.map(c => ({ value: c.id, label: c.company_name }))}
          value={form.customer_id}
          onChange={(val) => setForm(f => ({ ...f, customer_id: val }))}
          disabled={!!copyFrom}
        />

        {/* Row 2: 현장명 */}
        <Input
          label="프로젝트 명 (현장명) *"
          placeholder="예: 울산광역시 울주군 상북면 소호리 단독주택"
          value={form.project_name}
          onChange={(e) => setForm(f => ({ ...f, project_name: e.target.value }))}
          disabled={!!copyFrom}
        />

        {/* Row 3: 시작일/종료일 */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="프로젝트 시작일"
            type="date"
            value={form.project_start}
            onChange={(e) => setForm(f => ({ ...f, project_start: e.target.value }))}
          />
          <Input
            label="프로젝트 종료일"
            type="date"
            value={form.project_end}
            onChange={(e) => setForm(f => ({ ...f, project_end: e.target.value }))}
          />
        </div>

        {/* Row 4: 현장구분 */}
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="현장 구분"
            options={[{ value: '', label: '선택' }, ...SITE_CATEGORY_OPTIONS]}
            value={form.site_category}
            onChange={(e) => setForm(f => ({ ...f, site_category: e.target.value }))}
          />
          <Select
            label="현장 구분2"
            options={[{ value: '', label: '선택' }, ...SITE_CATEGORY2_OPTIONS]}
            value={form.site_category2}
            onChange={(e) => setForm(f => ({ ...f, site_category2: e.target.value }))}
          />
        </div>

        {/* Row 5: 서비스/과금방식 */}
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="이용 서비스"
            options={[{ value: '', label: '선택' }, ...SERVICE_TYPE_OPTIONS]}
            value={form.service_type}
            onChange={(e) => setForm(f => ({ ...f, service_type: e.target.value }))}
          />
          <Select
            label="과금 방식"
            options={[{ value: '', label: '선택' }, ...BILLING_METHOD_OPTIONS]}
            value={form.billing_method}
            onChange={(e) => setForm(f => ({ ...f, billing_method: e.target.value }))}
          />
        </div>

        {/* Row 6: 과금 시작/종료 */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="과금 시작일"
            type="date"
            value={form.billing_start}
            onChange={(e) => setForm(f => ({ ...f, billing_start: e.target.value }))}
          />
          <Input
            label="과금 종료일"
            type="date"
            value={form.billing_end}
            onChange={(e) => setForm(f => ({ ...f, billing_end: e.target.value }))}
          />
        </div>

        {/* Row 7: 월정액 / 발행일 */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="월정액 (원)"
            type="number"
            placeholder="0"
            value={form.monthly_amount}
            onChange={(e) => setForm(f => ({ ...f, monthly_amount: e.target.value }))}
          />
          <Select
            label="계산서 발행일"
            options={[
              { value: '', label: '선택' },
              { value: '1', label: '매월 1일' },
              { value: '15', label: '매월 15일' },
              { value: '25', label: '매월 25일' },
              { value: '0', label: '말일' },
            ]}
            value={form.invoice_day}
            onChange={(e) => setForm(f => ({ ...f, invoice_day: e.target.value }))}
          />
        </div>

        {/* 카메라 서비스 안내 */}
        {(form.service_type === 'AI CCTV' || form.service_type === 'Wearable') && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
            📷 카메라 관련 서비스입니다. 저장 후 카메라 반출 현황 등록으로 이동할 수 있습니다.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button onClick={handleSave} loading={saving}>등록</Button>
        </div>
      </div>
    </Modal>
  )
}
