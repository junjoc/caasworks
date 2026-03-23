'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageLoading } from '@/components/ui/loading'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { Customer, Project, MonthlyRevenue } from '@/types/database'
import { ArrowLeft, Building2, CreditCard, FolderOpen, Receipt } from 'lucide-react'

type Tab = 'info' | 'billing' | 'projects' | 'payments'

const STATUS_LABELS: Record<string, string> = {
  active: '활성',
  suspended: '일시중지',
  churned: '이탈',
}
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-yellow-100 text-yellow-700',
  churned: 'bg-red-100 text-red-700',
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [revenues, setRevenues] = useState<MonthlyRevenue[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('info')

  useEffect(() => {
    fetchAll()
  }, [id])

  async function fetchAll() {
    const [custRes, projRes, revRes] = await Promise.all([
      supabase
        .from('customers')
        .select('*, assigned_user:users!customers_assigned_to_fkey(id, name)')
        .eq('id', id)
        .single(),
      supabase.from('projects').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
      supabase.from('monthly_revenues').select('*').eq('customer_id', id).order('year', { ascending: false }).order('month', { ascending: false }),
    ])

    setCustomer(custRes.data)
    setProjects(projRes.data || [])
    setRevenues(revRes.data || [])
    setLoading(false)
  }

  if (loading) return <PageLoading />
  if (!customer) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">고객을 찾을 수 없습니다.</p>
        <Link href="/customers">
          <Button variant="secondary" className="mt-4">목록으로</Button>
        </Link>
      </div>
    )
  }

  const totalRevenue = revenues.reduce((sum, r) => sum + Number(r.amount), 0)

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'info', label: '기본정보', icon: <Building2 className="w-4 h-4" /> },
    { key: 'billing', label: '과금/계약', icon: <CreditCard className="w-4 h-4" /> },
    { key: 'projects', label: `프로젝트 (${projects.length})`, icon: <FolderOpen className="w-4 h-4" /> },
    { key: 'payments', label: '매출이력', icon: <Receipt className="w-4 h-4" /> },
  ]

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/customers" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="page-title">{customer.company_name}</h1>
          <Badge className={STATUS_COLORS[customer.status]}>
            {STATUS_LABELS[customer.status]}
          </Badge>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-label">누적 매출</div>
          <div className="stat-value">{formatCurrency(totalRevenue)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">프로젝트</div>
          <div className="stat-value">{projects.length}건</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">영업 담당</div>
          <div className="stat-value text-lg">{customer.assigned_user?.name || '-'}</div>
        </div>
      </div>

      {/* 탭 */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 탭 내용 */}
      {tab === 'info' && (
        <div className="card p-6">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              ['회사명', customer.company_name],
              ['타입', customer.company_type],
              ['담당자', customer.contact_person],
              ['연락처', customer.contact_phone],
              ['이메일', customer.contact_email],
              ['고객사 ID', customer.customer_code],
              ['사업자등록번호', customer.business_reg_no],
              ['상태', STATUS_LABELS[customer.status]],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-sm text-gray-500">{label}</dt>
                <dd className="text-sm font-medium text-gray-900 mt-0.5">{(value as string) || '-'}</dd>
              </div>
            ))}
            {customer.notes && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-gray-500">특이사항</dt>
                <dd className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">{customer.notes}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {tab === 'billing' && (
        <div className="card p-6">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              ['과금방식', customer.billing_type],
              ['이용 서비스', customer.service_type],
              ['이용유저 수', customer.user_count ? `${customer.user_count}명` : null],
              ['과금 시작일', customer.billing_start ? formatDate(customer.billing_start) : null],
              ['과금 종료일', customer.billing_end ? formatDate(customer.billing_end) : null],
              ['청구서 이메일', customer.invoice_email],
              ['청구 담당자', customer.invoice_contact],
              ['청구 연락처', customer.invoice_phone],
              ['세금계산서 이메일', customer.tax_invoice_email],
              ['보증금', customer.deposit_amount ? formatCurrency(Number(customer.deposit_amount)) : null],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-sm text-gray-500">{label}</dt>
                <dd className="text-sm font-medium text-gray-900 mt-0.5">{(value as string) || '-'}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {tab === 'projects' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>프로젝트명</th>
                <th>서비스</th>
                <th>과금시작</th>
                <th>과금종료</th>
                <th>월 과금액</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.project_name}</td>
                  <td>{p.service_type || '-'}</td>
                  <td className="text-gray-500">{p.billing_start ? formatDate(p.billing_start) : '-'}</td>
                  <td className="text-gray-500">{p.billing_end ? formatDate(p.billing_end) : '-'}</td>
                  <td>{p.monthly_amount ? formatCurrency(Number(p.monthly_amount)) : '-'}</td>
                  <td>
                    <Badge className={p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                      {p.status === 'active' ? '진행중' : p.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-gray-400 py-8">
                    등록된 프로젝트가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'payments' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>연도</th>
                <th>월</th>
                <th>금액</th>
                <th>입금확인</th>
              </tr>
            </thead>
            <tbody>
              {revenues.map((r) => (
                <tr key={r.id}>
                  <td>{r.year}</td>
                  <td>{r.month}월</td>
                  <td className="font-medium">{formatCurrency(Number(r.amount))}</td>
                  <td>
                    <Badge className={r.is_confirmed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                      {r.is_confirmed ? '확인' : '미확인'}
                    </Badge>
                  </td>
                </tr>
              ))}
              {revenues.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-gray-400 py-8">
                    매출 이력이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
