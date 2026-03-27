'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loading } from '@/components/ui/loading'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatCurrency, STAGE_COLORS } from '@/lib/utils'
import { toast } from 'sonner'
import {
  CheckCircle2, Circle, Plus, Trash2, Clock, AlertTriangle,
  Users, FileText, Calendar, Phone, ArrowRight, Star,
  ListTodo, ChevronRight
} from 'lucide-react'

interface TodoItem {
  id: string
  text: string
  done: boolean
  priority: 'high' | 'medium' | 'low'
  source: 'manual' | 'auto'
  category?: string
  link?: string
  dueInfo?: string
}

interface AutoItem {
  id: string
  text: string
  category: string
  priority: 'high' | 'medium' | 'low'
  link?: string
  dueInfo?: string
}

export default function TodayPage() {
  const [loading, setLoading] = useState(true)
  const [autoItems, setAutoItems] = useState<AutoItem[]>([])
  const [manualTodos, setManualTodos] = useState<TodoItem[]>([])
  const [newTodo, setNewTodo] = useState('')
  const { user } = useAuth()
  const supabase = createClient()

  useEffect(() => {
    if (user) fetchAutoItems()
    // Load manual todos from localStorage
    const saved = localStorage.getItem('caas_todos')
    if (saved) {
      try { setManualTodos(JSON.parse(saved)) } catch { /* ignore */ }
    }
  }, [user])

  async function fetchAutoItems() {
    setLoading(true)
    const items: AutoItem[] = []
    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

    // 1. Overdue pipeline leads
    try {
      const { data: overdueLeads } = await supabase
        .from('pipeline_leads')
        .select('id, company_name, next_action, next_action_date, stage')
        .lt('next_action_date', today)
        .not('stage', 'in', '("도입완료","이탈")')
        .order('next_action_date', { ascending: true })
        .limit(10)

      if (overdueLeads) {
        overdueLeads.forEach(lead => {
          items.push({
            id: `lead-overdue-${lead.id}`,
            text: `[지연] ${lead.company_name} - ${lead.next_action || '후속 조치 필요'}`,
            category: '영업',
            priority: 'high',
            link: `/pipeline/${lead.id}`,
            dueInfo: `기한: ${formatDate(lead.next_action_date!)}`,
          })
        })
      }
    } catch { /* table might not exist */ }

    // 2. Today's pipeline actions
    try {
      const { data: todayLeads } = await supabase
        .from('pipeline_leads')
        .select('id, company_name, next_action, next_action_date')
        .eq('next_action_date', today)
        .limit(10)

      if (todayLeads) {
        todayLeads.forEach(lead => {
          items.push({
            id: `lead-today-${lead.id}`,
            text: `${lead.company_name} - ${lead.next_action || '오늘 액션'}`,
            category: '영업',
            priority: 'medium',
            link: `/pipeline/${lead.id}`,
            dueInfo: '오늘',
          })
        })
      }
    } catch { /* ignore */ }

    // 3. Invoices due today/tomorrow
    try {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, invoice_number, customer:customers(company_name), due_date, total')
        .in('due_date', [today, tomorrow])
        .eq('status', 'sent')
        .limit(10)

      if (invoices) {
        invoices.forEach((inv: any) => {
          const isDueToday = inv.due_date === today
          items.push({
            id: `invoice-${inv.id}`,
            text: `청구서 ${inv.invoice_number} - ${inv.customer?.company_name || ''}`,
            category: '재무',
            priority: isDueToday ? 'high' : 'medium',
            link: `/invoices/${inv.id}`,
            dueInfo: isDueToday ? '오늘 만기' : '내일 만기',
          })
        })
      }
    } catch { /* ignore */ }

    // 4. Today's meetings
    try {
      const { data: meetings } = await supabase
        .from('meetings')
        .select('id, company_name, meeting_date, customer:customers(company_name)')
        .gte('meeting_date', `${today}T00:00:00`)
        .lte('meeting_date', `${today}T23:59:59`)
        .limit(10)

      if (meetings) {
        meetings.forEach((m: any) => {
          items.push({
            id: `meeting-${m.id}`,
            text: `미팅: ${m.customer?.company_name || m.company_name || '-'}`,
            category: '미팅',
            priority: 'medium',
            link: `/meetings/${m.id}`,
            dueInfo: '오늘',
          })
        })
      }
    } catch { /* ignore */ }

    // 5. Pending quotations
    try {
      const { data: quotations } = await supabase
        .from('quotations')
        .select('id, quotation_number, customer_name, status')
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(5)

      if (quotations) {
        quotations.forEach(q => {
          items.push({
            id: `quotation-${q.id}`,
            text: `견적서 검토: ${q.quotation_number} - ${q.customer_name}`,
            category: '견적',
            priority: 'low',
            link: `/quotations/${q.id}`,
            dueInfo: '검토 대기',
          })
        })
      }
    } catch { /* ignore */ }

    setAutoItems(items)
    setLoading(false)
  }

  // Combine auto + manual, sort by priority
  const allTodos = useMemo(() => {
    const autoTodos: TodoItem[] = autoItems.map(item => ({
      ...item,
      done: false,
      source: 'auto' as const,
    }))
    const combined = [...autoTodos, ...manualTodos]
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    return combined.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1)
    })
  }, [autoItems, manualTodos])

  function addManualTodo() {
    if (!newTodo.trim()) return
    const todo: TodoItem = {
      id: `manual-${Date.now()}`,
      text: newTodo.trim(),
      done: false,
      priority: 'medium',
      source: 'manual',
    }
    const updated = [todo, ...manualTodos]
    setManualTodos(updated)
    localStorage.setItem('caas_todos', JSON.stringify(updated))
    setNewTodo('')
  }

  function toggleTodo(id: string) {
    const updated = manualTodos.map(t =>
      t.id === id ? { ...t, done: !t.done } : t
    )
    setManualTodos(updated)
    localStorage.setItem('caas_todos', JSON.stringify(updated))
  }

  function deleteTodo(id: string) {
    const updated = manualTodos.filter(t => t.id !== id)
    setManualTodos(updated)
    localStorage.setItem('caas_todos', JSON.stringify(updated))
  }

  const doneCount = allTodos.filter(t => t.done).length
  const totalCount = allTodos.length

  const PRIORITY_STYLES = {
    high: 'border-l-red-500',
    medium: 'border-l-yellow-500',
    low: 'border-l-gray-300',
  }

  const CATEGORY_ICONS: Record<string, typeof Clock> = {
    '영업': Phone,
    '재무': FileText,
    '미팅': Users,
    '견적': FileText,
  }

  const CATEGORY_COLORS: Record<string, string> = {
    '영업': 'bg-blue-50 text-blue-700',
    '재무': 'bg-green-50 text-green-700',
    '미팅': 'bg-purple-50 text-purple-700',
    '견적': 'bg-orange-50 text-orange-700',
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">오늘 할일</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {formatDate(new Date(), 'yyyy년 M월 d일 EEEE')}
            {totalCount > 0 && ` \u00b7 ${doneCount}/${totalCount} 완료`}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={fetchAutoItems}>
          새로고침
        </Button>
      </div>

      {/* Progress */}
      {totalCount > 0 && (
        <div className="card p-4 mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-text-secondary">오늘의 진행률</span>
            <span className="font-semibold text-text-primary">
              {totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0}%
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div className="h-2.5 rounded-full bg-gradient-to-r from-blue-500 to-green-500 transition-all"
              style={{ width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {/* Add manual todo */}
      <div className="flex gap-2 mb-6">
        <Input
          value={newTodo}
          onChange={e => setNewTodo(e.target.value)}
          placeholder="할일 추가..."
          className="flex-1"
          onKeyDown={e => { if (e.key === 'Enter') addManualTodo() }}
        />
        <Button onClick={addManualTodo} disabled={!newTodo.trim()}>
          <Plus className="w-4 h-4 mr-1" /> 추가
        </Button>
      </div>

      {/* Todo List */}
      {loading ? <Loading /> : allTodos.length === 0 ? (
        <div className="card p-12 text-center">
          <ListTodo className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-1">오늘 할일이 없습니다</h3>
          <p className="text-sm text-text-secondary">파이프라인, 청구서, 미팅 데이터에서 자동 생성됩니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {allTodos.map(todo => {
            const CatIcon = (todo.category && CATEGORY_ICONS[todo.category]) || ListTodo
            return (
              <div key={todo.id}
                className={`card p-3 border-l-4 ${PRIORITY_STYLES[todo.priority]} ${
                  todo.done ? 'opacity-50' : ''
                } hover:shadow-sm transition-all`}>
                <div className="flex items-start gap-3">
                  {/* Checkbox - only for manual */}
                  {todo.source === 'manual' ? (
                    <button onClick={() => toggleTodo(todo.id)} className="mt-0.5 flex-shrink-0">
                      {todo.done
                        ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                        : <Circle className="w-5 h-5 text-gray-300 hover:text-text-tertiary" />
                      }
                    </button>
                  ) : (
                    <div className="mt-0.5 flex-shrink-0">
                      {todo.priority === 'high'
                        ? <AlertTriangle className="w-5 h-5 text-red-500" />
                        : <Clock className="w-5 h-5 text-yellow-500" />
                      }
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${todo.done ? 'line-through text-text-secondary' : 'text-text-primary'}`}>
                        {todo.text}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {todo.category && (
                        <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${
                          CATEGORY_COLORS[todo.category] || 'bg-gray-50 text-gray-600'
                        }`}>
                          <CatIcon className="w-3 h-3" />
                          {todo.category}
                        </span>
                      )}
                      {todo.dueInfo && (
                        <span className={`text-xs ${
                          todo.dueInfo.includes('지연') || todo.dueInfo.includes('기한') ? 'text-red-500 font-medium' : 'text-text-secondary'
                        }`}>{todo.dueInfo}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {todo.link && (
                      <a href={todo.link} className="icon-btn" title="바로가기">
                        <ChevronRight className="w-4 h-4" />
                      </a>
                    )}
                    {todo.source === 'manual' && (
                      <button onClick={() => deleteTodo(todo.id)} className="icon-btn text-red-400 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
