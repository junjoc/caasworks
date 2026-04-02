'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Select } from '@/components/ui/select'
import { Loading } from '@/components/ui/loading'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, TrendingDown, DollarSign, Minus } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LineChart, Line } from 'recharts'

export default function AnalysisPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [monthlyData, setMonthlyData] = useState<{ month: string; revenue: number; cost: number; profit: number }[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      let revenues: any[] = []
      let from = 0
      while (true) {
        const { data } = await supabase.from('monthly_revenues').select('month, amount').eq('year', year).range(from, from + 999)
        if (!data || data.length === 0) break
        revenues = revenues.concat(data)
        if (data.length < 1000) break
        from += 1000
      }

      // Build monthly data
      const byMonth: Record<number, number> = {}
      ;(revenues || []).forEach((r: any) => {
        byMonth[r.month] = (byMonth[r.month] || 0) + Number(r.amount)
      })

      const data = Array.from({ length: 12 }, (_, i) => {
        const revenue = byMonth[i + 1] || 0
        const cost = 0 // TODO: 매입/비용 데이터 연동
        return {
          month: `${i + 1}월`,
          revenue,
          cost,
          profit: revenue - cost,
        }
      })

      setMonthlyData(data)
      setLoading(false)
    }
    fetch()
  }, [year])

  const totalRevenue = monthlyData.reduce((s, d) => s + d.revenue, 0)
  const totalCost = monthlyData.reduce((s, d) => s + d.cost, 0)
  const totalProfit = totalRevenue - totalCost
  const profitRate = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0'

  const yearOptions = Array.from({ length: 5 }, (_, i) => ({
    value: String(new Date().getFullYear() - i),
    label: `${new Date().getFullYear() - i}년`,
  }))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">손익 분석</h1>
        <Select options={yearOptions} value={String(year)} onChange={(e) => setYear(Number(e.target.value))} className="w-28" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-primary-500" /><span className="stat-label">총 매출</span></div>
          <div className="stat-value text-primary-500">{formatCurrency(totalRevenue)}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><TrendingDown className="w-4 h-4 text-status-red" /><span className="stat-label">총 비용</span></div>
          <div className="stat-value text-status-red">{formatCurrency(totalCost)}</div>
          <span className="text-micro text-text-tertiary">매입/비용 데이터 연동 필요</span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><DollarSign className="w-4 h-4 text-status-green" /><span className="stat-label">영업이익</span></div>
          <div className="stat-value text-status-green">{formatCurrency(totalProfit)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">이익률</div>
          <div className="stat-value">{profitRate}%</div>
        </div>
      </div>

      {loading ? <Loading /> : (
        <>
          <div className="card mb-6">
            <div className="card-header">
              <span className="card-header-title">월별 매출/비용/이익 추이</span>
            </div>
            <div className="card-body">
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f5" />
                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9699a6' }} axisLine={{ stroke: '#e6e9ef' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9699a6' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(0)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e6e9ef', fontSize: '13px', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="revenue" name="매출" fill="#1890ff" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cost" name="비용" fill="#FF6661" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" name="이익" fill="#60CA21" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-header-title">월별 상세</span>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '12%' }}>월</th>
                    <th style={{ width: '22%' }} className="text-right">매출</th>
                    <th style={{ width: '22%' }} className="text-right">비용</th>
                    <th style={{ width: '22%' }} className="text-right">이익</th>
                    <th style={{ width: '22%' }} className="text-right">이익률</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map((d, i) => {
                    const rate = d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : '-'
                    const isCurrent = i + 1 === new Date().getMonth() + 1 && year === new Date().getFullYear()
                    return (
                      <tr key={i} className={isCurrent ? 'bg-primary-50/30' : ''}>
                        <td className="font-medium">{d.month}</td>
                        <td className="text-right text-primary-500">{d.revenue > 0 ? formatCurrency(d.revenue) : '-'}</td>
                        <td className="text-right text-status-red">{d.cost > 0 ? formatCurrency(d.cost) : '-'}</td>
                        <td className="text-right font-semibold text-status-green">{d.profit > 0 ? formatCurrency(d.profit) : '-'}</td>
                        <td className="text-right text-text-secondary">{rate !== '-' ? `${rate}%` : '-'}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-surface-tertiary font-semibold">
                    <td>합계</td>
                    <td className="text-right text-primary-500">{formatCurrency(totalRevenue)}</td>
                    <td className="text-right text-status-red">{formatCurrency(totalCost)}</td>
                    <td className="text-right text-status-green">{formatCurrency(totalProfit)}</td>
                    <td className="text-right">{profitRate}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
