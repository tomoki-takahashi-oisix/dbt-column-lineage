import React, { useCallback, useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faColumns, faTable } from '@fortawesome/free-solid-svg-icons'
import { useStore as useStoreZustand } from '@/store/zustand'
import { Edge, useReactFlow } from 'reactflow'

const ToggleButtons = () => {
  const { getEdges, setEdges } = useReactFlow()
  const showColumn = useStoreZustand((state) => state.showColumn)
  const setShowColumn = useStoreZustand((state) => state.setShowColumn)
  const setClearNodePosition = useStoreZustand((state) => state.setClearNodePosition)
  const [activeButton, setActiveButton] = useState('column')

  const buttons = [
    { id: 'table', icon: faTable, label: 'Table' },
    { id: 'column', icon: faColumns, label: 'Column' },
  ]

  // showColumnが変更されたときにactiveButtonを変更する
  useEffect(() => {
    setActiveButton(showColumn ? 'column' : 'table')
  }, [showColumn])

  // ボタンが押されたときの処理
  const handleToggleButton = useCallback((buttonId: string) => {
    const showColumnValue = buttonId === 'column'
    setShowColumn(showColumnValue)
    const currentEdges = getEdges()

    if (showColumnValue) {
      const updatedEdges = currentEdges.map(edge => ({
        ...edge,
        fixed: true, // 削除しないように固定
        style: {
          ...edge.style,
          strokeDasharray: '5,5',  // 点線のパターンを定義
          strokeWidth: 1.5,        // 線の太さを設定
        }
      }))
      setEdges(updatedEdges)
    } else {
      // カラムモードからテーブルモードへの切り替え
      const tableEdges = new Map<string, Edge>()
      currentEdges.forEach(edge => {
        const sourceTable = edge.source
        const targetTable = edge.target
        const edgeKey = `${sourceTable}-${targetTable}`

        if (!tableEdges.has(edgeKey)) {
          tableEdges.set(edgeKey, {
            id: edgeKey,
            source: sourceTable,
            target: targetTable,
            // handleをつけずあえて＋ハンドルを表示させる
            sourceHandle: `${sourceTable}__source`,
            targetHandle: `${targetTable}__target`,
          })
        }
      })

      const newEdges = Array.from(tableEdges.values())
      setEdges(newEdges)

    }
    setClearNodePosition(true)
  }, [getEdges, setEdges, setShowColumn, setClearNodePosition])

  return (
    <div className="inline-flex rounded-md shadow-sm" role="group">
      {buttons.map((button) => (
        <button
          key={button.id}
          type="button"
          className={`px-4 py-2 text-sm font-medium border ${
            activeButton === button.id
              ? 'bg-blue-500 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          } ${
            button.id === buttons[0].id
              ? 'rounded-l-lg'
              : button.id === buttons[buttons.length - 1].id
                ? 'rounded-r-lg'
                : ''
          }`}
          onClick={() => handleToggleButton(button.id)}
        >
          <FontAwesomeIcon icon={button.icon} className="mr-2" />
          {button.label}
        </button>
      ))}
    </div>
  );
};

export default ToggleButtons