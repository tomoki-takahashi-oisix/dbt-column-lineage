import React, { useCallback, useEffect, useState } from 'react'
import { useStore as useStoreZustand } from '@/store/zustand'
import { Edge, useReactFlow } from 'reactflow'
import { toBlob } from 'html-to-image'
import { Camera, Table, Columns3 } from 'lucide-react'

const ToggleButtons = () => {
  const { getEdges, setEdges } = useReactFlow()
  const showColumn = useStoreZustand((state) => state.showColumn)
  const setShowColumn = useStoreZustand((state) => state.setShowColumn)
  const setClearNodePosition = useStoreZustand((state) => state.setClearNodePosition)
  const columnModeEdges = useStoreZustand((state) => state.columnModeEdges)
  const setColumnModeEdges = useStoreZustand((state) => state.setColumnModeEdges)
  const setRightMaxDepth = useStoreZustand((state) => state.setRightMaxDepth)
  const setMessage = useStoreZustand((state) => state.setMessage)

  const [activeButton, setActiveButton] = useState('column')

  const buttons = [
    { id: 'table', icon: Table, label: 'Table' },
    { id: 'column', icon: Columns3, label: 'Column' },
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
      const newEdges = columnModeEdges.concat(updatedEdges)
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

      const newEdges = Array.from(tableEdges.values())
      setEdges(newEdges)

    }
    setClearNodePosition(true)
  }, [getEdges, setEdges, setShowColumn, setClearNodePosition, columnModeEdges])

  const copyToClipboard = useCallback(async() => {
    const flowElement = document.querySelector('.react-flow__viewport') as HTMLElement

    const blob = await toBlob(flowElement, { backgroundColor: '#fff', })
    if (blob) {
      try {
        let data = [new window.ClipboardItem({ 'image/png': blob })]
        await navigator.clipboard.write(data)
        const params = new URLSearchParams(window.location.search).toString()
        setMessage('Successfully copied to clipboard!:\n\n' + params, 'success')
        setTimeout(() => setMessage(null, null), 6000) // Clear message after 3 seconds
      } catch (err) {
        setMessage('Failed to copy to clipboard', 'error')
        console.error('Failed to copy:', err)
        setTimeout(() => setMessage(null, null), 3000) // Clear message after 3 seconds
      }
    }
  }, [])

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex items-center space-x-4">
        <div className="inline-flex rounded-md shadow-sm" role="group">
          {buttons.map((button) => (
            <button
              key={button.id}
              type="button"
              className={`px-4 py-2 text-sm font-medium border flex items-center whitespace-nowrap ${
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
              <button.icon className="mr-2" size={16} />
              <span>{button.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={copyToClipboard}
          className="rounded px-4 py-2 text-sm font-medium border bg-blue-500 text-white border-blue-600 flex items-center hover:bg-blue-600 transition-colors duration-200"
          aria-label="Copy to clipboard"
        >
          <Camera className="mr-2" size={16} />
          <span>Copy to clipboard</span>
        </button>
      </div>
    </div>
  )
}

export default ToggleButtons
