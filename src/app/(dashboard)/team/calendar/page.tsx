'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/ui/loading'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface CalendarEvent {
  id: string
  title: string
  name: string | null
  type: 'vacation' | 'remote' | 'meeting' | 'other'
  start: string
  end: string
  allDay: boolean
}

const TYPE_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  vacation: { bg: 'bg-green-100', text: 'text-green-700', icon: '🌴' },
  remote: { bg: 'bg-blue-100', text: 'text-blue-700', icon: '🧑‍💻' },
  meeting: { bg: 'bg-purple-100', text: 'text-purple-700', icon: '🤝' },
  other: { bg: 'bg-surface-tertiary', text: 'text-gray-600', icon: '📅' },
}

const FILTERS = [
  { value: 'all', label: '전체' },
  { value: 'vacation', label: '🌴 휴가' },
  { value: 'work', label: '🧑‍💻 원격근무' },
]

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function TeamCalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [filter, setFilter] = useState('all')
  const [nameFilter, setNameFilter] = useState('전체')
  const [teamMembers, setTeamMembers] = useState<string[]>([])
  const supabase = createClient()

  useEffect(() => {
    // Load team member settings
    supabase.from('company_settings').select('value').eq('key', 'calendar_team_members').single()
      .then(({ data }) => {
        if (data?.value && Array.isArray(data.value)) setTeamMembers(data.value)
      })
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [year, month, filter, teamMembers])

  async function fetchEvents() {
    setLoading(true)
    try {
      let url = `/api/calendar?year=${year}&month=${month}&filter=${filter}`
      if (teamMembers.length > 0) {
        url += `&members=${encodeURIComponent(teamMembers.join(','))}`
      }
      const res = await fetch(url)
      const data = await res.json()
      setEvents(data.events || [])
    } catch (err) {
      console.error('Calendar fetch error:', err)
      setEvents([])
    }
    setLoading(false)
  }

  const names = ['전체', ...Array.from(new Set(events.filter(e => e.name).map(e => e.name!)))]
  const filteredEvents = nameFilter === '전체' ? events : events.filter(e => e.name === nameFilter)

  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month

  function getEventsForDay(day: number): CalendarEvent[] {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return filteredEvents.filter(e => {
      const start = e.start.split('T')[0]
      const end = e.allDay ? e.end : e.end.split('T')[0]
      return (start <= dateStr && dateStr < end) || start === dateStr
    })
  }

  const prevMonth = () => {
    if (month === 1) { setYear(year - 1); setMonth(12) } else setMonth(month - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(year + 1); setMonth(1) } else setMonth(month + 1)
  }

  const vacationCount = events.filter(e => e.type === 'vacation').length
  const remoteCount = events.filter(e => e.type === 'remote').length
  const meetingCount = events.filter(e => e.type === 'meeting').length

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Calendar className="w-6 h-6" /> 팀 캘린더
          {teamMembers.length > 0 && (
            <span className="text-xs font-normal text-text-tertiary ml-2">({teamMembers.length}명)</span>
          )}
        </h1>
        <Link href="/team/leave">
          <Button variant="secondary" size="sm">팀원 관리</Button>
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><span className="text-lg">🌴</span><span className="stat-label">휴가</span></div>
          <div className="stat-value">{vacationCount}건</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><span className="text-lg">🧑‍💻</span><span className="stat-label">원격근무</span></div>
          <div className="stat-value">{remoteCount}건</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><span className="text-lg">🤝</span><span className="stat-label">미팅/교육</span></div>
          <div className="stat-value">{meetingCount}건</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-lg font-semibold min-w-[120px] text-center">{year}년 {month}월</span>
          <Button variant="ghost" size="sm" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <div className="flex gap-2">
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} options={FILTERS} className="w-32" />
          {names.length > 1 && (
            <Select value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} options={names.map(n => ({ value: n, label: n }))} className="w-28" />
          )}
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b bg-surface-tertiary">
            {WEEKDAYS.map((day, i) => (
              <div key={day} className={`px-2 py-2 text-center text-xs font-medium ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-text-secondary'}`}>{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDay }, (_, i) => (
              <div key={`e-${i}`} className="min-h-[100px] border-b border-r p-1 bg-surface-tertiary/50" />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1
              const dayEvents = getEventsForDay(day)
              const isToday = isCurrentMonth && today.getDate() === day
              const dow = new Date(year, month - 1, day).getDay()
              return (
                <div key={day} className={`min-h-[100px] border-b border-r p-1 ${isToday ? 'bg-blue-50/50' : ''}`}>
                  <div className={`text-xs font-medium mb-1 px-1 ${
                    isToday ? 'bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center' :
                    dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-gray-700'
                  }`}>{day}</div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((event) => {
                      const style = TYPE_STYLES[event.type] || TYPE_STYLES.other
                      return (
                        <div key={event.id} className={`${style.bg} ${style.text} text-[10px] px-1 py-0.5 rounded truncate`} title={event.title}>
                          {event.name ? `${style.icon} ${event.name}` : event.title}
                        </div>
                      )
                    })}
                    {dayEvents.length > 3 && <div className="text-[9px] text-text-tertiary px-1">+{dayEvents.length - 3}건</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!loading && filteredEvents.length > 0 && (
        <div className="card p-4 mt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{month}월 일정 ({filteredEvents.length}건)</h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {filteredEvents.map(event => {
              const style = TYPE_STYLES[event.type] || TYPE_STYLES.other
              const startDate = event.start.split('T')[0]
              const startTime = event.allDay ? '종일' : event.start.split('T')[1]?.substring(0, 5)
              return (
                <div key={event.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-xs text-text-tertiary min-w-[50px]">{startDate.substring(5)}</span>
                  <Badge className={`${style.bg} ${style.text} text-xs`}>{style.icon}</Badge>
                  <span className="text-gray-800 font-medium">{event.name || '-'}</span>
                  <span className="text-text-tertiary text-xs">{startTime}</span>
                  <span className="text-text-secondary text-xs truncate flex-1">{event.title}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
