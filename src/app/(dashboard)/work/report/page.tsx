'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loading } from '@/components/ui/loading'
import { formatDate, formatCurrency, ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Sparkles, Copy, Save, FileText, Clock,
  TrendingUp, Calendar, ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react'

interface DailyReport {
  id: string
  report_date: string
  main_activities: string
  sales_status: string
  tomorrow_plan: string
  created_by: string
  created_at: string
  updated_at: string
}

const CREATE_TABLE_SQL = `-- Supabase SQL Editor에서 실행하세요
CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date DATE NOT NULL,
  main_activities TEXT DEFAULT '',
  sales_status TEXT DEFAULT '',
  tomorrow_plan TEXT DEFAULT '',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(report_date, created_by)
);

ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON daily_reports
  FOR ALL USING (auth.role() = 'authenticated');`

export default function ReportPage() {
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tableExists, setTableExists] = useState(true)
  const [reportId, setReportId] = useState<string | null>(null)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [mainActivities, setMainActivities] = useState('')
  const [salesStatus, setSalesStatus] = useState('')
  const [tomorrowPlan, setTomorrowPlan] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<DailyReport[]>([])
  const { user } = useAuth()
  const supabase = createClient()

  useEffect(() => {
    if (user) {
      loadReport(date)
      loadHistory()
    }
  }, [user, date])

  async function loadReport(reportDate: string) {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('report_date', reportDate)
      .eq('created_by', user.id)
      .maybeSingle()

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        setTableExists(false)
      }
    } else if (data) {
      setReportId(data.id)
      setMainActivities(data.main_activities || '')
      setSalesStatus(data.sales_status || '')
      setTomorrowPlan(data.tomorrow_plan || '')
    } else {
      setReportId(null)
      setMainActivities('')
      setSalesStatus('')
      setTomorrowPlan('')
    }
    setLoading(false)
  }

  async function loadHistory() {
    if (!user) return
    const { data } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('created_by', user.id)
      .order('report_date', { ascending: false })
      .limit(10)
    if (data) setHistory(data)
  }

  async function generateReport() {
    if (!user) return
    setGenerating(true)
    const today = date
    const lines: string[] = []
    const salesLines: string[] = []

    // 1. Activity logs today
    try {
      const { data: activities } = await supabase
        .from('activity_logs')
        .select('activity_type, title, description, performed_at')
        .eq('performed_by', user.id)
        .gte('performed_at', `${today}T00:00:00`)
        .lte('performed_at', `${today}T23:59:59`)
        .order('performed_at', { ascending: true })

      if (activities && activities.length > 0) {
        activities.forEach(a => {
          const typeLabel = ACTIVITY_TYPE_LABELS[a.activity_type] || a.activity_type
          const time = a.performed_at ? formatDate(a.performed_at, 'HH:mm') : ''
          lines.push(`- [${time}] ${typeLabel}: ${a.title || a.description || ''}`)
        })
      }
    } catch { /* ignore */ }

    // 2. Pipeline changes today
    try {
      const { data: pipelineChanges } = await supabase
        .from('pipeline_history')
        .select('lead_id, field_changed, old_value, new_value, changed_at, pipeline_leads!inner(company_name)')
        .eq('changed_by', user.id)
        .gte('changed_at', `${today}T00:00:00`)
        .lte('changed_at', `${today}T23:59:59`)
        .limit(20)

      if (pipelineChanges && pipelineChanges.length > 0) {
        const byLead: Record<string, string[]> = {}
        pipelineChanges.forEach((pc: any) => {
          const name = pc.pipeline_leads?.company_name || '미확인'
          if (!byLead[name]) byLead[name] = []
          if (pc.field_changed === 'stage') {
            byLead[name].push(`단계: ${pc.old_value} -> ${pc.new_value}`)
          }
        })
        Object.entries(byLead).forEach(([name, changes]) => {
          salesLines.push(`- ${name}: ${changes.join(', ')}`)
        })
      }
    } catch { /* ignore */ }

    // 3. Quotations created today
    try {
      const { data: quotations } = await supabase
        .from('quotations')
        .select('quotation_number, customer_name, total')
        .eq('created_by', user.id)
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`)

      if (quotations && quotations.length > 0) {
        quotations.forEach(q => {
          salesLines.push(`- 견적 작성: ${q.quotation_number} (${q.customer_name}) ${formatCurrency(q.total)}`)
        })
      }
    } catch { /* ignore */ }

    // 4. Meetings today
    try {
      const { data: meetings } = await supabase
        .from('meetings')
        .select('company_name, meeting_result, customer:customers(company_name)')
        .gte('meeting_date', `${today}T00:00:00`)
        .lte('meeting_date', `${today}T23:59:59`)

      if (meetings && meetings.length > 0) {
        meetings.forEach((m: any) => {
          const name = m.customer?.company_name || m.company_name || '-'
          lines.push(`- 미팅: ${name} ${m.meeting_result ? `(${m.meeting_result.slice(0, 50)})` : ''}`)
        })
      }
    } catch { /* ignore */ }

    // Compose
    if (lines.length === 0) {
      lines.push('- (자동 수집된 활동이 없습니다. 직접 입력해 주세요.)')
    }

    setMainActivities(lines.join('\n'))
    if (salesLines.length > 0) {
      setSalesStatus(salesLines.join('\n'))
    } else {
      setSalesStatus('- (파이프라인 변동사항 없음)')
    }

    if (!tomorrowPlan) {
      // Auto-generate tomorrow plan from upcoming actions
      try {
        const tomorrowDate = new Date(Date.now() + 86400000).toISOString().split('T')[0]
        const { data: tomorrowLeads } = await supabase
          .from('pipeline_leads')
          .select('company_name, next_action')
          .eq('next_action_date', tomorrowDate)
          .limit(5)

        if (tomorrowLeads && tomorrowLeads.length > 0) {
          const planLines = tomorrowLeads.map(l => `- ${l.company_name}: ${l.next_action || '후속 조치'}`)
          setTomorrowPlan(planLines.join('\n'))
        } else {
          setTomorrowPlan('- (내일 예정된 액션을 입력해 주세요.)')
        }
      } catch {
        setTomorrowPlan('- (내일 예정된 액션을 입력해 주세요.)')
      }
    }

    setGenerating(false)
    toast.success('보고서 자동 생성 완료')
  }

  async function saveReport() {
    if (!user) return
    setSaving(true)
    const payload = {
      report_date: date,
      main_activities: mainActivities,
      sales_status: salesStatus,
      tomorrow_plan: tomorrowPlan,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    }

    if (reportId) {
      const { error } = await supabase.from('daily_reports').update(payload).eq('id', reportId)
      if (error) toast.error('저장 실패: ' + error.message)
      else toast.success('보고서 저장 완료')
    } else {
      const { data, error } = await supabase.from('daily_reports').insert(payload).select('id').single()
      if (error) toast.error('저장 실패: ' + error.message)
      else { setReportId(data.id); toast.success('보고서 저장 완료') }
    }
    setSaving(false)
    loadHistory()
  }

  function copyToClipboard() {
    const text = `[일일업무보고] ${formatDate(date, 'yyyy-MM-dd (EEEE)')}
작성자: ${user?.name || '-'}

■ 주요 활동
${mainActivities}

■ 영업 현황
${salesStatus}

■ 내일 계획
${tomorrowPlan}`

    navigator.clipboard.writeText(text)
    toast.success('클립보드에 복사됨')
  }

  if (!tableExists) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">일일업무보고</h1></div>
        <div className="card p-6">
          <div className="flex items-start gap-3 mb-4">
            <FileText className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-text-primary mb-1">테이블 생성 필요</h3>
              <p className="text-sm text-text-secondary mb-3">아래 SQL을 Supabase SQL Editor에서 실행하세요.</p>
            </div>
          </div>
          <pre className="bg-gray-900 text-green-400 text-xs p-4 rounded-lg overflow-x-auto whitespace-pre">{CREATE_TABLE_SQL}</pre>
          <div className="mt-4">
            <Button size="sm" variant="secondary" icon={<Copy className="w-4 h-4" />}
              onClick={() => { navigator.clipboard.writeText(CREATE_TABLE_SQL); toast.success('SQL 복사됨') }}>SQL 복사</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">일일업무보고</h1>
          <p className="text-sm text-text-secondary mt-0.5">{user?.name || '-'}</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="input-base !w-40" />
          <Button size="sm" variant="secondary" onClick={generateReport} loading={generating}
            icon={<Sparkles className="w-4 h-4" />}>
            자동 생성
          </Button>
        </div>
      </div>

      {loading ? <Loading /> : (
        <div className="space-y-4">
          {/* Main Activities */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-5 bg-blue-500 rounded-full" />
              <h3 className="font-semibold text-text-primary">주요 활동</h3>
            </div>
            <Textarea
              value={mainActivities}
              onChange={e => setMainActivities(e.target.value)}
              placeholder="오늘의 주요 업무 활동을 입력하세요..."
              rows={6}
            />
          </div>

          {/* Sales Status */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-5 bg-green-500 rounded-full" />
              <h3 className="font-semibold text-text-primary">영업 현황</h3>
            </div>
            <Textarea
              value={salesStatus}
              onChange={e => setSalesStatus(e.target.value)}
              placeholder="파이프라인 변동, 견적서 작성, 계약 현황 등..."
              rows={4}
            />
          </div>

          {/* Tomorrow Plan */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-5 bg-orange-500 rounded-full" />
              <h3 className="font-semibold text-text-primary">내일 계획</h3>
            </div>
            <Textarea
              value={tomorrowPlan}
              onChange={e => setTomorrowPlan(e.target.value)}
              placeholder="내일 예정된 업무를 입력하세요..."
              rows={4}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center">
            <Button variant="secondary" onClick={copyToClipboard}
              icon={<Copy className="w-4 h-4" />}>
              텍스트 복사
            </Button>
            <Button onClick={saveReport} loading={saving}
              icon={<Save className="w-4 h-4" />}>
              {reportId ? '수정 저장' : '저장'}
            </Button>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="card">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="font-semibold text-text-primary flex items-center gap-2">
                  <Clock className="w-4 h-4 text-text-tertiary" />
                  이전 보고서 ({history.length}건)
                </span>
                {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showHistory && (
                <div className="border-t border-border-light divide-y divide-border-light">
                  {history.map(h => (
                    <button key={h.id}
                      onClick={() => setDate(h.report_date)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                        h.report_date === date ? 'bg-blue-50' : ''
                      }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-text-primary">
                          {formatDate(h.report_date, 'yyyy-MM-dd (EEEE)')}
                        </span>
                        <span className="text-xs text-text-secondary">
                          {formatDate(h.updated_at, 'HH:mm')} 저장
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary mt-0.5 truncate">
                        {h.main_activities?.split('\n')[0] || '(내용 없음)'}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
