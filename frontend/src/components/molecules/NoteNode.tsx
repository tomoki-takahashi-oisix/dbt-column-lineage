'use client'
import React, { useCallback } from 'react'
import { Handle, Node, NodeProps, Position, useReactFlow } from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import { useStore as useStoreZustand } from '@/store/zustand'

// 設計図に添えるメモ/注釈。任意で破線コネクタ用ハンドルを持ち、対象に結びつけられる。
export type NoteNodeDataType = {
  text: string
  custom: true
  manual: true
}

export type NoteNodeFlowType = Node<NoteNodeDataType, 'noteNode'>
export type NoteNodeProps = NodeProps<NoteNodeFlowType>

const dot: React.CSSProperties = {
  width: 8,
  height: 8,
  background: '#d97706',
  border: '2px solid #fff',
}

export const NoteNode: React.FC<NoteNodeProps> = ({ data, id, selected }) => {
  const editMode = useStoreZustand((state) => state.editMode)
  const { updateNodeData, setNodes } = useReactFlow()

  const onTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => updateNodeData(id, { text: e.target.value }),
    [id, updateNodeData],
  )
  const deleteNode = useCallback(
    () => setNodes((nds) => nds.filter((n) => n.id !== id)),
    [id, setNodes],
  )

  return (
    <div
      className={`relative rounded-sm border border-amber-300 ${selected ? 'shadow-lg' : 'shadow-md'}`}
      style={{ background: '#fffbeb', minWidth: 160, maxWidth: 280, padding: '8px 10px' }}
    >
      <Handle type="source" position={Position.Bottom} id={`${id}__source`} isConnectable style={dot} />
      <Handle type="target" position={Position.Top} id={`${id}__target`} isConnectable style={dot} />

      {editMode ? (
        <textarea
          className="nodrag w-full resize-y border-none bg-transparent text-xs text-amber-900 focus:outline-hidden"
          rows={3}
          value={data.text}
          placeholder="note…"
          onChange={onTextChange}
        />
      ) : (
        <div className="text-xs whitespace-pre-wrap text-amber-900">{data.text || '(empty note)'}</div>
      )}

      {editMode && selected && (
        <button
          className="nodrag absolute -top-3 -right-3 flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 shadow-sm hover:bg-red-50 hover:text-red-600"
          onClick={deleteNode}
          title="Delete note"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  )
}
