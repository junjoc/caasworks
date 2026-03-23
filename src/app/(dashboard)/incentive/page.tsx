'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Loading } from '@/components/ui/loading'
import { Select } from '@/components/ui/select'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { Award } from 'lucide-react'

export default function MyIncentivePage() {
  const { user } = useAuth()
  const [records, setRecords] = useState<any[]>([])
  const [settings, setSettings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const supabase = createClient()

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('incentive_records').select('*').eq('user_id', user.id).eq('year', year).order('month'),
      supabase.from('incentive_settings').select('*').eq('user_id', user.id).eq('year', year).order('month'),
    ]).then(([r, s]) => {
      setRecords(r.data || [])
      setSettings(s.data || [])
      setLoading(false)
    })
  }, [user, year])

  const yearOptions = Array.from({ length: 3 }, (_, i) => {
    const y = new Date().getFullYear() - i
    return { value: String(y), label: `${y}년` }
  })

  const totalIncentive = records.reduce((sum, r) => sum + Number(r.incentive_total || 0), 0)
  const totalContracts = records.reduce((sum, r) => sum + (r.contract_count || 0), 0)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">내 인센티브</h1>
        <Select
          value={String(year)}
          onChange={(e) => setYear(Number(e.target.value))}
          options={yearOptions}
          className="w-32"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Award className="w-5 h-5 text-primary-600" />
            <span className="stat-label">연간 인센티브</span>
          </div>
          <div className="stat-value">{formatCurrency(totalIncentive)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">총 계약 건수</div>
          <div className="stat-value">{totalContracts}건</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">월 평균</div>
          <div className="stat-value">{formatCurrency(totalIncentive / 12)}</div>
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>월</th>
                <th>계약 건수</th>
                <th>계약 매출</th>
                <th>구독 매출</th>
                <th>인센티브</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                const rec = records.find((r) => r.month === month)
                return (
                  <tr key={month}>
                    <td>{month}월</td>
                    <td>{rec?.contract_count || 0}건</td>
                    <td>{rec ? formatCurrency(Number(rec.contract_amount || 0)) : '-'}</td>
                    <td>{rec ? formatCurrency(Number(rec.subscription_amount || 0)) : '-'}</td>
                    <td className="font-medium">{rec ? formatCurrency(Number(rec.incentive_total || 0)) : '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
