'use client'
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons'

interface ColumnData {
  value: string
  label: string
  description?: string
}

interface EventNodeColumnsProps {
  schema: string
  tableName: string
  nodeColumns: string[] // EventNodeのdata.columnsを受け取る
  handlePlusClickEventNodeHandle: (column: string, handleType: 'source' | 'target') => Promise<void>
}

const EventNodeColumns: React.FC<EventNodeColumnsProps> = ({ schema, tableName, nodeColumns, handlePlusClickEventNodeHandle }) => {
  const [fetching, setFetching] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [displayColumns, setDisplayColumns] = useState<ColumnData[]>([])
  const [nodeWidth, setNodeWidth] = useState<number | null>(null)
  const columnListRef = useRef<HTMLDivElement>(null)
  const nodeRef = useRef<HTMLDivElement>(null)

  // 対象テーブルのカラム情報を取得する
  const fetchColumns = useCallback(async () => {
    if (displayColumns.length > 0 || fetching) return
    setFetching(true)
    try {
      const query = new URLSearchParams({ schema, source: tableName })
      const hostName = process.env.NEXT_PUBLIC_API_HOSTNAME || ''
      const response = await fetch(`${hostName}/api/v1/columns?${query}`)
      const allColumns: ColumnData[] = await response.json()
      // 表示するカラムをフィルタリング（大文字小文字を区別せずに比較）
      const nodeColumnSet = new Set(nodeColumns.map(col => col.toLowerCase()))
      const filteredColumns = allColumns.filter(col => !nodeColumnSet.has(col.value.toLowerCase()))
      setDisplayColumns(filteredColumns)
    } catch (error) {
      console.error('Error fetching columns:', error)
    } finally {
      setFetching(false)
    }
  }, [schema, tableName, nodeColumns, fetching, setFetching])

  // (v)を押下したときカラム一覧を開閉する。カラム一覧を開く際にカラム情報を取得する
  const handleToggleColumns = useCallback(() => {
    setIsOpen(prev => {
      const newIsOpen = !prev
      if (newIsOpen) fetchColumns()
      return newIsOpen
    })
  }, [fetchColumns])

  // カラムが選択されたときの処理
  const handleColumnClick = useCallback(async (column: ColumnData) => {
    if (fetching) return
    // console.log(`Selected column: ${column.label}`)
    await handlePlusClickEventNodeHandle(column.value, 'source')
    // 選択されたカラムをカラム一覧から非表示にする
    setDisplayColumns(prev => prev.filter(col => col.value !== column.value))

    // ノードの幅を更新
    if (nodeRef.current) {
      setNodeWidth(nodeRef.current.offsetWidth)
    }
  }, [fetching, handlePlusClickEventNodeHandle])

  // 初期レンダリング時にカラム一覧の幅を更新
  useEffect(() => {
    if (nodeRef.current) {
      setNodeWidth(nodeRef.current.offsetWidth)
    }
  }, [])

  return (
    <div ref={nodeRef}>
      <div className="mt-2 border-t pt-2 flex justify-center">
        <button
          className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 focus:outline-none"
          onClick={handleToggleColumns}
          aria-label={isOpen ? "Collapse columns" : "Expand columns"}
        >
          <FontAwesomeIcon icon={isOpen ? faChevronUp : faChevronDown} className="text-gray-600" />
        </button>
      </div>

      {isOpen && nodeWidth && (
        <div
          ref={columnListRef}
          className="nowheel mt-2 max-h-60 overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200"
          style={{ width: `${nodeWidth}px`, overflow: 'auto' }}
          onWheel={(e) => e.stopPropagation()}
        >
          {fetching ? (
            <p className="text-center">Loading columns...</p>
          ) : displayColumns.length > 0 ? (
            <ul className="list-none p-0 m-0">
              {displayColumns.map((column) => (
                <li
                  key={column.value}
                  className="flex flex-col relative cursor-pointer hover:bg-gray-100 transition-colors duration-200 py-2 px-6"
                  onClick={() => handleColumnClick(column)}
                >
                  <span className="hover:underline flex-grow truncate">{column.label}</span>
                  {column.description && (
                    <span className="text-xs text-gray-500 mt-1 truncate" title={column.description}>
                      {column.description}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-gray-500">All columns have been selected.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default EventNodeColumns