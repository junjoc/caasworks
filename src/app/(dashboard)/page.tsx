'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatNumber, STAGE_COLORS } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/ui/loading'
import {
  TrendingUp,
  TrendingDown,
  Users,
  GitBranch,
  FileText,
  AlertCircle,
  DollarSign,
} from 'lucide-react'

interface DashboardData {
  monthlyRevenue: number
  prevMonthRevenue: number
  newLeadsCount: number
  convertedCount: number
  unpaidInvoices: number
  unpaidAmount: number
  pipelineByStage: { stage: string; count: number }[]
  recentLeads: { id: string; company_name: string; stage: string; created_at: string }[]
  pendingItems: {
    unassignedLeads: number
    unpaidOver30: number
    openVocTickets: number
    expiringBilling: number
  }
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchDashboard()
  }, [])

  async function fetchDashboard() {
    try {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year

    // Timeout wrapper - don't hang forever
    const withTimeout = <T,>(promise: Promise<T>, ms = 8000): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
      ])

    const [
      revenueRes,
      prevRevenueRes,
      leadsRes,
      convertedRes,
      invoicesRes,
      pipelineRes,
      recentRes,
      unassignedRes,
      vocRes,
    ] = await withTimeout(Promise.all([
      supabase.from('monthly_revenues').select('amount').eq('year', year).eq('month', month),
      supabase.from('monthly_revenues').select('amount').eq('year', prevYear).eq('month', prevMonth),
      supabase.from('pipeline_leads').select('id', { count: 'exact' })
        .gte('created_at', `${year}-${String(month).padStart(2, '0')}-01`),
      supabase.from('pipeline_leads').select('id', { count: 'exact' })
        .in('stage', ['계약', '도입완료'])
        .gte('converted_at', `${year}-${String(month).padStart(2, '0')}-01`),
      supabase.from('invoices').select('total').in('status', ['sent', 'overdue']),
      supabase.from('pipeline_leads').select('stage'),
      supabase.from('pipeline_leads')
        .select('id, company_name, stage, created_at')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase.from('pipeline_leads').select('id', { count: 'exact' }).is('assigned_to', null),
      supabase.from('voc_tickets').select('id', { count: 'exact' })
        .in('status', ['received', 'reviewing', 'in_progress']),
    ]))

    const monthlyRevenue = (revenueRes.data || []).reduce((sum, r) => sum + Number(r.amount), 0)
    const prevMonthRevenue = (prevRevenueRes.data || []).reduce((sum, r) => sum + Number(r.amount), 0)

    // 파이프라인 단계별 집계
    const stageCounts: Record<string, number> = {}
    ;(pipelineRes.data || []).forEach((l) => {
      stageCounts[l.stage] = (stageCounts[l.stage] || 0) + 1
    })
    const pipelineByStage = ['신규리드', '컨택', '미팅', '제안', '계약', '도입완료'].map((stage) => ({
      stage,
      count: stageCounts[stage] || 0,
    }))

    const unpaidInvoiceData = invoicesRes.data || []

    setData({
      monthlyRevenue,
      prevMonthRevenue,
      newLeadsCount: leadsRes.count || 0,
      convertedCount: convertedRes.count || 0,
      unpaidInvoices: unpaidInvoiceData.length,
      unpaidAmount: unpaidInvoiceData.reduce((sum, inv) => sum + Number(inv.total), 0),
      pipelineByStage,
      recentLeads: recentRes.data || [],
      pendingItems: {
        unassignedLeads: unassignedRes.count || 0,
        unpaidOver30: 0,
        openVocTickets: vocRes.count || 0,
        expiringBilling: 0,
      },
    })
    setLoading(false)
    } catch (err) {
      console.error('Dashboard fetch error:', err)
      // Show empty state instead of hanging
      setData({
        monthlyRevenue: 0, prevMonthRevenue: 0, newLeadsCount: 0, convertedCount: 0,
        unpaidInvoices: 0, unpaidAmount: 0, pipelineByStage: [], recentLeads: [],
        pendingItems: { unassignedLeads: 0, unpaidOver30: 0, openVocTickets: 0, expiringBilling: 0 },
      })
      setLoading(false)
    }
  }

  if (loading) return <Loading />
  if (!data) return <Loading />

  const revenueChange = data.prevMonthRevenue > 0
    ? ((data.monthlyRevenue - data.prevMonthRevenue) / data.prevMonthRevenue) * 100
    : 0

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">대시보드</h1>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-primary-600" />
            <span className="text-sm text-gray-500">이번 달 매출</span>
          </div>
          <div className="stat-value">{formatCurrency(data.monthlyRevenue)}</div>
          {revenueChange !== 0 && (
            <div className={revenueChange > 0 ? 'stat-change-up' : 'stat-change-down'}>
              {revenueChange > 0 ? (
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" /> +{revenueChange.toFixed(1)}%
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <TrendingDown className="w-4 h-4" /> {revenueChange.toFixed(1)}%
                </span>
              )}
            </div>
          )}
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <GitBranch className="w-5 h-5 text-blue-600" />
            <span className="text-sm text-gray-500">신규 리드</span>
          </div>
          <div className="stat-value">{formatNumber(data.newLeadsCount)}건</div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-green-600" />
            <span className="text-sm text-gray-500">계약 전환</span>
          </div>
          <div className="stat-value">{formatNumber(data.convertedCount)}건</div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-5 h-5 text-orange-600" />
            <span className="text-sm text-gray-500">미납 청구서</span>
          </div>
          <div className="stat-value">{formatNumber(data.unpaidInvoices)}건</div>
          <p className="text-xs text-gray-500 mt-1">{formatCurrency(data.unpaidAmount)}</p>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-sm text-gray-500">미처리 VoC</span>
          </div>
          <div className="stat-value">{formatNumber(data.pendingItems.openVocTickets)}건</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 파이프라인 현황 */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold">파이프라인 현황</h2>
          </div>
          <div className="card-body">
            <div className="space-y-3">
              {data.pipelineByStage.map((item) => {
                const total = data.pipelineByStage.reduce((sum, i) => sum + i.count, 0)
                const pct = total > 0 ? (item.count / total) * 100 : 0
                return (
                  <div key={item.stage} className="flex items-center gap-3">
                    <Badge className={STAGE_COLORS[item.stage]}>{item.stage}</Badge>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-primary-500 h-2 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-10 text-right">
                      {item.count}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* 최근 리드 */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold">최근 리드</h2>
          </div>
          <div className="card-body p-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>회사명</th>
                  <th>단계</th>
                  <th>등록일</th>
                </tr>
              </thead>
              <tbody>
                {data.recentLeads.map((lead) => (
                  <tr key={lead.id}>
                    <td className="font-medium">{lead.company_name}</td>
                    <td>
                      <Badge className={STAGE_COLORS[lead.stage]}>{lead.stage}</Badge>
                    </td>
                    <td className="text-gray-500">
                      {new Date(lead.created_at).toLocaleDateString('ko-KR')}
                    </td>
                  </tr>
                ))}
                {data.recentLeads.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center text-gray-400 py-8">
                      등록된 리드가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 미처리 항목 */}
        <div className="card lg:col-span-2">
          <div className="card-header">
            <h2 className="text-lg font-semibold">미처리 항목</h2>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-orange-600">
                  {data.pendingItems.unassignedLeads}
                </p>
                <p className="text-sm text-gray-500 mt-1">담당자 미지정 리드</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-red-600">
                  {data.unpaidInvoices}
                </p>
                <p className="text-sm text-gray-500 mt-1">미납 청구서</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-yellow-600">
                  {data.pendingItems.openVocTickets}
                </p>
                <p className="text-sm text-gray-500 mt-1">미처리 VoC</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">
                  {data.pendingItems.expiringBilling}
                </p>
                <p className="text-sm text-gray-500 mt-1">과금 만료 임박</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
