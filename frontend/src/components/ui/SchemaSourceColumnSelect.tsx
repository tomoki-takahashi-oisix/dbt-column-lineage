import React, { useState, useRef, useEffect } from 'react'
import { Select } from './Select'
import { ChevronDown, Columns3, Table } from 'lucide-react'
import { clsx } from 'clsx'

interface SchemaSourceColumnSelectProps {
  schemas: { label: string, value: string }[]
  sources: { label: string, options: { label: string, value: string }[] }[]
  selectedSources: string[]
  columns: { [source: string]: { label: string; description: string; value: string }[] }
  schema: string
  activeSource: string
  selectedColumns: string[]
  onSchemaChange: (schema: string) => void
  onSourcesChange: (sources: string[]) => void
  onActiveSourceChange: (source: string) => void
  onColumnsChange: (columns: string[]) => void
  isMulti: boolean
  className?: string
  searchShowColumn: boolean
  onSearchShowColumnChange: (searchShowColumn: boolean) => void
}

export const SchemaSourceColumnSelect: React.FC<SchemaSourceColumnSelectProps>
  = ({
       schemas,
       sources,
       selectedSources,
       columns,
       schema,
       activeSource,
       selectedColumns,
       onSchemaChange,
       onSourcesChange,
       onActiveSourceChange,
       onColumnsChange,
       isMulti,
       className,
       searchShowColumn,
       onSearchShowColumnChange,
     }) => {
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const buttons = [
    { id: 'table', icon: Table, label: 'Table' },
    { id: 'column', icon: Columns3, label: 'Column' },
  ]

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // clear buttonがクリックされた場合は除外
      if (['svg', 'path'].includes((event.target as Element).tagName.toLowerCase())) return
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [wrapperRef])

  const handleSourcesChange = (selected: any, actionTypes: any) => {
    console.log(selected, actionTypes)
    if (isMulti) {
      const newSources = selected.map((s: { value: string, label: string }) => s.value)
      onSourcesChange(newSources)
      if (actionTypes.action === 'select-option') {
        onActiveSourceChange(actionTypes.option.value)
      } else {
        onActiveSourceChange(newSources[0])
      }
    } else {
      onSourcesChange([selected.value])
      onActiveSourceChange(selected.value)
    }
  }

  const handleColumnsChange = (selected: any, actionTypes: any) => {
    if (actionTypes.action === 'clear') {
      onColumnsChange([])
      return
    }
    if (isMulti) {
      const newColumns = selected.map((c: { value: string, label: string }) => c.value)
      onColumnsChange(newColumns)
    } else {
      onColumnsChange([selected.value])
    }
  }

  return (
    <div ref={wrapperRef} className={clsx('relative inline-block text-left', className)}>
      <div>
        <button
          type="button"
          className={clsx(
            'inline-flex justify-between w-full rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 focus:ring-indigo-500',
            className,
          )}
          onClick={() => setIsOpen(!isOpen)}
        >
          <span>{schema} | {activeSource} | {selectedColumns.join(', ')}</span>
          <ChevronDown className="ml-2 -mr-1 h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {isOpen && (
        <div
          className="origin-top-left absolute left-0 mt-2 w-[900px] rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
          <div className="grid grid-cols-2 gap-4 p-4" role="menu" aria-orientation="horizontal"
               aria-labelledby="options-menu">
            <div>
              {isMulti && (
                <div>
                  <div className="font-medium text-gray-700 mb-2">Search View Mode</div>
                  <div className="inline-flex rounded-md shadow-sm mb-4" role="group">
                    {buttons.map((button) => (
                      <button
                        key={button.id}
                        type="button"
                        className={`px-4 py-2 text-sm font-medium border flex items-center whitespace-nowrap ${
                          (searchShowColumn ? 'column' : 'table') === button.id
                            ? 'bg-blue-500 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                        } ${
                          button.id === 'table'
                            ? 'rounded-l-lg'
                            : 'rounded-r-lg'
                        }`}
                        onClick={() => onSearchShowColumnChange(button.id === 'column')}
                      >
                        <button.icon className="mr-2" size={16} />
                        <span>{button.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="font-medium text-gray-700 mb-2">Schema</div>
              <Select
                options={schemas}
                value={{ label: schema, value: schema }}
                onChange={(selected: any) => onSchemaChange(selected.value)}
                className="mb-4"
              />
              <div className="font-medium text-gray-700 mb-2">Sources</div>
              <Select
                options={sources}
                value={selectedSources.map(s => ({ label: s, value: s }))}
                onChange={handleSourcesChange}
                className="mb-2"
                isMulti={isMulti}
                useFormatOptionLabel={true}
              />
            </div>
            {searchShowColumn && (
              <div>
                <div className="font-medium text-gray-700 mb-2">Active Source</div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedSources.map((source) => (
                    <button
                      key={source}
                      className={clsx(
                        'px-3 py-1 rounded-md text-sm font-medium',
                        source === activeSource
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300',
                      )}
                      onClick={() => onActiveSourceChange(source)}
                    >
                      {source}
                    </button>
                  ))}
                </div>
                <div className="font-medium text-gray-700 mb-2">Columns</div>
                {columns[activeSource] && (
                  <Select
                    options={columns[activeSource]}
                    value={selectedColumns.map(c => ({ label: c, value: c }))}
                    onChange={handleColumnsChange}
                    className="mb-2"
                    isMulti={isMulti}
                    isClearable={!isMulti}
                    useFormatOptionLabel={true}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}