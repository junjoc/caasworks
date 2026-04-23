'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Search } from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'

interface Asset {
  id: string
  asset_code: string | null
  category: string | null
  model: string | null
  serial_no: string | null
  purchase_date: string | null
  purchase_price: number | null
  vendor: string | null
  status: string
  current_site: string | null
  current_customer_id: string | null
  notes: string | null
}

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-100 text-green-700',
  in_use: 'bg-blue-100 text-blue-700',
  repair: 'bg-amber-100 text-amber-700',
  disposed: 'bg-gray-100 text-gray-500',
}
const STATUS_LABELS: Record<string, string> = {
  available: '가용', in_use: '사용중', repair: '수리', disposed: '폐기',
}

export default function AssetsPage() {
  const [items, setItems] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('전체')

  useEffect(() => {
    const sb = createClient()
    sb.from('assets').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
      if (error) {
        setError(error.message.includes('does not exist')
          ? '⚠ assets 테이블이 없습니다. migration 007을 실행해 주세요.'
          : error.message)
      } else {
        setItems(data || [])
      }
      setLoading(false)
    })
  }, [])

  const filtered = items.filter(i => {
    if (statusFilter !== '전체' && i.status !== statusFilter) return false
    if (q && !JSON.stringify(i).toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  if (loading) return <Loading />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">자산 관리</h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            카메라 · LTE · AP 등 보유 장비 — 총 {items.length}대 / 표시 {filtered.length}대
          </p>
        </div>
        <Button size="sm"><Plus className="w-4 h-4 mr-1" /> 자산 등록</Button>
      </div>

      {error && (
        <div className="card p-4 mb-4 bg-amber-50 border-amber-200 text-sm text-amber-800">
          {error}
        </div>
      )}

      <div className="card p-3 mb-4 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
          <input type="text" placeholder="검색..." value={q} onChange={e => setQ(e.target.value)}
            className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-lg" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="전체">상태 전체</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>자산 코드</th><th>카테고리</th><th>모델</th><th>S/N</th>
              <th>구매일</th><th>구매가</th><th>현재 현장</th><th>상태</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-text-tertiary py-6">등록된 자산이 없습니다.</td></tr>
            ) : filtered.map(a => (
              <tr key={a.id}>
                <td className="font-mono text-xs">{a.asset_code || '-'}</td>
                <td>{a.category || '-'}</td>
                <td>{a.model || '-'}</td>
                <td className="font-mono text-xs text-text-tertiary">{a.serial_no || '-'}</td>
                <td className="text-text-tertiary">{a.purchase_date ? formatDate(a.purchase_date, 'yyyy-MM-dd') : '-'}</td>
                <td className="text-right">{a.purchase_price ? formatCurrency(a.purchase_price) : '-'}</td>
                <td>{a.current_site || '-'}</td>
                <td><Badge className={STATUS_COLORS[a.status] || ''}>{STATUS_LABELS[a.status] || a.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
