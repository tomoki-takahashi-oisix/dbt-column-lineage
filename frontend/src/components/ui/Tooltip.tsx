'use client'
import React from 'react'

type Side = 'top' | 'bottom' | 'left' | 'right'

const sidePos: Record<Side, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
}

// ホバーで即表示する軽量ツールチップ(CSS group-hover、依存追加なし)。
// children は単一のトリガー要素(ボタン等)を想定。aria-label は呼び出し側に任せる。
export const Tooltip = ({
  label,
  side = 'bottom',
  children,
}: {
  label: string
  side?: Side
  children: React.ReactNode
}) => (
  <span className="group/tt relative inline-flex">
    {children}
    <span
      role="tooltip"
      className={`pointer-events-none absolute z-50 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-md transition-opacity duration-150 group-hover/tt:opacity-100 ${sidePos[side]}`}
    >
      {label}
    </span>
  </span>
)
