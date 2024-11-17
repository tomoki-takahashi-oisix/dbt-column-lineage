'use client'
import React, { memo, useCallback, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTimes } from '@fortawesome/free-solid-svg-icons'
import { useSearchParams } from 'next/navigation'
import { useStore as useStoreZustand } from '@/store/zustand'
import { getColorClassForMaterialized } from '@/lib/utils'

interface DashboardNodeFrameProps {
  id: string
  name: string
  url: string
  selected: boolean
  content: React.ReactNode
  hideNode: () => void
}

const TableNodeFrame: React.FC<DashboardNodeFrameProps> = ({name, url, selected, content, hideNode}) => {
  const setMessage = useStoreZustand((state) => state.setMessage)
  const searchParams = useSearchParams()
  const [showMenu, setShowMenu] = useState(false)

  const handleClickTableName = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    window.open(url, '_blank')
  }, [url])

  const handleClickXmark = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    hideNode()
  }, [hideNode])

  // ソーステーブルの場合は非表示ボタンを表示しない
  const showHideButton = useCallback((): boolean => {
    return searchParams.get('source') !== name
  }, [searchParams, name])

  const colorClass = getColorClassForMaterialized('dashboard')

  return (
    <div
      className={`flex flex-col bg-white transition-all duration-250 ease-in-out border-0 border-solid border-gray-300 text-sm 
      ${selected ? 'shadow-lg' : 'shadow-md'}`}
    >
      <div
        className={`relative py-2 px-3 flex items-center justify-between ${colorClass}`}
      >
        <div className="flex-grow mr-2 overflow-hidden text-ellipsis">
          <span className="cursor-pointer hover:underline" onClick={handleClickTableName} title={name}>
            {name}
          </span>
        </div>
        <div className="flex-shrink-0 flex items-center">
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

export default memo(TableNodeFrame)