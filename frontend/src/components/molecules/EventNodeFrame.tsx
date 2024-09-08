'use client'
import React, { memo, useCallback, useMemo } from 'react'
import { faCopy } from '@fortawesome/free-regular-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

interface NodeProps {
  tableName: string;
  selected: boolean;
  color?: string;
  content: React.ReactNode;
}

const EventNodeFrame: React.FC<NodeProps> = ({ tableName, selected, color, content }) => {
  // クリック時にテーブル名をクリップボードにコピーする
  const handleClickTabelName = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(tableName)
      alert('Copied to clipboard!: ' + tableName)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }, [tableName])

  // テーブル名の背景色を設定
  const titleStyle = useMemo(() => ({
    backgroundColor: color || '#FFF',
  }), [color]);

  return (
    <div className={`
      flex flex-col bg-white 
      transition-all duration-250 ease-in-out
      ${selected
      ? 'shadow-[0_14px_28px_rgba(0,0,0,0.25),_0_10px_10px_rgba(0,0,0,0.22)]'
      : 'shadow-[0_3px_6px_rgba(0,0,0,0.16),_0_3px_6px_rgba(0,0,0,0.23)]'}
      border-0 border-solid border-[#bbb]
      text-[10pt]
    `}>
      <div
        className="relative py-2 px-8 flex-grow"
        style={titleStyle}
      >
        <span>{tableName}</span>
        <FontAwesomeIcon
          onClick={handleClickTabelName}
          className="cursor-pointer mx-1 text-xs"
          icon={faCopy}
        />
      </div>
      <div className="">
        {content}
      </div>
    </div>
  )
}

export default memo(EventNodeFrame)
