import { Edge, Node } from '@xyflow/react'
import LZString from 'lz-string'
import { SourceModeType } from '@/store/zustand'

// 設計図(DFD)スナップショットの形。グラフだけでなくビューモード状態も含める。
// tableNode の描画(列ハンドルの有無/位置)は showColumn・rankdir に依存し、
// これらが復元時に一致していないとエッジの参照先ハンドルが存在せず図が壊れるため。
export interface DesignView {
  showColumn: boolean
  rankdir: string
  sourceMode: SourceModeType
}

export interface DesignSnapshot {
  v: number
  view: DesignView
  nodes: Node[]
  edges: Edge[]
}

const SNAPSHOT_VERSION = 1

// シリアライズ対象のフィールドだけ抽出して軽量化する(transient な計測値などは落とす)
const pickNode = (node: Node): Node => ({
  id: node.id,
  type: node.type,
  position: node.position,
  data: node.data,
  ...(node.width ? { width: node.width } : {}),
  ...(node.height ? { height: node.height } : {}),
}) as Node

const pickEdge = (edge: Edge): Edge => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
  ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
  ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
  ...(edge.type ? { type: edge.type } : {}),
  ...(edge.data ? { data: edge.data } : {}),
  ...(edge.style ? { style: edge.style } : {}),
}) as Edge

// 素の JSON スナップショットを作る(Export/Import 用にも共有)
export const buildSnapshot = (nodes: Node[], edges: Edge[], view: DesignView): DesignSnapshot => ({
  v: SNAPSHOT_VERSION,
  view,
  nodes: nodes.map(pickNode),
  edges: edges.map(pickEdge),
})

// 形状ガード。壊れた共有 URL / 不正な JSON でも null を返して落とさない。
const isValidSnapshot = (obj: unknown): obj is DesignSnapshot => {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  return (
    Array.isArray(o.nodes) &&
    Array.isArray(o.edges) &&
    !!o.view &&
    typeof o.view === 'object'
  )
}

const normalizeView = (view: Partial<DesignView> | undefined): DesignView => ({
  showColumn: view?.showColumn ?? true,
  rankdir: view?.rankdir ?? 'RL',
  sourceMode: view?.sourceMode ?? 'dbt',
})

// URL 用: 圧縮して encodeURIComponent 安全な文字列にする
export const serializeDesign = (nodes: Node[], edges: Edge[], view: DesignView): string => {
  const snapshot = buildSnapshot(nodes, edges, view)
  return LZString.compressToEncodedURIComponent(JSON.stringify(snapshot))
}

export const deserializeDesign = (encoded: string): DesignSnapshot | null => {
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded)
    if (!json) return null
    const parsed = JSON.parse(json)
    if (!isValidSnapshot(parsed)) return null
    return { ...parsed, view: normalizeView(parsed.view) }
  } catch (e) {
    console.error('Failed to deserialize design:', e)
    return null
  }
}

// Export/Import 用: 整形した素の JSON 文字列
export const exportDesignJson = (nodes: Node[], edges: Edge[], view: DesignView): string =>
  JSON.stringify(buildSnapshot(nodes, edges, view), null, 2)

export const importDesignJson = (text: string): DesignSnapshot | null => {
  try {
    const parsed = JSON.parse(text)
    if (!isValidSnapshot(parsed)) return null
    return { ...parsed, view: normalizeView(parsed.view) }
  } catch (e) {
    console.error('Failed to import design JSON:', e)
    return null
  }
}
