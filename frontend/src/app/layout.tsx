import type {Metadata} from 'next'
import {Inter} from 'next/font/google'
import './global.css'

const inter = Inter({subsets: ['latin']})

export const metadata: Metadata = {
  title: 'dbt column linage',
  description: 'dbt column lineage visualization tool for data analysts and engineers'
}

export default function RootLayout({children,}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang='en'>
    <body className={inter.className}>{children}</body>
    </html>
  )
}