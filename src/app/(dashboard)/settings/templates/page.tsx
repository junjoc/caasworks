'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/ui/loading'
import { Modal } from '@/components/ui/modal'
import { toast } from 'sonner'
import { Plus, Edit2, Trash2, Star, FileText } from 'lucide-react'
import type { QuotationTemplate } from '@/types/database'

const LAYOUT_LABELS: Record<string, string> = {
  A: '레이아웃 A',
  B: '레이아웃 B',
  custom: '커스텀',
}

export default function TemplatesPage() {
  const router = useRouter()
  const supabase = createClient()

  const [templates, setTemplates] = useState<QuotationTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<QuotationTemplate | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchTemplates()
  }, [])

  async function fetchTemplates() {
    setLoading(true)
    const { data, error } = await supabase
      .from('quotation_templates')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      toast.error('템플릿 목록을 불러오지 못했습니다.')
    } else {
      setTemplates(data || [])
    }
    setLoading(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase
      .from('quotation_templates')
      .delete()
      .eq('id', deleteTarget.id)

    if (error) {
      toast.error('삭제에 실패했습니다: ' + error.message)
    } else {
      toast.success('템플릿이 삭제되었습니다.')
      setDeleteTarget(null)
      fetchTemplates()
    }
    setDeleting(false)
  }

  async function handleSetDefault(template: QuotationTemplate) {
    // Unset all, then set this one
    const { error: unsetError } = await supabase
      .from('quotation_templates')
      .update({ is_default: false })
      .neq('id', template.id)

    if (unsetError) {
      toast.error('기본 템플릿 변경에 실패했습니다.')
      return
    }

    const { error } = await supabase
      .from('quotation_templates')
      .update({ is_default: true })
      .eq('id', template.id)

    if (error) {
      toast.error('기본 템플릿 변경에 실패했습니다.')
    } else {
      toast.success(`'${template.name}'이(가) 기본 템플릿으로 설정되었습니다.`)
      fetchTemplates()
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">견적서 템플릿</h1>
          <p className="page-subtitle">견적서 출력에 사용할 템플릿을 관리합니다.</p>
        </div>
        <Button size="sm" onClick={() => router.push('/settings/templates/new')}>
          <Plus className="w-4 h-4 mr-1" /> 새 템플릿
        </Button>
      </div>

      {loading ? (
        <Loading />
      ) : templates.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-text-secondary font-medium mb-1">등록된 템플릿이 없습니다.</p>
          <p className="text-text-tertiary text-sm mb-4">새 템플릿을 만들어 견적서 양식을 구성하세요.</p>
          <Button size="sm" onClick={() => router.push('/settings/templates/new')}>
            <Plus className="w-4 h-4 mr-1" /> 새 템플릿 만들기
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="card p-5 flex flex-col gap-3 cursor-pointer hover:shadow-card-hover transition-all"
              onClick={() => router.push(`/settings/templates/${tpl.id}`)}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-text-primary text-sm truncate">
                      {tpl.name}
                    </span>
                    {tpl.is_default && (
                      <Badge className="bg-amber-100 text-amber-700 flex items-center gap-1">
                        <Star className="w-3 h-3" />
                        기본
                      </Badge>
                    )}
                  </div>
                  {tpl.description && (
                    <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                      {tpl.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Info */}
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-blue-100 text-blue-700">
                  {LAYOUT_LABELS[tpl.layout_type] || tpl.layout_type}
                </Badge>
                {tpl.company_name && (
                  <Badge className="bg-gray-100 text-gray-600">
                    {tpl.company_name}
                  </Badge>
                )}
              </div>

              {/* Actions */}
              <div
                className="flex items-center gap-2 pt-1 border-t border-border-light"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => router.push(`/settings/templates/${tpl.id}`)}
                  className="flex items-center gap-1 text-xs text-text-secondary hover:text-primary-600 transition-colors px-2 py-1 rounded hover:bg-primary-50"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  수정
                </button>

                {!tpl.is_default && (
                  <button
                    onClick={() => handleSetDefault(tpl)}
                    className="flex items-center gap-1 text-xs text-text-secondary hover:text-amber-600 transition-colors px-2 py-1 rounded hover:bg-amber-50"
                  >
                    <Star className="w-3.5 h-3.5" />
                    기본으로 설정
                  </button>
                )}

                {!tpl.is_default && (
                  <button
                    onClick={() => setDeleteTarget(tpl)}
                    className="flex items-center gap-1 text-xs text-text-secondary hover:text-status-red transition-colors px-2 py-1 rounded hover:bg-red-50 ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    삭제
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="템플릿 삭제"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">'{deleteTarget?.name}'</span> 템플릿을
            삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              취소
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              삭제
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
