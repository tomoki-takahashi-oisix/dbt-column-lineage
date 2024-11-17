import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { SourceModeType, useStore as useStoreZustand } from '@/store/zustand'
import { usePathname, useSearchParams } from 'next/navigation'
import { DashboardContentSelect } from '@/components/ui/DashboardContentSelect'
import { SchemaSourceColumnSelect } from '@/components/ui/SchemaSourceColumnSelect'
import { HeaderProps } from '@/components/organisms/Header'

export const SearchDialog: React.FC<HeaderProps> = ({handleFetchData}) => {
  const isLookerEnabled = Boolean(process.env.NEXT_PUBLIC_USE_LOOKER)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const headerSearchDisplayMessage = useStoreZustand((state) => state.headerSearchDisplayMessage)
  const sourceMode = useStoreZustand((state) => state.sourceMode)
  const setSourceMode = useStoreZustand((state) => state.setSourceMode)

  const searchParams = useSearchParams()
  const pathname = usePathname()

  const isCl = pathname === '/cl'

  const changeSourceMode = (mode: SourceModeType) => {
    window.history.replaceState({}, '', window.location.pathname)
    setSourceMode(mode)
  }

  useEffect(() => {
    if (searchParams.get('dashboardId')) setSourceMode('looker')
  }, [])

  useEffect(() => {
    if (!isCl) setSourceMode('dbt')
  }, [isCl])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (['svg', 'path'].includes((event.target as Element).tagName.toLowerCase())) return
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsDialogOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [wrapperRef])

  return (
    <div ref={wrapperRef} className="relative inline-block text-left mr-2 w-[60vw]">
      <button
        type="button"
        className="inline-flex justify-between rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 focus:ring-indigo-500 mr-2 w-full"
        onClick={() => setIsDialogOpen(!isDialogOpen)}
      >
        <span className="text-gray-700">
          {headerSearchDisplayMessage}
        </span>
        <ChevronDown className="ml-2 -mr-1 h-5 w-5" aria-hidden="true" />
      </button>

      <div
        className={`origin-top-left absolute left-0 mt-2 w-[900px] rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-50 ${
          isDialogOpen ? 'block' : 'hidden'
        }`}
      >
        {(isCl && isLookerEnabled) && (
          <div className="border-b border-gray-200">
            <nav className="px-2 pt-2">
              <ul className="flex space-x-1 text-xs">
                {[
                  { id: 'dbt', label: 'dbt' },
                  { id: 'looker', label: 'looker' },
                ].map((tab) => (
                  <li key={tab.id}>
                    <button
                      onClick={() => changeSourceMode(tab.id as SourceModeType)}
                      className={`px-3 py-1.5 rounded-t transition-colors duration-150 relative ${
                        sourceMode === tab.id
                          ? 'bg-blue-500 text-white shadow-sm font-medium'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        )}

        <div className="p-4">
          {sourceMode === 'dbt' ? (
            <SchemaSourceColumnSelect handleFetchData={handleFetchData} />
          ) : (
            <DashboardContentSelect handleFetchData={handleFetchData} />
          )}
        </div>
      </div>
    </div>
  )
}