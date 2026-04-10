'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageLoading } from '@/components/ui/loading'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils'
import type { Quotation, QuotationItem, QuotationStatus } from '@/types/database'
import { toast } from 'sonner'
import {
  ArrowLeft, Edit2, Send, CheckCircle, XCircle, Copy,
  GitBranch, FileText, Trash2, Clock, AlertTriangle, Download
} from 'lucide-react'
import dynamic from 'next/dynamic'

const PDFDownloadButton = dynamic(() => import('@/components/quotations/pdf/PDFDownloadButton'), { ssr: false })

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

const STATUS_ICONS: Record<QuotationStatus, React.ReactNode> = {
  draft: <FileText className="w-4 h-4" />,
  sent: <Send className="w-4 h-4" />,
  accepted: <CheckCircle className="w-4 h-4" />,
  rejected: <XCircle className="w-4 h-4" />,
  expired: <Clock className="w-4 h-4" />,
}

interface VersionRow {
  id: string
  quotation_number: string
  version: number
  status: string
  total: number
  created_at: string
}

const DISCOUNT_TYPE_LABELS: Record<string, string> = {
  none: '없음',
  rate: '할인율',
  amount: '할인금액',
  target: '목표금액',
}

export default function QuotationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const quotationId = params?.id as string

  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [items, setItems] = useState<QuotationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [activeTab, setActiveTab] = useState<'items' | 'analysis' | 'versions'>('items')

  const fetchQuotation = useCallback(async () => {
    const { data, error } = await supabase
      .from('quotations')
      .select('*, creator:users!quotations_created_by_fkey(id, name), lead:pipeline_leads(id, company_name)')
      .eq('id', quotationId)
      .single()

    if (error || !data) {
      toast.error('견적서를 찾을 수 없습니다')
      router.push('/quotations')
      return
    }

    setQuotation(data as Quotation)

    // Fetch items
    const { data: itemData } = await supabase
      .from('quotation_items')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('sort_order')

    setItems(itemData || [])

    // Fetch versions (same quotation_number)
    const { data: versionData } = await supabase
      .from('quotations')
      .select('id, quotation_number, version, status, total, created_at')
      .eq('quotation_number', data.quotation_number)
      .order('version', { ascending: false })

    // Also fetch versions linked via parent
    if (data.parent_quotation_id || versionData?.length === 1) {
      // Find all versions by looking at parent chain
      const { data: relatedByParent } = await supabase
        .from('quotations')
        .select('id, quotation_number, version, status, total, created_at')
        .or(`parent_quotation_id.eq.${quotationId},id.eq.${data.parent_quotation_id || '00000000-0000-0000-0000-000000000000'}`)

      const allVersions = [...(versionData || []), ...(relatedByParent || [])]
      const unique = Array.from(new Map(allVersions.map(v => [v.id, v])).values())
      setVersions(unique.sort((a, b) => b.version - a.version))
    } else {
      setVersions(versionData || [])
    }

    setLoading(false)
  }, [quotationId, supabase, router])

  useEffect(() => {
    fetchQuotation()
  }, [fetchQuotation])

  const updateStatus = async (newStatus: QuotationStatus) => {
    const { error } = await supabase
      .from('quotations')
      .update({ status: newStatus })
      .eq('id', quotationId)

    if (error) {
      toast.error('상태 변경 실패')
    } else {
      toast.success(`상태가 "${STATUS_LABELS[newStatus]}"(으)로 변경되었습니다`)
      fetchQuotation()
    }
  }

  const handleDelete = async () => {
    if (!confirm('이 견적서를 삭제하시겠습니까?')) return
    const { error } = await supabase.from('quotations').delete().eq('id', quotationId)
    if (error) {
      toast.error('삭제 실패')
    } else {
      toast.success('삭제되었습니다')
      router.push('/quotations')
    }
  }

  if (loading || !quotation) return <PageLoading />

  const q = quotation
  const isAdmin = user?.role === 'admin'
  const isDraft = q.status === 'draft'
  const isSent = q.status === 'sent'

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/quotations">
            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">{q.quotation_number}</h1>
              <Badge className={STATUS_COLORS[q.status]}>
                {STATUS_LABELS[q.status]}
              </Badge>
              {q.version > 1 && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">v{q.version}</span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {q.customer_name} {q.project_name ? `- ${q.project_name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Status transitions */}
          {isDraft && (
            <Button size="sm" onClick={() => updateStatus('sent')}>
              <Send className="w-4 h-4 mr-1" /> 발송 처리
            </Button>
          )}
          {isSent && (
            <>
              <Button size="sm" onClick={() => updateStatus('accepted')}>
                <CheckCircle className="w-4 h-4 mr-1" /> 수락
              </Button>
              <Button variant="danger" size="sm" onClick={() => updateStatus('rejected')}>
                <XCircle className="w-4 h-4 mr-1" /> 거절
              </Button>
            </>
          )}

          {isDraft && (
            <Link href={`/quotations/${q.id}/edit`}>
              <Button variant="secondary" size="sm">
                <Edit2 className="w-4 h-4 mr-1" /> 수정
              </Button>
            </Link>
          )}

          <Button
            variant="secondary" size="sm"
            onClick={() => router.push(`/quotations/new?copy_from=${q.id}`)}
          >
            <Copy className="w-4 h-4 mr-1" /> 복사
          </Button>
          <Button
            variant="secondary" size="sm"
            onClick={() => router.push(`/quotations/new?new_version_of=${q.id}`)}
          >
            <GitBranch className="w-4 h-4 mr-1" /> 새 버전
          </Button>
          <PDFDownloadButton quotation={q} items={items} />
          <Button variant="ghost" size="sm" onClick={handleDelete}>
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <h3 className="text-xs font-medium text-gray-500 mb-2">견적 정보</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">유형</span>
              <span className="font-medium">{q.quotation_type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">견적일</span>
              <span>{formatDate(q.quotation_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">유효기간</span>
              <span>{q.valid_until ? formatDate(q.valid_until) : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">담당자</span>
              <span>{q.creator?.name || '-'}</span>
            </div>
            {q.lead_id && (
              <div className="flex justify-between">
                <span className="text-gray-500">연결 리드</span>
                <Link href={`/pipeline/${q.lead_id}`} className="text-primary-600 hover:underline text-xs flex items-center gap-1">
                  <GitBranch className="w-3 h-3" />
                  {(q.lead as any)?.company_name || '리드 보기'}
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-xs font-medium text-gray-500 mb-2">수신처</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">고객사</span>
              <span className="font-medium">{q.customer_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">담당자</span>
              <span>{q.contact_person || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">공사명</span>
              <span className="text-right max-w-[180px] truncate">{q.project_name || '-'}</span>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-xs font-medium text-gray-500 mb-2">금액 요약</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">소계</span>
              <span>{formatCurrency(q.subtotal)}</span>
            </div>
            {q.discount_amount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>할인 ({DISCOUNT_TYPE_LABELS[q.discount_type]})</span>
                <span>-{formatCurrency(q.discount_amount)}</span>
              </div>
            )}
            {!q.vat_included && (
              <div className="flex justify-between">
                <span className="text-gray-500">부가세</span>
                <span>{formatCurrency(q.vat)}</span>
              </div>
            )}
            <hr />
            <div className="flex justify-between text-lg font-bold">
              <span>총합계</span>
              <span className="text-primary-600">{formatCurrency(q.total)}</span>
            </div>
            {q.vat_included && (
              <p className="text-xs text-gray-500 text-right">(부가세 포함)</p>
            )}
            {q.deposit > 0 && (
              <div className="flex justify-between text-sm mt-2 pt-2 border-t">
                <span className="text-gray-500">보증금</span>
                <div className="text-right">
                  <span className="font-medium">{formatCurrency(q.deposit)}</span>
                  {q.deposit_note && (
                    <p className="text-xs text-gray-500">{q.deposit_note}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b mb-4">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('items')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'items'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            견적 항목
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('analysis')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'analysis'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              원가/마진 분석
            </button>
          )}
          {versions.length > 1 && (
            <button
              onClick={() => setActiveTab('versions')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'versions'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              버전 이력 ({versions.length})
            </button>
          )}
        </div>
      </div>

      {/* Items Tab */}
      {activeTab === 'items' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-4 py-3 text-center w-10 font-medium text-gray-600">No</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">구분</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">품명</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">상세</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">단가</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">수량</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">단위</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">기간(월)</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">공급방식</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">공급가</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">비고</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b">
                    <td className="px-4 py-3 text-center text-gray-500">{item.item_no}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{item.category || '-'}</td>
                    <td className="px-4 py-3 font-medium">{item.item_name}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px] truncate">
                      {item.description || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">{formatNumber(item.unit_price)}</td>
                    <td className="px-4 py-3 text-center">{item.quantity}</td>
                    <td className="px-4 py-3 text-center">{item.unit}</td>
                    <td className="px-4 py-3 text-center">{item.period_months || '-'}</td>
                    <td className="px-4 py-3 text-center text-xs">{item.supply_method || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.amount)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{item.notes || ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50">
                  <td colSpan={9} className="px-4 py-2 text-right font-medium text-gray-600">소계</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(q.subtotal)}</td>
                  <td></td>
                </tr>
                {q.discount_amount > 0 && (
                  <tr className="bg-gray-50">
                    <td colSpan={9} className="px-4 py-2 text-right text-red-600">
                      할인 ({DISCOUNT_TYPE_LABELS[q.discount_type]}
                      {q.discount_type === 'rate' ? ` ${q.discount_value}%` : ''})
                    </td>
                    <td className="px-4 py-2 text-right text-red-600">-{formatCurrency(q.discount_amount)}</td>
                    <td></td>
                  </tr>
                )}
                {!q.vat_included && (
                  <tr className="bg-gray-50">
                    <td colSpan={9} className="px-4 py-2 text-right text-gray-600">부가세 (10%)</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(q.vat)}</td>
                    <td></td>
                  </tr>
                )}
                <tr className="bg-primary-50">
                  <td colSpan={9} className="px-4 py-3 text-right text-lg font-bold">총합계</td>
                  <td className="px-4 py-3 text-right text-lg font-bold text-primary-600">
                    {formatCurrency(q.total)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Analysis Tab (admin only) */}
      {activeTab === 'analysis' && isAdmin && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-4 py-3 text-center w-10 font-medium text-gray-600">No</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">품명</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">공급가</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">원가</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">마진</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">마진율</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const cost = (item.cost_price || 0) * item.quantity * (item.period_months || 1)
                  const margin = item.amount - cost
                  const marginRate = item.amount > 0 ? (margin / item.amount * 100) : 0
                  return (
                    <tr key={item.id} className="border-b">
                      <td className="px-4 py-3 text-center text-gray-500">{item.item_no}</td>
                      <td className="px-4 py-3 font-medium">{item.item_name}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(item.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        {item.cost_price ? formatCurrency(cost) : '-'}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.cost_price ? formatCurrency(margin) : '-'}
                      </td>
                      <td className={`px-4 py-3 text-right ${marginRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.cost_price ? `${marginRate.toFixed(1)}%` : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-medium">
                  <td colSpan={2} className="px-4 py-3 text-right">합계</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(q.subtotal)}</td>
                  <td className="px-4 py-3 text-right">
                    {formatCurrency(items.reduce((sum, i) => sum + (i.cost_price || 0) * i.quantity * (i.period_months || 1), 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-green-600">
                    {formatCurrency(q.subtotal - items.reduce((sum, i) => sum + (i.cost_price || 0) * i.quantity * (i.period_months || 1), 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-green-600">
                    {q.subtotal > 0
                      ? `${((q.subtotal - items.reduce((sum, i) => sum + (i.cost_price || 0) * i.quantity * (i.period_months || 1), 0)) / q.subtotal * 100).toFixed(1)}%`
                      : '-'
                    }
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="p-4 bg-yellow-50 border-t flex items-center gap-2 text-sm text-yellow-700">
            <AlertTriangle className="w-4 h-4" />
            원가 정보가 없는 항목은 마진 계산에서 제외됩니다. 제품 카탈로그에서 원가를 등록해주세요.
          </div>
        </div>
      )}

      {/* Versions Tab */}
      {activeTab === 'versions' && versions.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">버전</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">견적번호</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">상태</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">합계</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">작성일</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody>
              {versions.map(v => (
                <tr
                  key={v.id}
                  className={`border-b ${v.id === quotationId ? 'bg-primary-50' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-4 py-3">
                    <span className="font-medium">v{v.version}</span>
                    {v.id === quotationId && (
                      <span className="ml-2 text-xs text-primary-600">(현재)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{v.quotation_number}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge className={STATUS_COLORS[v.status as QuotationStatus]}>
                      {STATUS_LABELS[v.status as QuotationStatus]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">{formatCurrency(v.total)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(v.created_at)}</td>
                  <td className="px-4 py-3 text-center">
                    {v.id !== quotationId && (
                      <Link href={`/quotations/${v.id}`} className="text-primary-600 hover:underline text-xs">
                        보기
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Terms & Notes */}
      {(q.terms || q.notes) && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {q.terms && (
            <div className="card p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">안내사항 / 약관</h3>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans">{q.terms}</pre>
            </div>
          )}
          {q.notes && (
            <div className="card p-4 border-yellow-200 bg-yellow-50">
              <h3 className="text-sm font-medium text-yellow-700 mb-2">내부 메모</h3>
              <pre className="text-xs text-yellow-700 whitespace-pre-wrap font-sans">{q.notes}</pre>
            </div>
          )}
        </div>
      )}

      {/* Metadata */}
      <div className="mt-6 text-xs text-gray-400 flex gap-4">
        <span>생성: {formatDate(q.created_at, 'yyyy-MM-dd HH:mm')}</span>
        <span>수정: {formatDate(q.updated_at, 'yyyy-MM-dd HH:mm')}</span>
      </div>
    </div>
  )
}
