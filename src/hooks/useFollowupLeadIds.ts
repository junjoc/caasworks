'use client'

import { useEffect, useState } from 'react'

// "추가 진행" 리드 id 목록 (도입완료 후 견적/제안/미팅/데모 활동이 있는 리드). 계산은 /api/pipeline/followups.
export function useFollowupLeadIds() {
  const [ids, setIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    fetch('/api/pipeline/followups')
      .then(r => (r.ok ? r.json() : { lead_ids: [] }))
      .then(d => setIds(new Set(d.lead_ids || [])))
      .catch(() => {})
  }, [])
  return ids
}
