'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Edge, Node, useReactFlow } from '@xyflow/react'
import { Table, StickyNote, Share2, Download, Upload } from 'lucide-react'
import { useStore as useStoreZustand } from '@/store/zustand'
import { serializeDesign, exportDesignJson, importDesignJson, DesignSnapshot, DesignView } from '@/lib/design'

// 共有 URL の長さしきい値(文字数)。ゲートウェイは URL+ヘッダで 8KB 程度が定番上限なので
// 余裕を見て SOFT/HARD を設ける。超えたら Export を促す。
const URL_SOFT_LIMIT = 2000
const URL_HARD_LIMIT = 8000

// バー下の説明エリアの既定文言(どのボタンにもホバーしていないとき)
const DEFAULT_HINT = 'Drag a column dot to another to connect · click a name to edit · toggle PK for keys'

interface EditToolbarProps {
  nodes: Node[]
  edges: Edge[]
  setNodes: (updater: (nds: Node[]) => Node[]) => void
  applySnapshot: (snapshot: DesignSnapshot) => void
}

export const EditToolbar: React.FC<EditToolbarProps> = ({ nodes, edges, setNodes, applySnapshot }) => {
  const { screenToFlowPosition } = useReactFlow()
  const editMode = useStoreZustand((state) => state.editMode)
  const showColumn = useStoreZustand((state) => state.showColumn)
  const options = useStoreZustand((state) => state.options)
  const sourceMode = useStoreZustand((state) => state.sourceMode)
  const setMessage = useStoreZustand((state) => state.setMessage)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // 説明エリア: ホバー中のボタン説明 / 起動直後だけ出る既定ヒント(数秒で消える)。
  const [hovered, setHovered] = useState<string | null>(null)
  const [showDefault, setShowDefault] = useState(true)
  // Edit に入った直後だけ既定ヒントを表示し、6秒で自動的に消す
  useEffect(() => {
    const t = setTimeout(() => setShowDefault(false), 6000)
    return () => clearTimeout(t)
  }, [])
  const describe = useCallback(
    (text: string) => ({
      onMouseEnter: () => setHovered(text),
      onMouseLeave: () => setHovered(null),
    }),
    [],
  )
  const hint = hovered ?? (showDefault ? DEFAULT_HINT : null)

  const currentView = useCallback((): DesignView => ({
    showColumn,
    rankdir: options.rankdir,
    sourceMode,
  }), [showColumn, options.rankdir, sourceMode])

  // ビューポート中央のフロー座標を返す
  const centerPosition = useCallback(
    () => screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }),
    [screenToFlowPosition],
  )

  const addTableNode = useCallback(() => {
    const id = `table-${Date.now()}`
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: 'editableTableNode',
        position: centerPosition(),
        data: { name: '', columns: [], custom: true, manual: true },
      } as Node,
    ])
  }, [centerPosition, setNodes])

  const addNoteNode = useCallback(() => {
    const id = `note-${Date.now()}`
    setNodes((nds) => [
      ...nds,
      { id, type: 'noteNode', position: centerPosition(), data: { text: '', custom: true, manual: true } } as Node,
    ])
  }, [centerPosition, setNodes])

  const flash = useCallback((msg: string, type: 'success' | 'error' | 'info') => {
    setMessage(msg, type)
    setTimeout(() => setMessage(null, null), 3000)
  }, [setMessage])

  const shareUrl = useCallback(async () => {
    const encoded = serializeDesign(nodes, edges, currentView())
    const url = `${window.location.origin}/cl?design=${encoded}`
    // 上限超過のリンクを黙って渡さない。ハードはコピーせずエラー、ソフトはコピーするが警告。
    if (url.length > URL_HARD_LIMIT) {
      flash(`Design too large for a URL (${(url.length / 1024).toFixed(1)}KB). Use Export instead.`, 'error')
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      if (url.length > URL_SOFT_LIMIT) {
        flash('URL copied, but it may be too long for some gateways/chat. Use Export for large designs.', 'info')
      } else {
        flash('Design URL copied to clipboard', 'success')
      }
    } catch {
      // クリップボード API が使えない環境(非 https 等)では URL に反映してフォールバック
      window.history.replaceState(null, '', url)
      flash('Clipboard unavailable — URL updated in address bar', 'info')
    }
  }, [nodes, edges, currentView, flash])

  const exportJson = useCallback(() => {
    const json = exportDesignJson(nodes, edges, currentView())
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'lineage-design.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [nodes, edges, currentView])

  const onImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const snapshot = importDesignJson(String(reader.result))
      if (!snapshot) {
        flash('Invalid design file', 'error')
        return
      }
      applySnapshot(snapshot)
      flash('Design imported', 'success')
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [applySnapshot, flash])

  // Edit トグル本体は ToggleButtons の行に置いてあるので、ここでは編集中のアクション群だけ出す
  if (!editMode) return null

  // 「作る」=紫チップ(設計ツールのパレット)。「保存・共有」=静かなゴースト。色のゾーニングで2群を区別する。
  const createBtn = 'flex items-center gap-1 rounded-md bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100'
  const saveBtn = 'flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100'

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white/95 px-1.5 py-0 shadow-md backdrop-blur-sm">
        {/* 作る(紫チップ): 左上の表示トグル"Table"と区別するため + を付け「追加」と明示 */}
        <button type="button" className={createBtn} onClick={addTableNode} {...describe('Add a planned table — set its name and columns')}>
          <Table size={15} /> + Table
        </button>
        <button type="button" className={createBtn} onClick={addNoteNode} {...describe('Add a sticky note / annotation')}>
          <StickyNote size={15} /> + Note
        </button>

        <span className="mx-1 h-6 w-px bg-gray-200" aria-hidden />

        {/* 保存・共有 */}
        <button type="button" className={saveBtn} onClick={shareUrl} {...describe('Copy a shareable URL of this design')}>
          <Share2 size={15} /> Share
        </button>
        <button type="button" className={saveBtn} onClick={exportJson} {...describe('Download the design as JSON — for large designs / Git')}>
          <Download size={15} /> Export
        </button>
        <button type="button" className={saveBtn} onClick={() => fileInputRef.current?.click()} {...describe('Load a design from a JSON file')}>
          <Upload size={15} /> Import
        </button>
        <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={onImportFile} />
      </div>

      {/* 説明エリア: 起動直後の既定ヒント(数秒で消える) or ホバー中のボタン説明。idle 時は非表示 */}
      {hint && (
        <div className="rounded bg-gray-800/85 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm">
          {hint}
        </div>
      )}
    </div>
  )
}
