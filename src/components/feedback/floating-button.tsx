'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MessageSquarePlus } from 'lucide-react'
import { toast } from 'sonner'

// Global floating button — opens a quick feedback submission modal.
export function FeedbackFloatingButton() {
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '', description: '', category: 'feature', priority: 'normal',
  })

  // Don't show on login page
  if (pathname === '/login' || !user) return null

  const handleSubmit = async () => {
    if (!form.title.trim()) { toast.error('제목을 입력해주세요.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, created_by: user.id, target_page: pathname }),
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      toast.success('피드백이 등록되었습니다.')
      setOpen(false)
      setForm({ title: '', description: '', category: 'feature', priority: 'normal' })
      if (result.data?.id) router.push(`/feedback/${result.data.id}`)
    } catch (e: any) {
      toast.error('등록 실패: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary-500 hover:bg-primary-600 text-white shadow-lg flex items-center justify-center transition-all hover:scale-105"
        title="피드백 / 요청 등록"
      >
        <MessageSquarePlus className="w-6 h-6" />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="피드백 / 요청 등록" className="max-w-lg">
        <div className="space-y-3">
          <p className="text-xs text-text-tertiary">
            현재 페이지: <code className="text-[11px] bg-gray-100 px-1 rounded">{pathname}</code>
          </p>
          <Input
            label="제목 *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="예: 매출현황 수정 시 먹통 문제"
          />
          <Textarea
            label="상세 설명"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="재현 방법, 기대 동작, 현재 동작 등"
            rows={5}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="카테고리"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              options={[
                { value: 'bug', label: '🐛 버그' },
                { value: 'feature', label: '✨ 신규 기능' },
                { value: 'improvement', label: '🔧 개선' },
                { value: 'question', label: '❓ 질문' },
              ]}
            />
            <Select
              label="우선순위"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              options={[
                { value: 'high', label: '🔴 높음' },
                { value: 'normal', label: '🟡 보통' },
                { value: 'low', label: '🟢 낮음' },
              ]}
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} loading={saving}>등록</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
