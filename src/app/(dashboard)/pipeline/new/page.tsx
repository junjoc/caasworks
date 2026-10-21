'use client'

// 새 리드 등록은 리스트 위 드로어로 옮김 (2026-10-21, 디자인 정의 › 새 리드 등록 v4). 예전 링크는 리스트 + 등록 드로어로.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewLeadRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/pipeline/list?new=1') }, [router])
  return null
}
