'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/components/ui/loading'
import { Select } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import { DollarSign } from 'lucide-react'

interface RevenueSummary {
  customer_name: string
  customer_id: string
  months: Record<number, number>
  total: number
}

export default function RevenuePage() {
  const [data, setData] = useState<RevenueSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const supabase = createClient()

  useEffect(() => {
    fetchRevenue()
  }, [year])

  async function fetchRevenue() {
    setLoading(true)
    const { data: revenues } = await supabase
      .from('monthly_revenues')
      .select('*, customer:customers(company_name)')
      .eq('year', year)
      .order('month')

    // 고객별 월별 집계
    const map = new Map<string, RevenueSummary>()
    ;(revenues || []).forEach((r: any) => {
      const key = r.customer_id
      if (!map.has(key)) {
        map.set(key, {
          customer_name: r.customer?.company_name || '(알수없음)',
          customer_id: key,
          months: {},
          total: 0,
        })
      }
      const entry = map.get(key)!
      entry.months[r.month] = (entry.months[r.month] || 0) + Number(r.amount)
      entry.total += Number(r.amount)
    })

    setData(Array.from(map.values()).sort((a, b) => b.total - a.total))
    setLoading(false)
  }

  const months = Array.from({ length: 12 }, (_, i) => i + 1)
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
                <th className="sticky left-0 bg-gray-50 z-10">고객사</th>
                {months.map((m) => (
                  <th key={m} className="text-center">{m}월</th>
                ))}
                <th className="text-right">합계</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.customer_id}>
                  <td className="sticky left-0 bg-white font-medium">{row.customer_name}</td>
                  {months.map((m) => (
                    <td key={m} className="text-right text-sm">
                      {row.months[m] ? formatCurrency(row.months[m]) : '-'}
                    </td>
                  ))}
                  <td className="text-right font-semibold">{formatCurrency(row.total)}</td>
                </tr>
              ))}
              {data.length > 0 && (
                <tr className="bg-gray-50 font-semibold">
                  <td className="sticky left-0 bg-gray-50">합계</td>
                  {monthlyTotals.map((t, i) => (
                    <td key={i} className="text-right">{t ? formatCurrency(t) : '-'}</td>
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
