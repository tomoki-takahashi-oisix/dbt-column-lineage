'use client'
import React, { memo } from 'react'
import { Handle, Position, useStore } from 'reactflow'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMinus, faPlus, faSpinner } from '@fortawesome/free-solid-svg-icons'
import { useStore as useStoreZustand } from '@/store/zustand'

interface TableNodeHandleProps {
  type: 'source' | 'target'
  position: Position
  id: string
  isConnectable: boolean
  nodeId: string
  onConnect?: Function
  onDelete?: Function
}

const TableNodeHandle: React.FC<TableNodeHandleProps> = ({ type, position, id, isConnectable, nodeId, onConnect, onDelete, }) => {
  const edges = useStore((store) => store.edges)
  const loading = useStoreZustand((state) => state.loading)

  // ハンドルが接続されているかどうか
  const isConnected = edges.some(edge =>
    (type === 'target' && edge.target === nodeId && edge.targetHandle === id) ||
    (type === 'source' && edge.source === nodeId && edge.sourceHandle === id)
  )

  // ハンドルがクリックされたときの処理
  const handleClick = (event: React.MouseEvent) => {
    if (loading) return
    event.stopPropagation()
    if (type === 'source' && isConnected && onDelete) {
      onDelete()
    } else if (!isConnected && onConnect) {
      onConnect()
    }
  }

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    top: '22px',
    transform: 'translateY(-50%)',
    ...(position === Position.Left
      ? { left: '-2px' }
      : { right: '-2px' }),
    zIndex: 1,
  }

  return (
    <div style={containerStyle}>
      <Handle
        type={type}
        position={position}
        id={id}
        isConnectable={isConnectable}
        style={{
          opacity: 0,
          width: '24px',
          height: '24px',
          background: 'transparent',
          border: 'none',
        }}
      />
      { onDelete && <button
        className="w-6 h-6 flex items-center justify-center bg-white rounded-full border border-gray-300 hover:bg-gray-100 focus:outline-none"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'auto',
          cursor: type === 'source' && isConnected ? 'pointer' : 'default',
        }}
        onClick={handleClick}
      >
        { (type === 'source' && isConnected && onDelete) ? (
          <FontAwesomeIcon
            icon={faMinus}
            className="text-gray-600"
          />
        ) : (!isConnected && onConnect) ? (
          <FontAwesomeIcon
            icon={loading ? faSpinner : faPlus}
            spinPulse={loading}
            className="text-gray-600"
          />
        ) : (
          <span className="w-4 h-4"></span>
        )}
      </button>}
    </div>
  )
}

export default memo(TableNodeHandle)