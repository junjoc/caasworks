'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Loading } from '@/components/ui/loading'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { Save, Plus, Trash2, Wallet } from 'lucide-react'

interface BudgetRow {
  id?: string
  year: number
  month: number
  channel: string
  budget_amount: number
  isNew?: boolean
}

const CHANNEL_OPTIONS = [
  { value: '네이버', label: '네이버' },
  { value: '구글', label: '구글' },
  { value: '메타', label: '메타' },
  { value: '유튜브', label: '유튜브' },
  { value: '블로그', label: '블로그/콘텐츠' },
  { value: '기타', label: '기타' },
]

export default function MarketingSettingsPage() {
  const [budgets, setBudgets] = useState<BudgetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [year, setYear] = useState(() => new Date().getFullYear())
  const supabase = createClient()

  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 5 }, (_, i) => ({
    value: String(currentYear - i),
    label: `${currentYear - i}년`,
  }))

  const fetchBudgets = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('marketing_budgets')
      .select('*')
      .eq('year', year)
      .order('month', { ascending: true })
      .order('channel', { ascending: true })

    if (error) {
      console.error('budget fetch error:', error)
      setBudgets([])
    } else {
      setBudgets(data || [])
    }
    setLoading(false)
  }, [year])

  useEffect(() => { fetchBudgets() }, [fetchBudgets])

  // 월별 그리드 데이터 생성
  const monthlyGrid = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const monthBudgets = budgets.filter(b => b.month === month)
    const total = monthBudgets.reduce((s, b) => s + b.budget_amount, 0)
    return { month, budgets: monthBudgets, total }
  })

  const yearTotal = budgets.reduce((s, b) => s + b.budget_amount, 0)

  function addBudgetRow(month: number) {
    const usedChannels = budgets.filter(b => b.month === month).map(b => b.channel)
    const availableChannel = CHANNEL_OPTIONS.find(c => !usedChannels.includes(c.value))
    if (!availableChannel) {
      toast.error('모든 채널이 이미 추가되었습니다')
      return
    }
    setBudgets([...budgets, {
      year,
      month,
      channel: availableChannel.value,
      budget_amount: 0,
      isNew: true,
    }])
  }

  function updateBudgetRow(index: number, field: keyof BudgetRow, value: string | number) {
    const updated = [...budgets]
    updated[index] = { ...updated[index], [field]: value }
    setBudgets(updated)
  }

  function removeBudgetRow(index: number) {
    setBudgets(budgets.filter((_, i) => i !== index))
  }

  async function handleSave() {
    setSaving(true)

    // Delete all existing budgets for this year, then insert all
    const { error: deleteError } = await supabase
      .from('marketing_budgets')
      .delete()
      .eq('year', year)

    if (deleteError) {
      toast.error('저장 실패: ' + deleteError.message)
      setSaving(false)
      return
    }

    const rows = budgets
      .filter(b => b.budget_amount > 0)
      .map(b => ({
        year: b.year,
        month: b.month,
        channel: b.channel,
        budget_amount: b.budget_amount,
      }))

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from('marketing_budgets')
        .insert(rows)

      if (insertError) {
        toast.error('저장 실패: ' + insertError.message)
        setSaving(false)
        return
      }
    }

    toast.success('예산 저장 완료')
    setSaving(false)
    fetchBudgets()
  }

  // 빠른 템플릿: 매월 동일 예산 세팅
  function applyTemplate() {
    const template: BudgetRow[] = []
    for (let m = 1; m <= 12; m++) {
      CHANNEL_OPTIONS.forEach(ch => {
        const existing = budgets.find(b => b.month === m && b.channel === ch.value)
        template.push({
          year,
          month: m,
          channel: ch.value,
          budget_amount: existing?.budget_amount || 0,
          isNew: !existing?.id,
          id: existing?.id,
        })
      })
    }
    setBudgets(template)
    toast.success('12개월 x 전체 채널 템플릿 적용')
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">마케팅 예산 설정</h1>
        <div className="flex items-center gap-2">
          <Select options={yearOptions} value={String(year)}
            onChange={e => setYear(Number(e.target.value))} className="!w-32" />
          <Button size="sm" variant="secondary" onClick={applyTemplate}>
            전체 채널 템플릿
          </Button>
          <Button size="sm" onClick={handleSave} loading={saving}>
            <Save className="w-4 h-4 mr-1" /> 저장
          </Button>
        </div>
      </div>

      {/* Year Summary */}
      <div className="card p-4 mb-6">
        <div className="flex items-center gap-3">
          <Wallet className="w-5 h-5 text-blue-500" />
          <div>
            <p className="text-sm text-text-secondary">{year}년 총 예산</p>
            <p className="text-xl font-bold text-text-primary">{formatCurrency(yearTotal)}</p>
          </div>
        </div>
      </div>

      {loading ? <Loading /> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {monthlyGrid.map(({ month, budgets: monthBudgets, total }) => (
            <div key={month} className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-text-primary">{month}월</h3>
                <span className="text-sm font-medium text-text-secondary">{formatCurrency(total)}</span>
              </div>

              {monthBudgets.length === 0 ? (
                <p className="text-xs text-text-secondary text-center py-2">예산 없음</p>
              ) : (
                <div className="space-y-2">
                  {monthBudgets.map((b, _) => {
                    const globalIndex = budgets.indexOf(b)
                    return (
                      <div key={`${b.month}-${b.channel}-${globalIndex}`} className="flex items-center gap-2">
                        <select
                          value={b.channel}
                          onChange={e => updateBudgetRow(globalIndex, 'channel', e.target.value)}
                          className="input-base !py-1 !text-xs flex-shrink-0 w-20"
                        >
                          {CHANNEL_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={b.budget_amount || ''}
                          onChange={e => updateBudgetRow(globalIndex, 'budget_amount', Number(e.target.value))}
                          placeholder="금액"
                          className="input-base !py-1 !text-xs flex-1 text-right"
                        />
                        <button onClick={() => removeBudgetRow(globalIndex)}
                          className="text-red-400 hover:text-red-600 p-0.5">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              <button onClick={() => addBudgetRow(month)}
                className="w-full mt-2 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-gray-50 rounded border border-dashed border-gray-200 flex items-center justify-center gap-1 transition-colors">
                <Plus className="w-3 h-3" /> 채널 추가
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
