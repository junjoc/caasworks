'use client'

import { Suspense } from 'react'
import QuotationForm from '@/components/quotations/QuotationForm'
import { PageLoading } from '@/components/ui/loading'

export default function NewQuotationPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <QuotationForm />
    </Suspense>
  )
}
