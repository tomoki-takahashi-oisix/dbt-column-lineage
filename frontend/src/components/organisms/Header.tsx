'use client'
import React, { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { SearchDialog } from '@/components/ui/SearchDialog'
import { useStore as useStoreZustand } from '@/store/zustand'
import { AlertTriangle, Check, Info, Loader, Search } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface HeaderProps {
  handleFetchData: Function
}

export interface DashboardOption {
  label: string
  value: string
  description: string
}

export const Header: React.FC<HeaderProps> = ({ handleFetchData }) => {
  const [lineageMode, setLineageMode] = useState('/cl')

  const pathname = usePathname()
  const router = useRouter()

  const triggerSubmitClicked = useStoreZustand((state) => state.triggerSubmitClicked)
  const loading = useStoreZustand((state) => state.loading)
  const message = useStoreZustand((state) => state.message)
  const messageType = useStoreZustand((state) => state.messageType)
  const isSubmitDisabled = useStoreZustand((state) => state.isSubmitDisabled)

  const getMessageIcon = (type: string | null) => {
    switch (type) {
      case 'success':
        return <Check className="inline-block mr-2" size={20} />
      case 'error':
        return <AlertTriangle className="inline-block mr-2" size={20} />
      default:
        return <Info className="inline-block mr-2" size={20} />
    }
  }

  useEffect(() => {
    if (pathname !== lineageMode) {
      setLineageMode(pathname)
    }
  }, [])

  return (
    <div>
      {message && (
        <div
          className={`absolute top-4 right-4 px-4 py-3 rounded shadow-md z-50 flex items-center ${
            messageType === 'success' ? 'bg-green-100 border-green-400 text-green-700' :
              messageType === 'error' ? 'bg-red-100 border-red-400 text-red-700' :
                'bg-blue-100 border-blue-400 text-blue-700'
          }`}
          role="alert"
        >
          {getMessageIcon(messageType)}
          <div className="sm:inline text-xs max-w-xl">
            <Markdown className="markdown" remarkPlugins={[remarkGfm]}>{message}</Markdown>
          </div>
        </div>
      )}
      <header className="bg-white border-b-[1px]">
        <nav className="container mr-auto flex flex-wrap flex-col md:flex-row items-center">
          <a className="flex title-font font-medium items-center text-gray-900 mb-4 md:mb-0">
            <span className="ml-3 text-xl">
              <select value={lineageMode} onChange={e => router.push(e.target.value)}>
                <option value="/cte">CTE Lineage</option>
                <option value="/cl">Column Level Lineage</option>
              </select>
            </span>
          </a>

          <nav className="md:mr-auto md:ml-4 md:py-2 md:pl-4 md:border-l md:border-gray-400 flex flex-wrap items-center text-base justify-center">
            <SearchDialog
              handleFetchData={handleFetchData}
            />
            <button
              type="button"
              className="rounded px-3 py-1.5 text-s font-medium border bg-blue-400 text-white border-blue-400 flex items-center hover:bg-blue-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={triggerSubmitClicked}
              disabled={isSubmitDisabled}
            >
              {loading ? (
                <Loader className="animate-spin mr-2" size={16} />
              ) : (
                <Search className="mr-2" size={16} />
              )}
              <span>{loading ? 'Loading...' : 'Search'}</span>
            </button>
          </nav>
        </nav>
      </header>
    </div>
  )
}