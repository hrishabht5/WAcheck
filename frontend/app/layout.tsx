import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CheckWA — WhatsApp Validator',
  description: 'Premium WhatsApp number validation tool',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen grid-bg antialiased">{children}</body>
    </html>
  )
}
