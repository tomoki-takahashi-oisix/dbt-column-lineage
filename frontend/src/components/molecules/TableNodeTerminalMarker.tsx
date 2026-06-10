'use client'
import React, { memo } from 'react'
import { Position } from '@xyflow/react'

interface TableNodeTerminalMarkerProps {
  position: Position
  // column 行(top:50%)か table ヘッダ(top:22px)かで縦位置を合わせる
  variant?: 'column' | 'table'
}

// 「+」で展開してもその先が無い(終端)ときに、ハンドルを黙って消す代わりに
// 出す静的マーカー。ハンドルと同じ 24px の枠を占有して行のレイアウトを崩さない。
// クリック不可・ミュートなグレーの終端キャップで「ここで系統が終わり」を示す。
const TableNodeTerminalMarker: React.FC<TableNodeTerminalMarkerProps> = ({ position, variant = 'column' }) => {
  return (
    <div
      title="No further lineage"
      style={{
        position: 'absolute',
        [position === Position.Left ? 'left' : 'right']: '-2px',
        top: variant === 'table' ? '22px' : '50%',
        transform: 'translateY(-50%)',
        zIndex: 1,
        pointerEvents: 'none',
      }}
    >
      <div className="w-6 h-6 flex items-center justify-center">
        {/* 接続線の末端キャップ(短い縦バー) */}
        <span className="block w-[3px] h-3.5 rounded-full bg-gray-300" />
      </div>
    </div>
  )
}

export default memo(TableNodeTerminalMarker)
