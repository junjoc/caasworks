import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'CaasWorks CRM',
  description: 'CaasWorks CRM - 영업관리 플랫폼',
  icons: { icon: '/logo.png' },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
