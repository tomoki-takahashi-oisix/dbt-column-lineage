import React, { useCallback, useEffect, useState } from 'react'
import { useStore as useStoreZustand } from '@/store/zustand'
import { Edge, useReactFlow } from '@xyflow/react'
import { Table, Columns3 } from 'lucide-react'

const ToggleButtons = () => {
  const { getEdges, setEdges } = useReactFlow()
  const showColumn = useStoreZustand((state) => state.showColumn)
  const setShowColumn = useStoreZustand((state) => state.setShowColumn)
  const setClearNodePosition = useStoreZustand((state) => state.setClearNodePosition)
  const columnModeEdges = useStoreZustand((state) => state.columnModeEdges)
  const setColumnModeEdges = useStoreZustand((state) => state.setColumnModeEdges)
  const setRightMaxDepth = useStoreZustand((state) => state.setRightMaxDepth)
  const editMode = useStoreZustand((state) => state.editMode)

  const [activeButton, setActiveButton] = useState('column')

  const buttons = [
    { id: 'table', icon: Table, label: 'Table' },
    { id: 'column', icon: Columns3, label: 'Column' },
  ]

  // showColumnが変更されたときにactiveButtonを変更する(showColumn から導出する同期 setState)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setActiveButton(showColumn ? 'column' : 'table')
  }, [showColumn])
  /* eslint-enable react-hooks/set-state-in-effect */

  // ボタンが押されたときの処理
  const handleToggleButton = useCallback((buttonId: string) => {
    const showColumnValue = buttonId === 'column'
    setShowColumn(showColumnValue)
    // dashboardモードのエッジは除外
    const currentEdges = getEdges().filter((edge: any) => edge?.mode != 'dashboard')
    const filteredEdges = getEdges().filter((edge: any) => edge?.mode == 'dashboard')

    if (showColumnValue) {
      // テーブルモードからカラムモードへの切り替え
      const updatedEdges = currentEdges.map(edge => ({
        ...edge,
        fixed: true, // 削除しないように固定
        style: {
          ...edge.style,
          strokeDasharray: '5,5',  // 点線のパターンを定義
          strokeWidth: 1.5,        // 線の太さを設定
        }
      }))
      // 保存しておいたカラムモードのエッジを復元し、エッジをマージ
      const newEdges = columnModeEdges.concat(updatedEdges).concat(filteredEdges)
      setEdges(newEdges)
      // カラムモードではrightMaxDepthは使えないのでfalseにする
      setRightMaxDepth(false)
    } else {
      // 前のカラムモードのfixed以外のエッジを保存
      const withoutFixedEdges = currentEdges.filter((edge:any) => !edge.fixed)
      setColumnModeEdges(withoutFixedEdges)
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
            sourceHandle: `${sourceTable}__source`,
            targetHandle: `${targetTable}__target`,
          })
        }
      })

      const newEdges = Array.from(tableEdges.values()).concat(filteredEdges)
      setEdges(newEdges)

    }
    setClearNodePosition(true)
  }, [getEdges, setEdges, setShowColumn, setClearNodePosition, columnModeEdges, setColumnModeEdges, setRightMaxDepth])

  // 編集はカラム名を扱うので、編集に入るとき(editMode が true 化)で Table 表示なら Column へ自動切替する。
  // editMode の遷移時だけ反応させたいので deps は editMode のみ(handleToggleButton/showColumn は意図的に除外)。
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (editMode && !showColumn) {
      handleToggleButton('column')
    }
  }, [editMode])
  /* eslint-enable react-hooks/exhaustive-deps */

  return (
    <div className="inline-flex w-fit self-start overflow-hidden rounded-lg border border-gray-200" role="group">
      {buttons.map((button) => (
        <button
          key={button.id}
          type="button"
          className={`px-2.5 py-1.5 text-xs font-medium flex items-center whitespace-nowrap ${
            activeButton === button.id
              ? 'bg-blue-500 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
          onClick={() => handleToggleButton(button.id)}
        >
          <button.icon className="mr-1" size={15} />
          <span>{button.label}</span>
        </button>
      ))}
    </div>
  )
}

export default ToggleButtons
