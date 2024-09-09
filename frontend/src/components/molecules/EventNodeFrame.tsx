'use client'
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { faCopy } from '@fortawesome/free-regular-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEllipsisV, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
import { useSearchParams } from 'next/navigation'

interface NodeProps {
  tableName: string
  selected: boolean
  color?: string
  content: React.ReactNode
  hideNode: () => void
}

const EventNodeFrame: React.FC<NodeProps> = ({ tableName, selected, color, content, hideNode }) => {
  const searchParams = useSearchParams()
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // クリック時にテーブル名をクリップボードにコピーする
  const handleClickTableName = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(tableName)
      alert('Copied to clipboard!: ' + tableName)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }, [tableName])

  const handleClickXmark = useCallback(() => {
    hideNode()
    setShowMenu(false)
  }, [hideNode])

  // ソーステーブルの場合は非表示ボタンを表示しない
  const showHideButton = useCallback((): boolean => {
    return searchParams.get('source') !== tableName
  }, [searchParams, tableName])

  // テーブル名の背景色を設定
  const titleStyle = useMemo(() => ({
    backgroundColor: color || '#FFF',
  }), [color])

  // メニューの外側をクリックしたときにメニューを閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

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
        className="relative py-2 px-8 flex-grow"
        style={titleStyle}
      >
        <span>{tableName}</span>
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          <button
            ref={buttonRef}
            className="p-1 rounded-full hover:bg-gray-200 focus:outline-none"
            onClick={() => setShowMenu(!showMenu)}
          >
            <FontAwesomeIcon icon={faEllipsisV} />
          </button>
          {showMenu && (
            <div
              ref={menuRef}
              className="absolute left-0 bottom-full mb-1 bg-white rounded-md shadow-lg z-10"
            >
              <div className="py-1">
                <button
                  onClick={handleClickTableName}
                  className="block w-full text-center px-3 py-2 text-gray-700 hover:bg-gray-100"
                  title="Copy table name"
                >
                  <FontAwesomeIcon icon={faCopy} />
                </button>
                {showHideButton() && (
                  <button
                    onClick={handleClickXmark}
                    className="block w-full text-center px-3 py-2 text-gray-700 hover:bg-gray-100"
                    title="Hide node"
                  >
                    <FontAwesomeIcon icon={faEyeSlash} />
                  </button>
                )}
              </div>
            </div>
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
