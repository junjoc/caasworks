'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { QuotationStatus } from '@/types/database'
import { Plus, FileText, ExternalLink } from 'lucide-react'

const STATUS_LABELS: Record<QuotationStatus, string> = {
  draft: '초안',
  sent: '발송',
  accepted: '수락',
  rejected: '거절',
  expired: '만료',
}

const STATUS_COLORS: Record<QuotationStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-orange-100 text-orange-700',
}

interface QuotationRow {
  id: string
  quotation_number: string
  customer_name: string
  project_name: string | null
  quotation_type: string
  version: number
  status: QuotationStatus
  total: number
  valid_until: string | null
  created_at: string
  creator?: { id: string; name: string }
}

interface QuotationSectionProps {
  leadId: string
  companyName: string
  userId: string
}

export default function QuotationSection({ leadId, companyName, userId }: QuotationSectionProps) {
  const supabase = createClient()
  const [quotations, setQuotations] = useState<QuotationRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchQuotations = useCallback(async () => {
    const { data, error } = await supabase
      .from('quotations')
      .select('id, quotation_number, customer_name, project_name, quotation_type, version, status, total, valid_until, created_at, creator:users!quotations_created_by_fkey(id, name)')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setQuotations((data || []).map((d: any) => ({
        ...d,
        creator: Array.isArray(d.creator) ? d.creator[0] : d.creator,
      })) as QuotationRow[])
    }
    setLoading(false)
  }, [leadId, supabase])

  useEffect(() => {
    fetchQuotations()
  }, [fetchQuotations])

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-400" />
          견적서
          {quotations.length > 0 && (
            <span className="text-sm font-normal text-gray-400">({quotations.length})</span>
          )}
        </h2>
        <Link href={`/quotations/new?lead_id=${leadId}`}>
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" /> 견적서 작성
          </Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">로딩 중...</p>
      ) : quotations.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">아직 견적서가 없습니다.</p>
          <p className="text-xs mt-1">
            <Link href={`/quotations/new?lead_id=${leadId}`} className="text-primary-600 hover:underline">
              견적서 작성
            </Link>
            {' '}버튼으로 첫 견적서를 만들어보세요.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {quotations.map((q) => (
            <Link
              key={q.id}
              href={`/quotations/${q.id}`}
              className="flex items-center gap-3 px-4 py-3 border rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400">{q.quotation_number}</span>
                  <Badge className={STATUS_COLORS[q.status]}>{STATUS_LABELS[q.status]}</Badge>
                  {q.version > 1 && (
                    <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">v{q.version}</span>
                  )}
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{q.quotation_type}</span>
                </div>
                <p className="text-sm text-gray-600 mt-0.5 truncate">
                  {q.project_name || q.customer_name}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-gray-900">{formatCurrency(q.total)}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDate(q.created_at)}
                </p>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-300 group-hover:text-primary-600 shrink-0" />
            </Link>
          ))}

          {/* Link to full list */}
          <div className="text-center pt-2">
            <Link
              href={`/quotations?search=${encodeURIComponent(companyName)}`}
              className="text-xs text-primary-600 hover:underline"
            >
              견적서 관리 페이지에서 전체 보기
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
