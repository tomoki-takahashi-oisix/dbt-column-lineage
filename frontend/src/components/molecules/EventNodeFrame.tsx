'use client'
import React, { memo, useCallback, useMemo, useState } from 'react'
import { faCopy } from '@fortawesome/free-regular-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEllipsisV, faTimes } from '@fortawesome/free-solid-svg-icons'
import { useSearchParams } from 'next/navigation'
import { useStore as useStoreZustand } from '@/store/zustand'

interface NodeProps {
  schema: string
  tableName: string
  selected: boolean
  color?: string
  isClickableTableName: boolean
  content: React.ReactNode
  hideNode: () => void
}

const EventNodeFrame: React.FC<NodeProps> = ({ schema, tableName, selected, color, isClickableTableName, content, hideNode }) => {
  const setMessage = useStoreZustand((state) => state.setMessage)
  const searchParams = useSearchParams()
  const [showMenu, setShowMenu] = useState(false)

  const handleClickTableName = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const sources = tableName
    const activeSource = sources
    const params = new URLSearchParams({schema, sources, activeSource})

    window.open(`/cte?${params.toString()}`, '_blank')
  }, [schema, tableName])

  // クリック時にテーブル名をクリップボードにコピーする
  const handleClickCopyName = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(tableName)
      setMessage('Copied to clipboard!', 'success')
      setTimeout(() => setMessage(null, null), 3000) // Clear message after 3 seconds
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }, [tableName])

  const handleClickXmark = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    hideNode()
  }, [hideNode])

  // ソーステーブルの場合は非表示ボタンを表示しない
  const showHideButton = useCallback((): boolean => {
    return searchParams.get('source') !== tableName
  }, [searchParams, tableName])

  // テーブル名の背景色を設定
  const titleStyle = useMemo(() => ({
    backgroundColor: color || '#FFF',
  }), [color])

  return (
    <div
      className={`
        flex flex-col bg-white 
        transition-all duration-250 ease-in-out
        ${selected
        ? 'shadow-[0_14px_28px_rgba(0,0,0,0.25),_0_10px_10px_rgba(0,0,0,0.22)]'
        : 'shadow-[0_3px_6px_rgba(0,0,0,0.16),_0_3px_6px_rgba(0,0,0,0.23)]'}
        border-0 border-solid border-[#bbb]
        text-[10pt]
      `}
    >
      <div
        className="relative py-2 px-3 flex items-center justify-between"
        style={titleStyle}
      >
        <div className="flex-grow mr-2 overflow-hidden text-ellipsis">
          {isClickableTableName ? (
            <span className="cursor-pointer hover:underline" onClick={handleClickTableName} title={tableName}>
              {tableName}
            </span>
          ) : (
            <span title={tableName}>{tableName}</span>
          )}
        </div>
        <div className="flex-shrink-0 flex items-center">
          <div className="relative group">
            <button
              className="p-1 rounded-full hover:bg-gray-200 focus:outline-none"
              onMouseEnter={() => setShowMenu(true)}
              onMouseLeave={() => setShowMenu(false)}
            >
              <FontAwesomeIcon icon={faEllipsisV} />
            </button>
            {showMenu && (
              <div
                className="absolute right-0 top-0 bg-white rounded-md shadow-lg z-10 whitespace-nowrap"
                style={{
                  transform: 'translate(5%, -90%)',
                }}
                onMouseEnter={() => setShowMenu(true)}
                onMouseLeave={() => setShowMenu(false)}
              >
                <div className="py-1">
                  <button
                    onClick={handleClickCopyName}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    title="Copy table name"
                  >
                    <FontAwesomeIcon icon={faCopy} className="mr-2" />
                    Copy table name
                  </button>
                </div>
              </div>
            )}
          </div>
          {showHideButton() && (
            <button
              onClick={handleClickXmark}
              className="p-1 ml-2 rounded-full hover:bg-gray-200 focus:outline-none"
              title="Hide node"
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>
      </div>
      <div className="">
        {content}
      </div>
    </div>
  )
}

export default memo(EventNodeFrame)