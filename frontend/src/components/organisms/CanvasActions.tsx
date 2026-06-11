'use client'
import React, { useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import { toBlob } from 'html-to-image'
import { Camera, Pencil } from 'lucide-react'
import { useStore as useStoreZustand } from '@/store/zustand'
import { Tooltip } from '@/components/ui/Tooltip'

// キャンバス右下に出す丸アイコンのアクション群。
// Edit(設計モードの入口・ON で紫)を主、Copy(画像コピー)を副として置く。
export const CanvasActions = () => {
  const { fitView } = useReactFlow()
  const setMessage = useStoreZustand((state) => state.setMessage)
  const editMode = useStoreZustand((state) => state.editMode)
  const setEditMode = useStoreZustand((state) => state.setEditMode)

  const copyToClipboard = useCallback(async () => {
    const flowElement = document.querySelector('.react-flow__viewport') as HTMLElement
    // ビューをフィットさせてから画像化する
    window.requestAnimationFrame(() => fitView())
    await new Promise(resolve => setTimeout(resolve, 100))
    const blob = await toBlob(flowElement, { backgroundColor: '#fff' })
    if (blob) {
      try {
        const data = [new window.ClipboardItem({ 'image/png': blob })]
        await navigator.clipboard.write(data)
        setMessage('Canvas image copied to clipboard!', 'success')
        setTimeout(() => setMessage(null, null), 3000)
      } catch (err) {
        setMessage('Failed to copy to clipboard', 'error')
        console.error('Failed to copy:', err)
        setTimeout(() => setMessage(null, null), 3000)
      }
    }
  }, [fitView, setMessage])

  const circle = 'flex items-center justify-center rounded-full border shadow-md transition-colors'

  return (
    <div className="flex flex-col items-end gap-2">
      <Tooltip label="Copy the canvas as an image" side="left">
        <button
          type="button"
          onClick={copyToClipboard}
          className={`${circle} h-11 w-11 border-gray-200 bg-white text-gray-600 hover:bg-gray-50`}
          aria-label="Copy to clipboard"
        >
          <Camera size={18} />
        </button>
      </Tooltip>
      <Tooltip label={editMode ? 'Exit edit mode' : 'Edit — add tables, notes, and connections'} side="left">
        <button
          type="button"
          onClick={() => setEditMode(!editMode)}
          className={`${circle} h-11 w-11 ${
            editMode
              ? 'border-violet-700 bg-violet-600 text-white hover:bg-violet-700'
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          }`}
          aria-label="Toggle edit mode"
          aria-pressed={editMode}
        >
          <Pencil size={18} />
        </button>
      </Tooltip>
    </div>
  )
}
