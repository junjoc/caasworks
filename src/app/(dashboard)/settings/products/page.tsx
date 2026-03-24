/*
=== Supabase SQL ===

-- 1. 제품 카테고리
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read product_categories" ON product_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert product_categories" ON product_categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update product_categories" ON product_categories FOR UPDATE TO authenticated USING (true);
CREATE POLICY "authenticated delete product_categories" ON product_categories FOR DELETE TO authenticated USING (true);

-- 기본 카테고리 데이터
INSERT INTO product_categories (name, sort_order) VALUES
  ('통합 관제 대시보드', 1),
  ('AI CCTV', 2),
  ('스마트 안전장비', 3),
  ('동영상 기록관리', 4),
  ('운임비', 5),
  ('설치비', 6),
  ('기타', 99);

-- 2. 협력사
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_person TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read suppliers" ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert suppliers" ON suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update suppliers" ON suppliers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "authenticated delete suppliers" ON suppliers FOR DELETE TO authenticated USING (true);

-- 3. 제품/서비스
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  supply_type TEXT NOT NULL DEFAULT 'self' CHECK (supply_type IN ('self', 'partner')),
  purchase_price NUMERIC,
  rental_price NUMERIC,
  subscription_price NUMERIC,
  cost_price NUMERIC,
  unit TEXT NOT NULL DEFAULT '대',
  default_supply_method TEXT,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read products" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert products" ON products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update products" ON products FOR UPDATE TO authenticated USING (true);
CREATE POLICY "authenticated delete products" ON products FOR DELETE TO authenticated USING (true);

-- updated_at 자동 업데이트
CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_products_updated_at();

-- 기본 제품 데이터 (카테고리 ID는 서브쿼리로)
INSERT INTO products (category_id, name, description, supply_type, purchase_price, rental_price, subscription_price, cost_price, unit, default_supply_method, sort_order) VALUES
  ((SELECT id FROM product_categories WHERE name = '통합 관제 대시보드'), '카스웍스 플랫폼', '통합 관제 대시보드 SaaS', 'self', NULL, NULL, 100000, NULL, '개소', '구독', 1),
  ((SELECT id FROM product_categories WHERE name = 'AI CCTV'), '이동식 CCTV (Bullet)', '이동식 불렛 카메라', 'self', 800000, 300000, NULL, NULL, '대', '구매', 2),
  ((SELECT id FROM product_categories WHERE name = 'AI CCTV'), '고정식 CCTV (PTZ)', 'PTZ 고정형 카메라', 'self', 840000, 200000, NULL, NULL, '대', '구매', 3),
  ((SELECT id FROM product_categories WHERE name = 'AI CCTV'), '무선 LTE 통신비', 'LTE 통신 월정액', 'partner', NULL, NULL, 65000, NULL, '회선', '구독', 4),
  ((SELECT id FROM product_categories WHERE name = '통합 관제 대시보드'), '플랫폼 연동 서비스', '카스웍스 플랫폼 연동', 'self', NULL, NULL, 100000, NULL, '식', '구독', 5),
  ((SELECT id FROM product_categories WHERE name = '스마트 안전장비'), '안전모 감지 솔루션', 'AI 안전모 미착용 감지', 'self', NULL, NULL, 90000, NULL, '식', '구독', 6),
  ((SELECT id FROM product_categories WHERE name = '스마트 안전장비'), '화재 감지 솔루션', 'AI 화재/연기 감지', 'self', NULL, NULL, 90000, NULL, '식', '구독', 7),
  ((SELECT id FROM product_categories WHERE name = 'AI CCTV'), 'NVR 녹화기', '네트워크 비디오 레코더', 'partner', 2880000, NULL, NULL, NULL, '대', '구매', 8),
  ((SELECT id FROM product_categories WHERE name = 'AI CCTV'), '관제용 모니터', '관제 센터 모니터', 'partner', 960000, NULL, NULL, NULL, '대', '구매', 9),
  ((SELECT id FROM product_categories WHERE name = '동영상 기록관리'), '웨어러블캠', '바디캠/헬멧캠', 'partner', 780000, NULL, NULL, NULL, '대', '구매', 10),
  ((SELECT id FROM product_categories WHERE name = '동영상 기록관리'), '영상 편집기', '영상 편집/관리 솔루션', 'self', NULL, NULL, 240000, NULL, '식', '구독', 11),
  ((SELECT id FROM product_categories WHERE name = '운임비'), '카메라 운임', '카메라 배송 운임', 'self', 14000, NULL, NULL, NULL, '회', NULL, 12),
  ((SELECT id FROM product_categories WHERE name = '설치비'), '시스템 구축/설치', '초기 시스템 구축 비용', 'self', 1800000, NULL, NULL, NULL, '회', '구매', 13),
  ((SELECT id FROM product_categories WHERE name = '설치비'), '카메라 설치/해체', '현장 카메라 설치 및 해체', 'self', 2520000, NULL, NULL, NULL, '회', '구매', 14);

=== End SQL ===
*/

'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Loading } from '@/components/ui/loading'
import type { Product, ProductCategory, Supplier, SupplyType } from '@/types/database'
import { toast } from 'sonner'
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  ChevronUp,
  ChevronDown,
  Package,
} from 'lucide-react'

// ============================================================
// Constants
// ============================================================

const UNIT_OPTIONS = [
  { value: '대', label: '대' },
  { value: '식', label: '식' },
  { value: '개소', label: '개소' },
  { value: '회선', label: '회선' },
  { value: '회', label: '회' },
  { value: '건', label: '건' },
]

const SUPPLY_METHOD_OPTIONS = [
  { value: '', label: '선택안함' },
  { value: '구매', label: '구매' },
  { value: '임대', label: '임대' },
  { value: '구독', label: '구독' },
  { value: '약정', label: '약정' },
]

type TabKey = 'products' | 'categories' | 'suppliers'

// ============================================================
// Helper: format number with commas
// ============================================================
function formatNum(n: number | null | undefined): string {
  if (n == null) return '-'
  return n.toLocaleString('ko-KR')
}

// ============================================================
// Helper: margin rate
// ============================================================
function marginRate(product: Product): string {
  const cost = product.cost_price
  if (!cost) return '-'
  const prices = [product.purchase_price, product.rental_price, product.subscription_price].filter(
    (p): p is number => p != null && p > 0
  )
  if (prices.length === 0) return '-'
  const maxPrice = Math.max(...prices)
  if (maxPrice === 0) return '-'
  const rate = ((maxPrice - cost) / maxPrice) * 100
  return `${rate.toFixed(1)}%`
}

// ============================================================
// Product Form State
// ============================================================
interface ProductForm {
  category_id: string
  name: string
  description: string
  supply_type: SupplyType
  supplier_id: string
  purchase_price: string
  rental_price: string
  subscription_price: string
  cost_price: string
  unit: string
  default_supply_method: string
  notes: string
  is_active: boolean
}

const emptyProductForm: ProductForm = {
  category_id: '',
  name: '',
  description: '',
  supply_type: 'self',
  supplier_id: '',
  purchase_price: '',
  rental_price: '',
  subscription_price: '',
  cost_price: '',
  unit: '대',
  default_supply_method: '',
  notes: '',
  is_active: true,
}

// ============================================================
// Page Component
// ============================================================
export default function ProductsSettingsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<TabKey>('products')

  // --- Shared data ---
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  // --- Product state ---
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm)
  const [productSaving, setProductSaving] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterSupplyType, setFilterSupplyType] = useState('')

  // --- Category state ---
  const [catModalOpen, setCatModalOpen] = useState(false)
  const [editCat, setEditCat] = useState<ProductCategory | null>(null)
  const [catForm, setCatForm] = useState({ name: '', sort_order: '0' })
  const [catSaving, setCatSaving] = useState(false)

  // --- Supplier state ---
  const [supModalOpen, setSupModalOpen] = useState(false)
  const [editSup, setEditSup] = useState<Supplier | null>(null)
  const [supForm, setSupForm] = useState({
    company_name: '',
    contact_person: '',
    contact_phone: '',
    contact_email: '',
    notes: '',
  })
  const [supSaving, setSupSaving] = useState(false)

  // ============================================================
  // Fetch all data
  // ============================================================
  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [catRes, supRes, prodRes] = await Promise.all([
      supabase.from('product_categories').select('*').order('sort_order'),
      supabase.from('suppliers').select('*').order('company_name'),
      supabase.from('products').select('*, category:product_categories(*), supplier:suppliers(*)').order('sort_order'),
    ])
    setCategories(catRes.data || [])
    setSuppliers(supRes.data || [])
    setProducts(prodRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // ============================================================
  // Product CRUD
  // ============================================================
  const openAddProduct = () => {
    setEditProduct(null)
    setProductForm(emptyProductForm)
    setProductModalOpen(true)
  }

  const openEditProduct = (p: Product) => {
    setEditProduct(p)
    setProductForm({
      category_id: p.category_id || '',
      name: p.name,
      description: p.description || '',
      supply_type: p.supply_type,
      supplier_id: p.supplier_id || '',
      purchase_price: p.purchase_price != null ? String(p.purchase_price) : '',
      rental_price: p.rental_price != null ? String(p.rental_price) : '',
      subscription_price: p.subscription_price != null ? String(p.subscription_price) : '',
      cost_price: p.cost_price != null ? String(p.cost_price) : '',
      unit: p.unit,
      default_supply_method: p.default_supply_method || '',
      notes: p.notes || '',
      is_active: p.is_active,
    })
    setProductModalOpen(true)
  }

  const handleSaveProduct = async () => {
    if (!productForm.name) {
      toast.error('품명은 필수입니다.')
      return
    }
    setProductSaving(true)

    const parseNum = (v: string) => (v ? Number(v) : null)
    const payload = {
      category_id: productForm.category_id || null,
      name: productForm.name,
      description: productForm.description || null,
      supply_type: productForm.supply_type,
      supplier_id: productForm.supply_type === 'partner' ? (productForm.supplier_id || null) : null,
      purchase_price: parseNum(productForm.purchase_price),
      rental_price: parseNum(productForm.rental_price),
      subscription_price: parseNum(productForm.subscription_price),
      cost_price: parseNum(productForm.cost_price),
      unit: productForm.unit,
      default_supply_method: productForm.default_supply_method || null,
      notes: productForm.notes || null,
      is_active: productForm.is_active,
    }

    if (editProduct) {
      const { error } = await supabase.from('products').update(payload).eq('id', editProduct.id)
      if (error) toast.error('수정 실패: ' + error.message)
      else toast.success('제품이 수정되었습니다.')
    } else {
      const maxSort = products.length > 0 ? Math.max(...products.map((p) => p.sort_order)) + 1 : 1
      const { error } = await supabase.from('products').insert({ ...payload, sort_order: maxSort })
      if (error) toast.error('등록 실패: ' + error.message)
      else toast.success('제품이 등록되었습니다.')
    }

    setProductSaving(false)
    setProductModalOpen(false)
    fetchAll()
  }

  const handleDeleteProduct = async (p: Product) => {
    if (!confirm(`"${p.name}" 제품을 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('products').delete().eq('id', p.id)
    if (error) toast.error('삭제 실패: ' + error.message)
    else {
      toast.success('제품이 삭제되었습니다.')
      fetchAll()
    }
  }

  // Filtered products
  const filteredProducts = products.filter((p) => {
    if (productSearch && !p.name.toLowerCase().includes(productSearch.toLowerCase()) && !(p.description || '').toLowerCase().includes(productSearch.toLowerCase())) return false
    if (filterCategory && p.category_id !== filterCategory) return false
    if (filterSupplyType && p.supply_type !== filterSupplyType) return false
    return true
  })

  // ============================================================
  // Category CRUD
  // ============================================================
  const openAddCat = () => {
    setEditCat(null)
    setCatForm({ name: '', sort_order: String(categories.length > 0 ? Math.max(...categories.map((c) => c.sort_order)) + 1 : 1) })
    setCatModalOpen(true)
  }

  const openEditCat = (c: ProductCategory) => {
    setEditCat(c)
    setCatForm({ name: c.name, sort_order: String(c.sort_order) })
    setCatModalOpen(true)
  }

  const handleSaveCat = async () => {
    if (!catForm.name) {
      toast.error('카테고리명은 필수입니다.')
      return
    }
    setCatSaving(true)
    const payload = { name: catForm.name, sort_order: Number(catForm.sort_order) || 0 }

    if (editCat) {
      const { error } = await supabase.from('product_categories').update(payload).eq('id', editCat.id)
      if (error) toast.error('수정 실패')
      else toast.success('카테고리가 수정되었습니다.')
    } else {
      const { error } = await supabase.from('product_categories').insert(payload)
      if (error) toast.error('등록 실패: ' + error.message)
      else toast.success('카테고리가 등록되었습니다.')
    }
    setCatSaving(false)
    setCatModalOpen(false)
    fetchAll()
  }

  const handleDeleteCat = async (c: ProductCategory) => {
    const usedCount = products.filter((p) => p.category_id === c.id).length
    if (usedCount > 0) {
      toast.error(`이 카테고리에 ${usedCount}개 제품이 있어 삭제할 수 없습니다.`)
      return
    }
    if (!confirm(`"${c.name}" 카테고리를 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('product_categories').delete().eq('id', c.id)
    if (error) toast.error('삭제 실패')
    else {
      toast.success('카테고리가 삭제되었습니다.')
      fetchAll()
    }
  }

  const handleMoveCat = async (c: ProductCategory, direction: 'up' | 'down') => {
    const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex((x) => x.id === c.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return

    const a = sorted[idx]
    const b = sorted[swapIdx]
    await Promise.all([
      supabase.from('product_categories').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('product_categories').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    fetchAll()
  }

  // ============================================================
  // Supplier CRUD
  // ============================================================
  const openAddSup = () => {
    setEditSup(null)
    setSupForm({ company_name: '', contact_person: '', contact_phone: '', contact_email: '', notes: '' })
    setSupModalOpen(true)
  }

  const openEditSup = (s: Supplier) => {
    setEditSup(s)
    setSupForm({
      company_name: s.company_name,
      contact_person: s.contact_person || '',
      contact_phone: s.contact_phone || '',
      contact_email: s.contact_email || '',
      notes: s.notes || '',
    })
    setSupModalOpen(true)
  }

  const handleSaveSup = async () => {
    if (!supForm.company_name) {
      toast.error('회사명은 필수입니다.')
      return
    }
    setSupSaving(true)
    const payload = {
      company_name: supForm.company_name,
      contact_person: supForm.contact_person || null,
      contact_phone: supForm.contact_phone || null,
      contact_email: supForm.contact_email || null,
      notes: supForm.notes || null,
    }

    if (editSup) {
      const { error } = await supabase.from('suppliers').update(payload).eq('id', editSup.id)
      if (error) toast.error('수정 실패')
      else toast.success('협력사가 수정되었습니다.')
    } else {
      const { error } = await supabase.from('suppliers').insert(payload)
      if (error) toast.error('등록 실패: ' + error.message)
      else toast.success('협력사가 등록되었습니다.')
    }
    setSupSaving(false)
    setSupModalOpen(false)
    fetchAll()
  }

  const handleDeleteSup = async (s: Supplier) => {
    const usedCount = products.filter((p) => p.supplier_id === s.id).length
    if (usedCount > 0) {
      toast.error(`이 협력사에 ${usedCount}개 제품이 연결되어 삭제할 수 없습니다.`)
      return
    }
    if (!confirm(`"${s.company_name}" 협력사를 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('suppliers').delete().eq('id', s.id)
    if (error) toast.error('삭제 실패')
    else {
      toast.success('협력사가 삭제되었습니다.')
      fetchAll()
    }
  }

  // ============================================================
  // Render
  // ============================================================
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'products', label: '제품 목록' },
    { key: 'categories', label: '카테고리 관리' },
    { key: 'suppliers', label: '협력사 관리' },
  ]

  if (loading) return <Loading />

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-2">
          <Package className="w-6 h-6 text-primary-600" />
          <h1 className="page-title">제품/서비스 관리</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ============== PRODUCTS TAB ============== */}
      {tab === 'products' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="품명 검색..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <Select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="전체 카테고리"
              className="w-44"
            />
            <Select
              value={filterSupplyType}
              onChange={(e) => setFilterSupplyType(e.target.value)}
              options={[
                { value: 'self', label: '자사' },
                { value: 'partner', label: '협력사' },
              ]}
              placeholder="전체 공급구분"
              className="w-36"
            />
            <div className="ml-auto">
              <Button size="sm" onClick={openAddProduct}>
                <Plus className="w-4 h-4 mr-1" /> 제품 등록
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>카테고리</th>
                  <th>품명</th>
                  <th className="hidden md:table-cell">상세</th>
                  <th className="text-right">구매가</th>
                  <th className="text-right">임대가</th>
                  <th className="text-right">구독가</th>
                  <th className="text-right hidden lg:table-cell">원가</th>
                  <th className="text-right hidden lg:table-cell">마진율</th>
                  <th>단위</th>
                  <th className="hidden md:table-cell">공급</th>
                  <th className="hidden lg:table-cell">공급사</th>
                  <th>상태</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="text-center text-gray-400 py-8">
                      등록된 제품이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => (
                    <tr key={p.id} className={!p.is_active ? 'bg-gray-50 opacity-60' : ''}>
                      <td>
                        <Badge className="bg-gray-100 text-gray-600">
                          {p.category?.name || '-'}
                        </Badge>
                      </td>
                      <td className="font-medium">{p.name}</td>
                      <td className="text-gray-500 hidden md:table-cell max-w-[160px] truncate">
                        {p.description || '-'}
                      </td>
                      <td className="text-right tabular-nums">{formatNum(p.purchase_price)}</td>
                      <td className="text-right tabular-nums">{formatNum(p.rental_price)}</td>
                      <td className="text-right tabular-nums">{formatNum(p.subscription_price)}</td>
                      <td className="text-right tabular-nums hidden lg:table-cell">{formatNum(p.cost_price)}</td>
                      <td className="text-right hidden lg:table-cell">{marginRate(p)}</td>
                      <td>{p.unit}</td>
                      <td className="hidden md:table-cell">
                        <Badge
                          className={
                            p.supply_type === 'self'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-orange-100 text-orange-700'
                          }
                        >
                          {p.supply_type === 'self' ? '자사' : '협력사'}
                        </Badge>
                      </td>
                      <td className="text-gray-500 hidden lg:table-cell">
                        {p.supplier?.company_name || '-'}
                      </td>
                      <td>
                        <Badge
                          className={
                            p.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }
                        >
                          {p.is_active ? '활성' : '비활성'}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            onClick={() => openEditProduct(p)}
                            className="text-gray-400 hover:text-primary-600"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(p)}
                            className="text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            총 {filteredProducts.length}개 제품
          </p>
        </>
      )}

      {/* ============== CATEGORIES TAB ============== */}
      {tab === 'categories' && (
        <>
          <div className="flex justify-end mb-4">
            <Button size="sm" onClick={openAddCat}>
              <Plus className="w-4 h-4 mr-1" /> 카테고리 추가
            </Button>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>순서</th>
                  <th>카테고리명</th>
                  <th>제품 수</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c, i) => (
                  <tr key={c.id}>
                    <td className="w-24">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500 tabular-nums w-6">{c.sort_order}</span>
                        <button
                          onClick={() => handleMoveCat(c, 'up')}
                          disabled={i === 0}
                          className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleMoveCat(c, 'down')}
                          disabled={i === categories.length - 1}
                          className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                    <td className="font-medium">{c.name}</td>
                    <td className="text-gray-500">
                      {products.filter((p) => p.category_id === c.id).length}개
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEditCat(c)}
                          className="text-gray-400 hover:text-primary-600"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCat(c)}
                          className="text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ============== SUPPLIERS TAB ============== */}
      {tab === 'suppliers' && (
        <>
          <div className="flex justify-end mb-4">
            <Button size="sm" onClick={openAddSup}>
              <Plus className="w-4 h-4 mr-1" /> 협력사 추가
            </Button>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>회사명</th>
                  <th>담당자</th>
                  <th>연락처</th>
                  <th className="hidden md:table-cell">이메일</th>
                  <th>제품 수</th>
                  <th>상태</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {suppliers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-gray-400 py-8">
                      등록된 협력사가 없습니다.
                    </td>
                  </tr>
                ) : (
                  suppliers.map((s) => (
                    <tr key={s.id}>
                      <td className="font-medium">{s.company_name}</td>
                      <td className="text-gray-500">{s.contact_person || '-'}</td>
                      <td className="text-gray-500">{s.contact_phone || '-'}</td>
                      <td className="text-gray-500 hidden md:table-cell">{s.contact_email || '-'}</td>
                      <td className="text-gray-500">
                        {products.filter((p) => p.supplier_id === s.id).length}개
                      </td>
                      <td>
                        <Badge
                          className={
                            s.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }
                        >
                          {s.is_active ? '활성' : '비활성'}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            onClick={() => openEditSup(s)}
                            className="text-gray-400 hover:text-primary-600"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteSup(s)}
                            className="text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ============== PRODUCT MODAL ============== */}
      <Modal
        open={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        title={editProduct ? '제품 수정' : '새 제품 등록'}
        className="max-w-xl"
      >
        <div className="space-y-4">
          <Select
            label="카테고리"
            value={productForm.category_id}
            onChange={(e) => setProductForm({ ...productForm, category_id: e.target.value })}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="선택"
          />
          <Input
            label="품명 *"
            value={productForm.name}
            onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
          />
          <Textarea
            label="상세 설명"
            value={productForm.description}
            onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
          />

          {/* 공급 구분 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">공급 구분</label>
            <div className="flex gap-4">
              {(['self', 'partner'] as const).map((v) => (
                <label key={v} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="supply_type"
                    checked={productForm.supply_type === v}
                    onChange={() => setProductForm({ ...productForm, supply_type: v })}
                    className="accent-primary-600"
                  />
                  <span className="text-sm">{v === 'self' ? '자사' : '협력사'}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 협력사 선택 */}
          {productForm.supply_type === 'partner' && (
            <Select
              label="협력사"
              value={productForm.supplier_id}
              onChange={(e) => setProductForm({ ...productForm, supplier_id: e.target.value })}
              options={suppliers.filter((s) => s.is_active).map((s) => ({ value: s.id, label: s.company_name }))}
              placeholder="선택"
            />
          )}

          {/* 가격 섹션 */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">가격 정보</p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="구매 단가"
                type="number"
                value={productForm.purchase_price}
                onChange={(e) => setProductForm({ ...productForm, purchase_price: e.target.value })}
                placeholder="0"
              />
              <Input
                label="임대 단가 (/월)"
                type="number"
                value={productForm.rental_price}
                onChange={(e) => setProductForm({ ...productForm, rental_price: e.target.value })}
                placeholder="0"
              />
              <Input
                label="구독 단가 (/월)"
                type="number"
                value={productForm.subscription_price}
                onChange={(e) => setProductForm({ ...productForm, subscription_price: e.target.value })}
                placeholder="0"
              />
              <Input
                label="원가 (매입가)"
                type="number"
                value={productForm.cost_price}
                onChange={(e) => setProductForm({ ...productForm, cost_price: e.target.value })}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="단위"
              value={productForm.unit}
              onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
              options={UNIT_OPTIONS}
            />
            <Select
              label="기본 공급방식"
              value={productForm.default_supply_method}
              onChange={(e) => setProductForm({ ...productForm, default_supply_method: e.target.value })}
              options={SUPPLY_METHOD_OPTIONS}
            />
          </div>

          <Textarea
            label="기본 비고"
            value={productForm.notes}
            onChange={(e) => setProductForm({ ...productForm, notes: e.target.value })}
          />

          {/* 활성 토글 */}
          <div className="flex items-center gap-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={productForm.is_active}
                onChange={(e) => setProductForm({ ...productForm, is_active: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600" />
            </label>
            <span className="text-sm text-gray-700">{productForm.is_active ? '활성' : '비활성'}</span>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setProductModalOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveProduct} loading={productSaving}>
              {editProduct ? '수정' : '등록'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ============== CATEGORY MODAL ============== */}
      <Modal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title={editCat ? '카테고리 수정' : '새 카테고리'}
      >
        <div className="space-y-4">
          <Input
            label="카테고리명 *"
            value={catForm.name}
            onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
          />
          <Input
            label="정렬 순서"
            type="number"
            value={catForm.sort_order}
            onChange={(e) => setCatForm({ ...catForm, sort_order: e.target.value })}
          />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setCatModalOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveCat} loading={catSaving}>
              {editCat ? '수정' : '등록'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ============== SUPPLIER MODAL ============== */}
      <Modal
        open={supModalOpen}
        onClose={() => setSupModalOpen(false)}
        title={editSup ? '협력사 수정' : '새 협력사'}
      >
        <div className="space-y-4">
          <Input
            label="회사명 *"
            value={supForm.company_name}
            onChange={(e) => setSupForm({ ...supForm, company_name: e.target.value })}
          />
          <Input
            label="담당자"
            value={supForm.contact_person}
            onChange={(e) => setSupForm({ ...supForm, contact_person: e.target.value })}
          />
          <Input
            label="연락처"
            value={supForm.contact_phone}
            onChange={(e) => setSupForm({ ...supForm, contact_phone: e.target.value })}
          />
          <Input
            label="이메일"
            type="email"
            value={supForm.contact_email}
            onChange={(e) => setSupForm({ ...supForm, contact_email: e.target.value })}
          />
          <Textarea
            label="비고"
            value={supForm.notes}
            onChange={(e) => setSupForm({ ...supForm, notes: e.target.value })}
          />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setSupModalOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveSup} loading={supSaving}>
              {editSup ? '수정' : '등록'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
