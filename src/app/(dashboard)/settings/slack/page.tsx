'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { formatDate } from '@/lib/utils'
import type { Customer, Project } from '@/types/database'
import { Copy, Check, Link2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

export default function SlackSettingsPage() {
  const supabase = createClient()
  const [pendingProjects, setPendingProjects] = useState<Project[]>([])
  const [customers, setCustomers] = useState<{id: string; company_name: string}[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  // Match modal
  const [matchModal, setMatchModal] = useState<Project | null>(null)
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [matching, setMatching] = useState(false)

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/slack/webhook`
    : '/api/slack/webhook'

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const [projRes, custRes] = await Promise.all([
      supabase
        .from('projects')
        .select('*')
        .eq('source', 'slack_pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('customers')
        .select('id, company_name')
        .eq('status', 'active')
        .order('company_name'),
    ])
    setPendingProjects(projRes.data || [])
    setCustomers(custRes.data || [])
    setLoading(false)
  }

  async function handleCopyWebhook() {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      toast.success('Webhook URL이 복사되었습니다.')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('복사에 실패했습니다.')
    }
  }

  function openMatchModal(project: Project) {
    setMatchModal(project)
    setSelectedCustomerId('')
  }

  async function handleMatch() {
    if (!matchModal || !selectedCustomerId) {
      toast.error('고객사를 선택해주세요.')
      return
    }

    setMatching(true)
    const { error } = await supabase
      .from('projects')
      .update({
        customer_id: selectedCustomerId,
        source: 'slack',
        notes: null, // Clear the pending note
      })
      .eq('id', matchModal.id)

    if (error) {
      toast.error('매칭에 실패했습니다.')
    } else {
      toast.success('고객사가 매칭되었습니다.')
      setMatchModal(null)
      fetchData()
    }
    setMatching(false)
  }

  async function handleDeletePending(project: Project) {
    const { error } = await supabase.from('projects').delete().eq('id', project.id)
    if (error) {
      toast.error('삭제에 실패했습니다.')
    } else {
      toast.success('미매칭 프로젝트가 삭제되었습니다.')
      fetchData()
    }
  }

  const hasSigningSecret = true // We don't expose this, just show status

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Slack 연동</h1>
        <p className="text-sm text-gray-500 mt-1">
          Slack에서 프로젝트 생성 알림을 받아 자동으로 프로젝트를 등록합니다.
        </p>
      </div>

      {/* 연동 상태 카드 */}
      <div className="card p-6 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">연동 설정</h3>

        <div className="space-y-4">
          {/* Webhook URL */}
          <div>
            <label className="block text-sm text-gray-500 mb-1">Webhook URL</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 truncate">
                {webhookUrl}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopyWebhook}
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              이 URL을 Slack App의 Event Subscriptions에 등록하세요.
            </p>
          </div>

          {/* 연동 상태 표시 */}
          <div className="flex items-center gap-4 pt-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-gray-600">Webhook 엔드포인트 활성</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Link2 className="w-4 h-4 text-blue-500" />
              <span className="text-gray-600">이벤트: message (메시지 수신)</span>
            </div>
          </div>

          {/* 설정 안내 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
            <h4 className="text-sm font-medium text-blue-800 mb-2">Slack App 설정 방법</h4>
            <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
              <li>api.slack.com에서 앱 생성 또는 기존 앱 선택</li>
              <li>Event Subscriptions에서 위 Webhook URL 등록</li>
              <li>Subscribe to bot events에서 &quot;message.channels&quot; 추가</li>
              <li>환경변수에 SLACK_SIGNING_SECRET 설정 (보안 검증용)</li>
              <li>프로젝트 생성 채널에 봇 초대</li>
            </ol>
          </div>
        </div>
      </div>

      {/* 미매칭 프로젝트 목록 */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-700">미매칭 프로젝트</h3>
            {pendingProjects.length > 0 && (
              <Badge className="bg-yellow-100 text-yellow-700">{pendingProjects.length}건</Badge>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={fetchData} disabled={loading}>
            새로고침
          </Button>
        </div>

        <p className="text-xs text-gray-400 mb-4">
          Slack에서 수신했으나 고객사 자동 매칭에 실패한 프로젝트입니다. 수동으로 고객사를 선택해 매칭하세요.
        </p>

        {loading ? (
          <div className="text-center text-gray-400 py-8 text-sm">불러오는 중...</div>
        ) : pendingProjects.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 className="w-8 h-8 text-green-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">미매칭 프로젝트가 없습니다.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>프로젝트명</th>
                  <th>주소</th>
                  <th>생성자</th>
                  <th>원본 회사명</th>
                  <th>등록일</th>
                  <th className="w-32">관리</th>
                </tr>
              </thead>
              <tbody>
                {pendingProjects.map((p) => {
                  // Extract original company name from notes
                  const companyMatch = p.notes?.match(/원본 회사명: (.+)/)
                  const originalCompany = companyMatch ? companyMatch[1] : '-'

                  return (
                    <tr key={p.id}>
                      <td className="font-medium">{p.project_name}</td>
                      <td className="text-gray-500 text-xs max-w-[160px] truncate" title={p.address || ''}>
                        {p.address || '-'}
                      </td>
                      <td>{p.created_by || '-'}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                          <span className="text-yellow-700 text-sm">{originalCompany}</span>
                        </div>
                      </td>
                      <td className="text-gray-500">{formatDate(p.created_at)}</td>
                      <td>
                        <div className="flex gap-1">
                          <Button size="sm" onClick={() => openMatchModal(p)}>
                            매칭
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDeletePending(p)}
                          >
                            삭제
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 매칭 모달 */}
      <Modal
        open={!!matchModal}
        onClose={() => setMatchModal(null)}
        title="고객사 매칭"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">프로젝트명</label>
            <p className="text-sm font-medium text-gray-900">{matchModal?.project_name}</p>
          </div>
          {matchModal?.address && (
            <div>
              <label className="block text-sm text-gray-500 mb-1">주소</label>
              <p className="text-sm text-gray-700">{matchModal.address}</p>
            </div>
          )}
          <Select
            label="고객사 선택 *"
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            options={customers.map((c) => ({ value: c.id, label: c.company_name }))}
            placeholder="고객사를 선택하세요"
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={() => setMatchModal(null)}>
              취소
            </Button>
            <Button size="sm" loading={matching} onClick={handleMatch}>
              매칭 완료
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
