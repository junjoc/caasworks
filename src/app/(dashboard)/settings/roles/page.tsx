'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Loading } from '@/components/ui/loading'
import { NAV_MENU, allMenuPaths } from '@/lib/nav-menu'
import type { Role } from '@/types/database'
import { toast } from 'sonner'
import { Plus, Edit2, Trash2, Check } from 'lucide-react'

export default function RolesSettingsPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editRole, setEditRole] = useState<Role | null>(null)
  const [form, setForm] = useState({
    name: '',
    label: '',
    allowed_paths: [] as string[],
  })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchRoles()
  }, [])

  async function fetchRoles() {
    const { data } = await supabase
      .from('roles')
      .select('*')
      .order('is_system', { ascending: false })
      .order('name')
    setRoles(data || [])
    setLoading(false)
  }

  const openAdd = () => {
    setEditRole(null)
    setForm({ name: '', label: '', allowed_paths: [] })
    setModalOpen(true)
  }

  const openEdit = (r: Role) => {
    setEditRole(r)
    setForm({
      name: r.name,
      label: r.label,
      allowed_paths: Array.isArray(r.allowed_paths) ? r.allowed_paths : [],
    })
    setModalOpen(true)
  }

  const togglePath = (href: string) => {
    setForm(prev => ({
      ...prev,
      allowed_paths: prev.allowed_paths.includes(href)
        ? prev.allowed_paths.filter(p => p !== href)
        : [...prev.allowed_paths, href],
    }))
  }

  const toggleSection = (children: { href: string }[]) => {
    const hrefs = children.map(c => c.href)
    const allSelected = hrefs.every(h => form.allowed_paths.includes(h))
    setForm(prev => ({
      ...prev,
      allowed_paths: allSelected
        ? prev.allowed_paths.filter(p => !hrefs.includes(p))
        : Array.from(new Set([...prev.allowed_paths, ...hrefs])),
    }))
  }

  const toggleAll = () => {
    const isAll = form.allowed_paths.includes('*')
    setForm(prev => ({
      ...prev,
      allowed_paths: isAll ? [] : ['*'],
    }))
  }

  const handleSave = async () => {
    if (!form.name || !form.label) {
      toast.error('역할 key와 표시명은 필수입니다.')
      return
    }
    if (!/^[a-z0-9_]+$/.test(form.name)) {
      toast.error('역할 key는 영문 소문자, 숫자, _ 만 사용 가능합니다.')
      return
    }
    setSaving(true)
    if (editRole) {
      // Cannot rename system roles
      const updateData: any = {
        label: form.label,
        allowed_paths: form.allowed_paths,
      }
      const { error } = await supabase
        .from('roles')
        .update(updateData)
        .eq('name', editRole.name)
      if (error) toast.error('수정 실패: ' + error.message)
      else toast.success('역할이 수정되었습니다.')
    } else {
      const { error } = await supabase.from('roles').insert({
        name: form.name,
        label: form.label,
        allowed_paths: form.allowed_paths,
        is_system: false,
      })
      if (error) toast.error('등록 실패: ' + error.message)
      else toast.success('역할이 추가되었습니다.')
    }
    setSaving(false)
    setModalOpen(false)
    fetchRoles()
  }

  const handleDelete = async (r: Role) => {
    if (r.is_system) {
      toast.error('시스템 기본 역할은 삭제할 수 없습니다.')
      return
    }
    if (!confirm(`"${r.label}" 역할을 삭제하시겠습니까?\n이 역할을 사용하는 사용자가 있으면 삭제할 수 없습니다.`)) return
    // Check if any user uses this role
    const { count } = await supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', r.name)
    if (count && count > 0) {
      toast.error(`이 역할을 사용 중인 사용자가 ${count}명 있습니다. 먼저 다른 역할로 변경해 주세요.`)
      return
    }
    const { error } = await supabase.from('roles').delete().eq('name', r.name)
    if (error) toast.error('삭제 실패')
    else {
      toast.success('삭제되었습니다.')
      fetchRoles()
    }
  }

  const pathsCount = (r: Role) => {
    if (!Array.isArray(r.allowed_paths)) return 0
    if (r.allowed_paths.includes('*')) return allMenuPaths().length
    return r.allowed_paths.length
  }

  const isAllSelected = form.allowed_paths.includes('*')

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">역할 관리</h1>
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-4 h-4 mr-1" /> 역할 추가
        </Button>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        역할별로 접근 가능한 메뉴를 지정합니다. 관리자(admin)는 모든 메뉴에 접근할 수 있습니다.
      </p>

      {loading ? (
        <Loading />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>역할 키</th>
                <th>표시명</th>
                <th>접근 가능 메뉴 수</th>
                <th>유형</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.name}>
                  <td className="font-mono text-xs text-gray-500">{r.name}</td>
                  <td className="font-medium">{r.label}</td>
                  <td className="text-gray-500">
                    {Array.isArray(r.allowed_paths) && r.allowed_paths.includes('*')
                      ? '전체'
                      : `${pathsCount(r)}개`}
                  </td>
                  <td>
                    {r.is_system ? (
                      <Badge className="bg-gray-100 text-gray-600">기본</Badge>
                    ) : (
                      <Badge className="bg-blue-100 text-blue-700">사용자정의</Badge>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-primary-600" title="편집">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {!r.is_system && (
                        <button onClick={() => handleDelete(r)} className="text-gray-400 hover:text-red-600" title="삭제">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editRole ? '역할 수정' : '새 역할'} className="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="역할 Key *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={!!editRole}
              placeholder="예: sales_manager"
            />
            <Input
              label="표시명 *"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="예: 영업 매니저"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">접근 가능 메뉴</label>
              <button
                type="button"
                onClick={toggleAll}
                className={`text-xs px-2 py-1 rounded ${
                  isAllSelected
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {isAllSelected ? '✓ 전체 허용 (*)' : '전체 허용 (*)'}
              </button>
            </div>

            <div className={`border border-gray-200 rounded-lg max-h-[400px] overflow-y-auto ${isAllSelected ? 'opacity-40 pointer-events-none' : ''}`}>
              {NAV_MENU.map((section) => {
                // Top-level leaf
                if (section.href) {
                  const checked = form.allowed_paths.includes(section.href)
                  return (
                    <label
                      key={section.href}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePath(section.href!)}
                        className="rounded border-gray-300"
                      />
                      <span className="font-medium text-sm">{section.label}</span>
                      <span className="text-xs text-gray-400 font-mono ml-auto">{section.href}</span>
                    </label>
                  )
                }
                // Section with children
                const children = section.children || []
                const hrefs = children.map(c => c.href)
                const allChildrenSelected = hrefs.length > 0 && hrefs.every(h => form.allowed_paths.includes(h))
                const someChildrenSelected = hrefs.some(h => form.allowed_paths.includes(h))
                return (
                  <div key={section.label} className="border-b border-gray-100 last:border-b-0">
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
                      <input
                        type="checkbox"
                        checked={allChildrenSelected}
                        ref={el => {
                          if (el) el.indeterminate = !allChildrenSelected && someChildrenSelected
                        }}
                        onChange={() => toggleSection(children)}
                        className="rounded border-gray-300"
                      />
                      <span className="font-semibold text-sm text-gray-700">{section.label}</span>
                      <span className="text-xs text-gray-400 ml-auto">
                        {hrefs.filter(h => form.allowed_paths.includes(h)).length} / {hrefs.length}
                      </span>
                    </div>
                    <div>
                      {children.map((c) => {
                        const checked = form.allowed_paths.includes(c.href)
                        return (
                          <label
                            key={c.href}
                            className="flex items-center gap-2 px-3 pl-10 py-1.5 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePath(c.href)}
                              className="rounded border-gray-300"
                            />
                            <span className="text-sm">{c.label}</span>
                            <span className="text-xs text-gray-400 font-mono ml-auto">{c.href}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-gray-500">
              <Check className="w-3 h-3 inline mr-0.5" />
              선택된 메뉴: {isAllSelected ? '전체' : `${form.allowed_paths.length}개`}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>취소</Button>
              <Button onClick={handleSave} loading={saving}>{editRole ? '수정' : '등록'}</Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
