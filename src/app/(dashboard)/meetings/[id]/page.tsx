'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { PageLoading } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import type { Meeting } from '@/types/database'
import { ArrowLeft } from 'lucide-react'

export default function MeetingDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id as string
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('meetings')
      .select('*, customer:customers(company_name)')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        setMeeting(data)
        setLoading(false)
      })
  }, [id])

  if (loading) return <PageLoading />
  if (!meeting) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">미팅을 찾을 수 없습니다.</p>
        <Link href="/meetings"><Button variant="secondary" className="mt-4">목록으로</Button></Link>
      </div>
    )
  }

  const sections = [
    { label: '페인 포인트', value: meeting.pain_points, color: 'border-red-200 bg-red-50' },
    { label: '좋은 점', value: meeting.positives, color: 'border-green-200 bg-green-50' },
    { label: '어려운 점 / 요청사항', value: meeting.difficulties, color: 'border-yellow-200 bg-yellow-50' },
    { label: '미팅 결과', value: meeting.meeting_result, color: 'border-blue-200 bg-blue-50' },
  ]

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/meetings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="page-title">
            {meeting.customer?.company_name || meeting.company_name || '미팅 상세'}
          </h1>
        </div>
      </div>

      <div className="card p-6 mb-6">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <dt className="text-sm text-gray-500">미팅일</dt>
            <dd className="text-sm font-medium">{formatDate(meeting.meeting_date)}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">업종</dt>
            <dd className="text-sm font-medium">{meeting.industry || '-'}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">유입경로</dt>
            <dd className="text-sm font-medium">{meeting.source || '-'}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">현장 수</dt>
            <dd className="text-sm font-medium">{meeting.site_count || '-'}</dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((s) => (
          <div key={s.label} className={`rounded-lg border p-4 ${s.color}`}>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{s.label}</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{s.value || '-'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
