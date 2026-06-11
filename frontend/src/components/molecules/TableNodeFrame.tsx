'use client'
import React, { memo, useCallback, useMemo, useState } from 'react'
import { faCopy } from '@fortawesome/free-regular-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEllipsisV, faPenToSquare, faTimes, faUpRightFromSquare } from '@fortawesome/free-solid-svg-icons'
import { useSearchParams } from 'next/navigation'
import { useStore as useStoreZustand } from '@/store/zustand'
import { getColorClassForMaterialized } from '@/lib/utils'

interface TableNodeFrameProps {
  schema: string
  tableName: string
  selected: boolean
  materialized: string
  isClickableTableName: boolean
  content: React.ReactNode
  hideNode: () => void
  docsUrl?: string | null
  onMakeEditable?: () => void // 編集モードで設計ノードへ変換する(未指定/非編集モードでは非表示)
}

const TableNodeFrame: React.FC<TableNodeFrameProps> = ({schema, tableName, selected, materialized, isClickableTableName, content, hideNode, docsUrl, onMakeEditable}) => {
  const setMessage = useStoreZustand((state) => state.setMessage)
  const editMode = useStoreZustand((state) => state.editMode)
  const searchParams = useSearchParams()
  const [showMenu, setShowMenu] = useState(false)

  const handleClickTableName = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const sources = tableName
    const activeSource = sources
    const params = new URLSearchParams({ schema, sources, activeSource })

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
  }, [tableName, setMessage])

  // dbt docs の該当ノードページを別タブで開く(DBT_DOCS_BASE_URL 設定時のみ docsUrl が来る)
  const handleClickOpenDocs = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (docsUrl) {
      window.open(docsUrl, '_blank', 'noopener,noreferrer')
    }
  }, [docsUrl])

  const handleClickXmark = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    hideNode()
  }, [hideNode])

  // ソーステーブルの場合は非表示ボタンを表示しない
  const showHideButton = useCallback((): boolean => {
    return searchParams.get('source') !== tableName
  }, [searchParams, tableName])

  const colorClass = getColorClassForMaterialized(materialized)

  return (
    <div
      className={`flex flex-col bg-white transition-all duration-250 ease-in-out border-0 border-solid border-gray-300 text-sm 
      ${selected ? 'shadow-lg' : 'shadow-md'}`}
    >
      <div
        className={`relative py-2 px-3 flex items-center justify-between ${colorClass}`}
      >
        <div className="grow mr-2 overflow-hidden text-ellipsis">
          {isClickableTableName ? (
            <span className="cursor-pointer hover:underline" onClick={handleClickTableName} title={tableName}>
              {tableName}
            </span>
          ) : (
            <span title={tableName}>{tableName}</span>
          )}
        </div>
        <div className="shrink-0 flex items-center">
          <div className="relative group">
            <button
              className="p-1 rounded-full hover:bg-gray-200 focus:outline-hidden"
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
                  {editMode && onMakeEditable && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowMenu(false); onMakeEditable() }}
                      className="block w-full text-left px-4 py-2 text-sm text-violet-700 hover:bg-violet-50"
                      title="Make this model editable (convert to a design node)"
                    >
                      <FontAwesomeIcon icon={faPenToSquare} className="mr-2" />
                      Edit (design)
                    </button>
                  )}
                  <button
                    onClick={handleClickCopyName}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    title="Copy table name"
                  >
                    <FontAwesomeIcon icon={faCopy} className="mr-2" />
                    Copy table name
                  </button>
                  {docsUrl && (
                    <button
                      onClick={handleClickOpenDocs}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      title="Open in dbt docs"
                    >
                      <FontAwesomeIcon icon={faUpRightFromSquare} className="mr-2" />
                      Open in dbt docs
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          {showHideButton() && (
            <button
              onClick={handleClickXmark}
              className="p-1 ml-2 rounded-full hover:bg-gray-200 focus:outline-hidden"
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

export default memo(TableNodeFrame)