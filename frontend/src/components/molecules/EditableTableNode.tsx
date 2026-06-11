'use client'
import React, { useCallback, useMemo } from 'react'
import { Handle, Node, NodeProps, Position, useReactFlow } from '@xyflow/react'
import { Trash2, Plus, X } from 'lucide-react'
import { useStore as useStoreZustand } from '@/store/zustand'

// 設計フェーズで開発者が手で足す「これから作るテーブル」。
// 属性はテーブル名とカラム名のみ。ハンドル ID は実テーブルノードと同じ
// `${column}__source` / `${column}__target` 規約に合わせ、エッジが整合・再現できるようにする。
export type EditableTableNodeDataType = {
  name: string
  columns: string[]
  pks?: string[] // 主キーのカラム名。複数指定で複合主キー
  custom: true
  manual: true
}

export type EditableTableNodeFlowType = Node<EditableTableNodeDataType, 'editableTableNode'>
export type EditableTableNodeProps = NodeProps<EditableTableNodeFlowType>

const dot: React.CSSProperties = {
  width: 9,
  height: 9,
  background: '#7c3aed',
  border: '2px solid #fff',
}

export const EditableTableNode: React.FC<EditableTableNodeProps> = ({ data, id, selected }) => {
  const editMode = useStoreZustand((state) => state.editMode)
  const options = useStoreZustand((state) => state.options)
  const { updateNodeData, setNodes } = useReactFlow()

  // rankdir に合わせてカラムハンドルの左右を実テーブルノードと揃える
  const sourcePos = options.rankdir === 'LR' ? Position.Right : Position.Left
  const targetPos = options.rankdir === 'LR' ? Position.Left : Position.Right

  const columns = useMemo(() => data.columns || [], [data.columns])
  const pks = useMemo(() => data.pks || [], [data.pks])

  const setName = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => updateNodeData(id, { name: e.target.value }),
    [id, updateNodeData],
  )
  const renameColumn = useCallback(
    (index: number, value: string) => {
      const old = columns[index]
      updateNodeData(id, {
        columns: columns.map((c, i) => (i === index ? value : c)),
        // PK 指定もリネームに追従させる
        pks: pks.includes(old) ? pks.map((p) => (p === old ? value : p)) : pks,
      })
    },
    [id, columns, pks, updateNodeData],
  )
  const addColumn = useCallback(
    () => updateNodeData(id, { columns: [...columns, `column_${columns.length + 1}`] }),
    [id, columns, updateNodeData],
  )
  const removeColumn = useCallback(
    (index: number) => {
      const col = columns[index]
      updateNodeData(id, {
        columns: columns.filter((_, i) => i !== index),
        pks: pks.filter((p) => p !== col),
      })
    },
    [id, columns, pks, updateNodeData],
  )
  const togglePk = useCallback(
    (column: string) =>
      updateNodeData(id, {
        pks: pks.includes(column) ? pks.filter((p) => p !== column) : [...pks, column],
      }),
    [id, pks, updateNodeData],
  )
  const deleteNode = useCallback(
    () => setNodes((nds) => nds.filter((n) => n.id !== id)),
    [id, setNodes],
  )

  return (
    <div
      className={`relative flex flex-col rounded-sm border-2 border-dashed border-violet-500 bg-white text-sm ${selected ? 'shadow-lg' : 'shadow-md'}`}
      style={{ minWidth: 200 }}
    >
      {/* テーブルレベルのハンドル(テーブル同士をつなぐ用) */}
      <Handle type="target" position={Position.Right} id={`${id}__target`} isConnectable style={{ ...dot, top: 16 }} />
      <Handle type="source" position={Position.Left} id={`${id}__source`} isConnectable style={{ ...dot, top: 16 }} />

      <div className="flex items-center justify-between bg-violet-50 px-3 py-2">
        {editMode ? (
          <input
            className="nodrag w-full rounded-sm border border-violet-300 bg-white px-1 py-0.5 text-sm font-semibold text-gray-800 focus:outline-hidden"
            value={data.name}
            placeholder="table name"
            onChange={setName}
          />
        ) : (
          <span className="font-semibold text-gray-800" title={data.name}>{data.name || '(no name)'}</span>
        )}
        {editMode && selected && (
          <button
            className="nodrag ml-2 shrink-0 rounded-full p-1 text-gray-500 hover:bg-red-50 hover:text-red-600"
            onClick={deleteNode}
            title="Delete table"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="py-1">
        {columns.map((column, index) => (
          <div key={index} className="relative flex items-center px-4 py-1.5">
            <Handle type="target" position={targetPos} id={`${column}__target`} isConnectable style={dot} />
            {editMode ? (
              <input
                className="nodrag grow rounded-sm border border-gray-200 bg-white px-1 py-0.5 text-xs text-gray-700 focus:outline-hidden"
                value={column}
                placeholder="column"
                onChange={(e) => renameColumn(index, e.target.value)}
              />
            ) : (
              <span className={`grow text-xs ${pks.includes(column) ? 'font-semibold text-gray-800' : 'text-gray-700'}`}>{column}</span>
            )}
            {editMode ? (
              <button
                className={`nodrag ml-1 shrink-0 rounded-sm px-1 text-[10px] font-bold ${
                  pks.includes(column) ? 'bg-amber-400 text-white' : 'border border-gray-300 text-gray-400 hover:border-amber-400 hover:text-amber-500'
                }`}
                onClick={() => togglePk(column)}
                title="Toggle primary key"
              >
                PK
              </button>
            ) : (
              pks.includes(column) && (
                <span className="ml-1 shrink-0 rounded-sm bg-amber-400 px-1 text-[10px] font-bold text-white">PK</span>
              )
            )}
            {editMode && (
              <button
                className="nodrag ml-1 shrink-0 text-gray-400 hover:text-red-600"
                onClick={() => removeColumn(index)}
                title="Remove column"
              >
                <X size={13} />
              </button>
            )}
            <Handle type="source" position={sourcePos} id={`${column}__source`} isConnectable style={dot} />
          </div>
        ))}
        {editMode && (
          <button
            className="nodrag mx-4 my-1 flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-800"
            onClick={addColumn}
          >
            <Plus size={13} /> add column
          </button>
        )}
      </div>
    </div>
  )
}
