import React, { useCallback, useEffect } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'

export interface CteNodeProps extends NodeProps {
  data: CteData
}

interface CteData {
  label: string
  nodeType: string
  meta: Meta[]
  groups?: string[]
  havings?: string[]
  wheres?: string[]
  unions?: string[]
  joins?: string[]
}

export interface Meta {
  column: string
  nextColumns: string[]
  nextSources: Source[]
  reference: string
}

interface Source {
  schema: string
  table: string
}

type DataKey = keyof Omit<CteData, 'label' | 'nodeType' | 'columns'>

const CteNode: React.FC<CteNodeProps> = ({ data }) => {
  const seriesItems: Array<{ key: DataKey; color: string; label: string }> = [
    { key: 'groups', color: 'bg-pink-500', label: 'group by' },
    { key: 'havings', color: 'bg-orange-500', label: 'having' },
    { key: 'wheres', color: 'bg-red-500', label: 'where' },
    { key: 'unions', color: 'bg-purple-500', label: 'union' },
    { key: 'joins', color: 'bg-lime-500', label: 'join' }
  ]

  const handleClick = useCallback((e: React.MouseEvent, source: Source, column: string) => {
    e.stopPropagation()
    const schema = source.schema
    const table = source.table

    const activeSource = table
    const params = new URLSearchParams({schema, sources: table, activeSource})
    if (column) {
      const selectedColumns = JSON.stringify({ [table]: [column] })
      params.set('selectedColumns', selectedColumns)
    }
    window.open(`/cte?${params.toString()}`, '_blank')
  }, [])


  useEffect(() => {
  }, [])
  const renderColumnNames = () => {
    if (!data.meta || data.meta.length === 0) return null

    return data.meta.map((mt, idx) => (
      <div key={idx} className="text-[9px] leading-tight font-mono whitespace-pre">
        <div className="flex min-w-0"><span className="bg-amber-200 truncate" title={mt.column}>{mt.column}</span></div>
        {mt.nextColumns.length > 0 ? (
          mt.nextColumns.map((nextColumn, i) => (
            <React.Fragment key={i}>
              <div className="flex items-center">
              <span className="flex-shrink-0 w-4">
                {i === mt.nextColumns.length - 1 ? '└── ' : '├── '}
              </span>
                <span className="bg-emerald-200 truncate" title={nextColumn}>{nextColumn}</span>
              </div>
              {mt.nextSources[i] && (
                <div className="flex items-center">
                <span className={`flex-shrink-0 ${i === mt.nextColumns.length - 1 ? 'w-4' : 'w-1 mr-3'}`}>
                  {i === mt.nextColumns.length - 1 ? '' : '│'}
                </span>
                  <span className="flex-shrink-0 w-4">└── </span>
                  <span
                    className="bg-indigo-200 text-blue-700 truncate cursor-pointer underline"
                    onClick={(e) => handleClick(e, mt.nextSources[i], mt.nextColumns[i] || mt.column)}
                    title={mt.nextSources[i].table}
                  >
                  {mt.nextSources[i].table}
                </span>
                </div>
              )}
            </React.Fragment>
          ))
        ) : (
          mt.nextSources.map((nextSource, i) => (
            <div key={i} className="flex items-center">
            <span className="flex-shrink-0 w-4">
              {i === mt.nextSources.length - 1 ? '└── ' : '├── '}
            </span>
              <span
                className="bg-indigo-200 text-blue-700 truncate cursor-pointer underline"
                onClick={(e) => handleClick(e, nextSource, mt.nextColumns[i] || mt.column)}
                title={nextSource.table}
              >
              {nextSource.table}
            </span>
            </div>
          ))
        )}
      </div>
    ))
  }

  return (
    <div className="relative bg-white border border-gray-300 rounded-md p-1 shadow-sm w-48 min-h-[60px] flex flex-col">
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div className="flex flex-col flex-grow">
        <div className="font-semibold text-[11px] truncate mb-0.5" title={data.label}>{data.label}</div>
        <div className="flex-grow overflow-hidden">
          {renderColumnNames()}
        </div>
      </div>
      <div className="flex flex-wrap gap-0.5 mt-1">
        {seriesItems.map(({ key, color, label }) => {
          const content = data[key]
          return Array.isArray(content) && content.length > 0 ? (
            <div key={key} className="flex items-center cursor-pointer" title={content.join('\n')}>
              <div className={`w-2 h-2 ${color} mr-0.5 rounded-full`}></div>
              <span className="text-[6px]">{label}</span>
            </div>
          ) : null
        })}
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  )
}

export default CteNode