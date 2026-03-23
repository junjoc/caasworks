'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Loading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate } from '@/lib/utils'
import type { Meeting } from '@/types/database'
import { Plus, Calendar } from 'lucide-react'

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('meetings')
      .select('*, customer:customers(company_name)')
      .order('meeting_date', { ascending: false })
      .then(({ data }) => {
        setMeetings(data || [])
        setLoading(false)
      })
  }, [])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">미팅 관리</h1>
        <Link href="/meetings/new">
          <Button size="sm"><Plus className="w-4 h-4 mr-1" /> 새 미팅</Button>
        </Link>
      </div>

      {loading ? (
        <Loading />
      ) : meetings.length === 0 ? (
        <EmptyState icon={Calendar} title="미팅 기록이 없습니다" />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>차수</th>
                <th>업체명</th>
                <th>미팅일</th>
                <th>업종</th>
                <th>유입경로</th>
                <th>미팅결과</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => (
                <tr key={m.id}>
                  <td>{m.meeting_number || '-'}</td>
                  <td>
                    <Link href={`/meetings/${m.id}`} className="font-medium text-primary-600 hover:underline">
                      {m.customer?.company_name || m.company_name || '-'}
                    </Link>
                  </td>
                  <td>{formatDate(m.meeting_date)}</td>
                  <td className="text-gray-500">{m.industry || '-'}</td>
                  <td className="text-gray-500">{m.source || '-'}</td>
                  <td className="text-gray-500 max-w-[200px] truncate">{m.meeting_result || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
