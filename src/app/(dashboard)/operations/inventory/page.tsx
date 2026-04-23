'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { Plus, Search } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface InventoryItem {
  id: string
  sku: string | null
  name: string
  category: string | null
  current_qty: number
  reorder_point: number | null
  unit_cost: number | null
  location: string | null
  last_stock_count_at: string | null
  notes: string | null
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    const sb = createClient()
    sb.from('inventory_items').select('*').order('name').then(({ data, error }) => {
      if (error) {
        setError(error.message.includes('does not exist')
          ? '⚠ inventory_items 테이블이 없습니다. migration 007을 실행해 주세요.'
          : error.message)
      } else {
        setItems(data || [])
      }
      setLoading(false)
    })
  }, [])

  const filtered = items.filter(i => {
    if (q && !JSON.stringify(i).toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  const totalValue = filtered.reduce((s, i) => s + (i.current_qty * (i.unit_cost || 0)), 0)
  const lowStock = filtered.filter(i => i.reorder_point && i.current_qty <= i.reorder_point).length

  if (loading) return <Loading />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">재고 관리</h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            총 {items.length}종 · 재주문 필요 {lowStock}종 · 재고 가치 {formatCurrency(totalValue)}
          </p>
        </div>
        <Button size="sm"><Plus className="w-4 h-4 mr-1" /> 재고 등록</Button>
      </div>

      {error && (
        <div className="card p-4 mb-4 bg-amber-50 border-amber-200 text-sm text-amber-800">
          {error}
        </div>
      )}

      <div className="card p-3 mb-4">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
          <input type="text" placeholder="품목 / SKU / 카테고리 검색..." value={q} onChange={e => setQ(e.target.value)}
            className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-lg" />
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th><th>품명</th><th>카테고리</th>
              <th className="text-right">현재 재고</th><th className="text-right">재주문 기준</th>
              <th className="text-right">단가</th><th>보관위치</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-text-tertiary py-6">등록된 재고가 없습니다.</td></tr>
            ) : filtered.map(i => {
              const isLow = i.reorder_point && i.current_qty <= i.reorder_point
              return (
                <tr key={i.id} className={isLow ? 'bg-red-50/50' : ''}>
                  <td className="font-mono text-xs">{i.sku || '-'}</td>
                  <td className="font-medium">{i.name}</td>
                  <td>{i.category || '-'}</td>
                  <td className={`text-right ${isLow ? 'text-red-600 font-bold' : ''}`}>{i.current_qty}</td>
                  <td className="text-right text-text-tertiary">{i.reorder_point ?? '-'}</td>
                  <td className="text-right">{i.unit_cost ? formatCurrency(i.unit_cost) : '-'}</td>
                  <td>{i.location || '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
