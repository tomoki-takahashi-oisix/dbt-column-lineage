import React, { useState, useRef, useEffect } from 'react'
import { Select } from './Select'
import { ChevronDown, X } from 'lucide-react'
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
}

export const SchemaSourceColumnSelect: React.FC<SchemaSourceColumnSelectProps>
  = ({ schemas, sources, selectedSources, columns, schema, activeSource, selectedColumns, onSchemaChange, onSourcesChange, onActiveSourceChange, onColumnsChange,isMulti, className }) => {
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
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

  const handleColumnsChange = (selected: any) => {
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
            <div>
              <div className="font-medium text-gray-700 mb-2">Active Source</div>
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedSources.map((source) => (
                  <button
                    key={source}
                    className={clsx(
                      'px-3 py-1 rounded-md text-sm font-medium',
                      source === activeSource
                        ? 'bg-indigo-600 text-white'
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
                  useFormatOptionLabel={true}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}