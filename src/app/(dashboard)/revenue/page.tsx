'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/components/ui/loading'
import { Select } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import { DollarSign, ChevronDown, ChevronRight, Building2, MapPin } from 'lucide-react'

interface ProjectRevenue {
  project_id: string
  project_name: string
  service_type: string | null
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
}

export default function RevenuePage() {
  const [data, setData] = useState<RevenueSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set())
  const supabase = createClient()

  useEffect(() => {
    fetchRevenue()
  }, [year])

  async function fetchRevenue() {
    setLoading(true)
    try {
      const { data: revenues } = await Promise.race([
        supabase
          .from('monthly_revenues')
          .select('*, customer:customers(company_name, company_type), project:projects(project_name, service_type)')
          .eq('year', year)
          .order('month'),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
      ])

      // 고객별 → 프로젝트별 집계
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

        // 프로젝트별
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
        proj.months[r.month] = (proj.months[r.month] || 0) + Number(r.amount)
        proj.total += Number(r.amount)
      })

      setData(Array.from(customerMap.values()).sort((a, b) => b.total - a.total))
    } catch (err) {
      console.error('Revenue fetch error:', err)
      setData([])
    }
    setLoading(false)
  }

  const toggleCustomer = (id: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
        <Select
          value={String(year)}
          onChange={(e) => setYear(Number(e.target.value))}
          options={yearOptions}
          className="w-32"
        />
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
        <div className="table-container overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="sticky left-0 bg-gray-50 z-10 min-w-[200px]">고객사 / 현장</th>
                {months.map((m) => (
                  <th key={m} className={`text-center min-w-[90px] ${m === currentMonth && year === new Date().getFullYear() ? 'bg-blue-50' : ''}`}>
                    {m}월
                  </th>
                ))}
                <th className="text-right min-w-[110px]">합계</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const isExpanded = expandedCustomers.has(row.customer_id)
                return (
                  <>
                    {/* 고객사 행 */}
                    <tr
                      key={row.customer_id}
                      className="cursor-pointer hover:bg-blue-50/50 transition-colors"
                      onClick={() => toggleCustomer(row.customer_id)}
                    >
                      <td className="sticky left-0 bg-white z-10">
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
                    </tr>

                    {/* 프로젝트 상세 행 (펼침) */}
                    {isExpanded && row.projects.sort((a, b) => b.total - a.total).map((proj) => (
                      <tr key={proj.project_id} className="bg-gray-50/70">
                        <td className="sticky left-0 bg-gray-50/70 z-10 pl-10">
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
                        {months.map((m) => (
                          <td key={m} className={`text-right text-xs text-gray-500 ${m === currentMonth && year === new Date().getFullYear() ? 'bg-blue-50/20' : ''}`}>
                            {proj.months[m] ? formatCurrency(proj.months[m]) : <span className="text-gray-200">-</span>}
                          </td>
                        ))}
                        <td className="text-right text-sm text-gray-600">{formatCurrency(proj.total)}</td>
                      </tr>
                    ))}
                  </>
                )
              })}
              {data.length > 0 && (
                <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                  <td className="sticky left-0 bg-gray-100 z-10">합계</td>
                  {monthlyTotals.map((t, i) => (
                    <td key={i} className={`text-right ${i + 1 === currentMonth && year === new Date().getFullYear() ? 'bg-blue-100/50' : ''}`}>
                      {t ? formatCurrency(t) : '-'}
                    </td>
                  ))}
                  <td className="text-right">{formatCurrency(grandTotal)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
