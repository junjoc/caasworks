'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Loading } from '@/components/ui/loading'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { Calculator, Camera, Shield, Video, Monitor, Plus, Trash2, FileText, RotateCcw, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'

interface Product {
  id: string
  name: string
  category_id: string
  category?: { name: string }
  purchase_price: number | null
  rental_price: number | null
  subscription_price: number | null
  cost_price: number | null
  unit: string
  default_supply_method: string | null
}

interface SimItem {
  product_id: string
  product_name: string
  category: string
  supply_method: string
  unit_price: number
  quantity: number
  period_months: number
  amount: number
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  'AI CCTV': <Camera className="w-5 h-5" />,
  '스마트 안전장비': <Shield className="w-5 h-5" />,
  '동영상 기록관리': <Video className="w-5 h-5" />,
  '통합 관제 대시보드': <Monitor className="w-5 h-5" />,
}

const SUPPLY_OPTIONS = [
  { value: '구매', label: '구매' },
  { value: '임대', label: '임대' },
  { value: '구독', label: '구독' },
]

const SITE_TYPE_OPTIONS = [
  { value: '건축', label: '건축' },
  { value: '토목', label: '토목' },
  { value: '플랜트', label: '플랜트' },
  { value: '리모델링', label: '리모델링' },
  { value: '기타', label: '기타' },
]

const DURATION_OPTIONS = [
  { value: '3', label: '3개월' },
  { value: '6', label: '6개월' },
  { value: '12', label: '12개월' },
  { value: '18', label: '18개월' },
  { value: '24', label: '24개월' },
  { value: '36', label: '36개월' },
]

export default function SimulatorPage() {
  const router = useRouter()
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  // Simulation params
  const [siteType, setSiteType] = useState('건축')
  const [duration, setDuration] = useState(12)
  const [cameraCount, setCameraCount] = useState(4)
  const [items, setItems] = useState<SimItem[]>([])

  useEffect(() => {
    fetchProducts()
  }, [])

  async function fetchProducts() {
    try {
      const [prodRes, catRes] = await Promise.all([
        supabase.from('products').select('*, category:product_categories(name)').eq('is_active', true).order('sort_order'),
        supabase.from('product_categories').select('*').order('sort_order'),
      ])
      setProducts(prodRes.data || [])
      setCategories(catRes.data || [])
    } catch (err) {
      console.error('fetchProducts error:', err)
    }
    setLoading(false)
  }

  // Group products by category
  const productsByCategory = useMemo(() => {
    const map: Record<string, Product[]> = {}
    products.forEach(p => {
      const catName = p.category?.name || '기타'
      if (!map[catName]) map[catName] = []
      map[catName].push(p)
    })
    return map
  }, [products])

  const getPrice = (product: Product, method: string) => {
    if (method === '구매') return Number(product.purchase_price || 0)
    if (method === '임대') return Number(product.rental_price || 0)
    if (method === '구독') return Number(product.subscription_price || 0)
    return Number(product.rental_price || product.subscription_price || product.purchase_price || 0)
  }

  const addProduct = (product: Product) => {
    const method = product.default_supply_method || '임대'
    const price = getPrice(product, method)
    setItems(prev => [...prev, {
      product_id: product.id,
      product_name: product.name,
      category: product.category?.name || '기타',
      supply_method: method,
      unit_price: price,
      quantity: 1,
      period_months: duration,
      amount: price,
    }])
  }

  const updateSimItem = (index: number, field: keyof SimItem, value: any) => {
    setItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      // Recalculate amount
      if (field === 'supply_method') {
        const prod = products.find(p => p.id === updated[index].product_id)
        if (prod) {
          updated[index].unit_price = getPrice(prod, value as string)
        }
      }
      updated[index].amount = Number(updated[index].unit_price) * Number(updated[index].quantity)
      return updated
    })
  }

  const removeSimItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  // Quick add preset for camera packages
  const addCameraPackage = () => {
    const cameraProducts = products.filter(p => p.category?.name === 'AI CCTV')
    if (cameraProducts.length === 0) {
      toast.error('AI CCTV 카테고리 제품이 없습니다.')
      return
    }
    const newItems: SimItem[] = cameraProducts.slice(0, 3).map(p => {
      const method = p.default_supply_method || '임대'
      const price = getPrice(p, method)
      const qty = p.name.toLowerCase().includes('카메라') || p.name.includes('CCTV') ? cameraCount : 1
      return {
        product_id: p.id,
        product_name: p.name,
        category: 'AI CCTV',
        supply_method: method,
        unit_price: price,
        quantity: qty,
        period_months: duration,
        amount: price * qty,
      }
    })
    setItems(prev => [...prev, ...newItems])
    toast.success(`AI CCTV 패키지 (카메라 ${cameraCount}대) 추가됨`)
  }

  // Calculations
  const subtotal = items.reduce((sum, it) => sum + it.amount, 0)
  const monthlyRecurring = items
    .filter(it => it.supply_method === '임대' || it.supply_method === '구독')
    .reduce((sum, it) => sum + it.amount, 0)
  const oneTimeCost = items
    .filter(it => it.supply_method === '구매')
    .reduce((sum, it) => sum + it.amount, 0)
  const totalForDuration = oneTimeCost + (monthlyRecurring * duration)
  const vat = Math.round(subtotal * 0.1)
  const monthlyWithVat = Math.round((monthlyRecurring + monthlyRecurring * 0.1))

  const reset = () => {
    setItems([])
    setCameraCount(4)
    setDuration(12)
    setSiteType('건축')
  }

  const convertToQuotation = () => {
    // Store simulation data in sessionStorage and navigate to new quotation
    const simData = {
      items: items.map((it, idx) => ({
        item_no: idx + 1,
        item_name: it.product_name,
        category: it.category,
        product_id: it.product_id,
        supply_method: it.supply_method,
        unit_price: it.unit_price,
        quantity: it.quantity,
        period_months: it.period_months,
        amount: it.amount,
        unit: '대',
      })),
      siteType,
      duration,
    }
    sessionStorage.setItem('simulation_data', JSON.stringify(simData))
    router.push('/quotations/new')
    toast.success('견적서 작성 화면으로 이동합니다.')
  }

  if (loading) return <Loading />

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">견적 모의계산</h1>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="w-4 h-4 mr-1" />초기화</Button>
          {items.length > 0 && (
            <Button size="sm" onClick={convertToQuotation}><FileText className="w-4 h-4 mr-1" />견적서로 변환</Button>
          )}
        </div>
      </div>

      {/* Quick Setup */}
      <div className="card p-4 mb-6">
        <h3 className="text-sm font-semibold text-text-secondary mb-3">기본 설정</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Select
            label="현장 유형"
            value={siteType}
            onChange={(e) => setSiteType(e.target.value)}
            options={SITE_TYPE_OPTIONS}
          />
          <Select
            label="프로젝트 기간"
            value={String(duration)}
            onChange={(e) => setDuration(Number(e.target.value))}
            options={DURATION_OPTIONS}
          />
          <Input
            label="카메라 대수"
            type="number"
            value={cameraCount}
            onChange={(e) => setCameraCount(Number(e.target.value))}
            min={1}
            max={100}
          />
          <div className="flex items-end">
            <Button variant="secondary" size="sm" onClick={addCameraPackage} className="w-full">
              <Camera className="w-4 h-4 mr-1" />AI CCTV 패키지 추가
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product Catalog */}
        <div className="lg:col-span-1">
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-text-secondary mb-3">제품/서비스 목록</h3>
            {Object.keys(productsByCategory).length === 0 ? (
              <p className="text-sm text-text-tertiary text-center py-8">등록된 제품이 없습니다.</p>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {Object.entries(productsByCategory).map(([catName, prods]) => (
                  <div key={catName}>
                    <div className="flex items-center gap-2 mb-2">
                      {SERVICE_ICONS[catName] || <Monitor className="w-4 h-4 text-text-tertiary" />}
                      <span className="text-xs font-semibold text-text-secondary uppercase">{catName}</span>
                    </div>
                    <div className="space-y-1">
                      {prods.map(p => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-tertiary cursor-pointer group transition-colors"
                          onClick={() => addProduct(p)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-800 truncate">{p.name}</div>
                            <div className="text-xs text-text-tertiary">
                              {p.rental_price ? `임대 ${formatCurrency(p.rental_price)}/월` : ''}
                              {p.purchase_price ? ` | 구매 ${formatCurrency(p.purchase_price)}` : ''}
                            </div>
                          </div>
                          <Plus className="w-4 h-4 text-gray-300 group-hover:text-primary-500 flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Simulation Items + Results */}
        <div className="lg:col-span-2 space-y-4">
          {/* Selected Items */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-text-secondary mb-3">선택된 항목</h3>
            {items.length === 0 ? (
              <div className="text-center py-8">
                <Calculator className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-text-tertiary">왼쪽 목록에서 제품을 클릭하여 추가하세요.</p>
                <p className="text-xs text-gray-300 mt-1">또는 &apos;AI CCTV 패키지 추가&apos; 버튼을 사용하세요.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left px-2 py-2 text-xs font-medium text-text-secondary">제품명</th>
                      <th className="text-left px-2 py-2 text-xs font-medium text-text-secondary w-20">공급방식</th>
                      <th className="text-right px-2 py-2 text-xs font-medium text-text-secondary w-24">단가</th>
                      <th className="text-right px-2 py-2 text-xs font-medium text-text-secondary w-16">수량</th>
                      <th className="text-right px-2 py-2 text-xs font-medium text-text-secondary w-24">금액</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-surface-tertiary">
                        <td className="px-2 py-2">
                          <div className="text-sm font-medium">{item.product_name}</div>
                          <div className="text-xs text-text-tertiary">{item.category}</div>
                        </td>
                        <td className="px-1 py-1">
                          <select
                            className="w-full px-1 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-primary-200"
                            value={item.supply_method}
                            onChange={(e) => updateSimItem(idx, 'supply_method', e.target.value)}
                          >
                            {SUPPLY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-2 text-right text-sm">{formatCurrency(item.unit_price)}</td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            className="w-full px-2 py-1 text-sm border rounded text-right focus:outline-none focus:ring-1 focus:ring-primary-200"
                            value={item.quantity}
                            onChange={(e) => updateSimItem(idx, 'quantity', Number(e.target.value))}
                            min={1}
                          />
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-sm">{formatCurrency(item.amount)}</td>
                        <td className="px-1 py-1">
                          <button onClick={() => removeSimItem(idx)} className="p-1 text-gray-300 hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Cost Summary */}
          {items.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-text-secondary mb-3">비용 요약</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="text-xs text-blue-600 mb-1">월 임대/구독료</div>
                  <div className="text-lg font-bold text-blue-700">{formatCurrency(monthlyRecurring)}</div>
                  <div className="text-xs text-blue-400">VAT 포함 {formatCurrency(monthlyWithVat)}</div>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <div className="text-xs text-green-600 mb-1">일시불 비용</div>
                  <div className="text-lg font-bold text-green-700">{formatCurrency(oneTimeCost)}</div>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg">
                  <div className="text-xs text-purple-600 mb-1">{duration}개월 총 비용</div>
                  <div className="text-lg font-bold text-purple-700">{formatCurrency(totalForDuration)}</div>
                  <div className="text-xs text-purple-400">VAT 별도</div>
                </div>
                <div className="p-3 bg-surface-tertiary rounded-lg">
                  <div className="text-xs text-text-secondary mb-1">VAT 포함 총액</div>
                  <div className="text-lg font-bold text-gray-800">{formatCurrency(Math.round(totalForDuration * 1.1))}</div>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button size="sm" onClick={convertToQuotation}>
                  견적서로 변환 <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
