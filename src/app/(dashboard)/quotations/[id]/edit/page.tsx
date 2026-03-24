'use client'

import { useParams } from 'next/navigation'
import QuotationForm from '@/components/quotations/QuotationForm'

export default function EditQuotationPage() {
  const params = useParams()
  return <QuotationForm editId={params.id as string} />
}
