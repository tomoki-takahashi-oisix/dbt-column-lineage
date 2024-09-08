'use client'
import React, { memo } from 'react'
import { Handle, Position, useStore } from 'reactflow'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMinus, faPlus, faSpinner } from '@fortawesome/free-solid-svg-icons'
import { useStore as useStoreZustand } from '@/store/zustand'

interface CustomHandleProps {
  type: 'source' | 'target'
  position: Position
  id: string
  isConnectable: boolean
  nodeId: string
  onDelete: () => void
  onConnect: (handleType: 'source' | 'target') => void
  showToggle?: boolean
}

const EventNodeHandle: React.FC<CustomHandleProps> = ({ type, position, id, isConnectable, nodeId, onDelete, onConnect }) => {
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
    if (type === 'source' && isConnected) {
      onDelete()
    } else if (!isConnected) {
      onConnect(type)
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        [position === Position.Left ? 'left' : 'right']: '-2px',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 1,
      }}
    >
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
      <button
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
        {type === 'source' && isConnected ? (
          <FontAwesomeIcon
            icon={faMinus}
            className="text-gray-600"
          />
        ) : !isConnected ? (
          <FontAwesomeIcon
            icon={loading ? faSpinner : faPlus}
            spinPulse={loading}
            className="text-gray-600"
          />
        ) : (
          <span className="w-4 h-4"></span>
        )}
      </button>
    </div>
  )
}

export default memo(EventNodeHandle)
