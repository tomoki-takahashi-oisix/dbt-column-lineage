import { useCallback, useState } from 'react'
import { Node, Edge, useReactFlow, useUpdateNodeInternals, useStore } from 'reactflow'
import { useStore as useStoreZustand } from '@/store/zustand'

export const useEventNodeOperations = (id: string, setNodesPositioned?: (positioned: boolean) => void) => {
  const { getNodes, setNodes, getEdges, setEdges } = useReactFlow()
  const setLoading = useStoreZustand((state) => state.setLoading)
  const showColumn = useStoreZustand((state) => state.showColumn)
  const [lastNodeColumns, setLastNodeColumns] = useState<string[]>([])
  const [firstNodeColumns, setFirstNodeColumns] = useState<string[]>([])
  const [lastNodeTable, setLastNodeTable] = useState<string>()
  const [firstNodeTable, setFirstNodeTable] = useState<string>()
  const updateNodeInternals = useUpdateNodeInternals()

  // ノードをマージする補助関数
  const mergeNodes = useCallback((existingNodes: Node[], newNodes: Node[]): Node[] => {
    const nodeMap = new Map(existingNodes.map(node => [node.id, node]))

    newNodes.forEach(newNode => {
      if (nodeMap.has(newNode.id)) {
        // 既存のノードを更新
        const existingNode = nodeMap.get(newNode.id)!
        nodeMap.set(newNode.id, {
          ...existingNode,
          data: {
            ...existingNode.data,
            ...newNode.data,
            columns: Array.from(new Set([...existingNode.data.columns, ...newNode.data.columns]))
          }
        })
      } else {
        // 新しいノードを追加
        nodeMap.set(newNode.id, newNode)
      }
    })

    return Array.from(nodeMap.values())
  }, [])

  // エッジをマージする補助関数
  const mergeEdges = useCallback((existingEdges: Edge[], newEdges: Edge[]): Edge[] => {
    const edgeMap = new Map(existingEdges.map(edge => [edge.id, edge]))

    newEdges.forEach(newEdge => {
      if (!edgeMap.has(newEdge.id)) {
        edgeMap.set(newEdge.id, newEdge)
      }
    })

    return Array.from(edgeMap.values())
  }, [])

  // リバースリネージしてノードを追加する
  const addReverseLineage = useCallback(async (id: string, source: string, column: string) => {
    setLoading(true)
    const query = new URLSearchParams({source, column, depth: '1', show_column: showColumn.toString(), reverse: 'true'})
    const hostName = process.env.NEXT_PUBLIC_API_HOSTNAME || ''
    const response = await fetch(`${hostName}/api/v1/lineage?${query}`)
    const data = await response.json()
    setLoading(false)
    if (response.status != 200) {
      alert(data['error'])
      return
    }
    // レスポンスがない場合は最後のノードの判定リストに追加
    if (data['edges'].length == 0) {
      if (showColumn) {
        setLastNodeColumns((cols) => [...cols, column])
      } else {
        setLastNodeTable(source)
      }
      return
    }
    const mergedNodes = mergeNodes(getNodes(), data['nodes'])
    const mergedEdges = mergeEdges(getEdges(), data['edges'])
    setNodes(mergedNodes)
    setEdges(mergedEdges)

    // updateNodeInternals(id)
    if (setNodesPositioned)
      setTimeout(() => setNodesPositioned(false), 100)
  }, [getNodes, getEdges, showColumn, updateNodeInternals])

  // シングルリネージしてノードを追加する
  const addSingleLineage = useCallback(async (source: string, column: string) => {
    setLoading(true)
    const query = new URLSearchParams({ source, column, depth: '1', show_column: showColumn.toString() })
    const hostName = process.env.NEXT_PUBLIC_API_HOSTNAME || ''
    const response = await fetch(`${hostName}/api/v1/lineage?${query}`)
    const data = await response.json()
    setLoading(false)
    if (response.status != 200) {
      alert(data['error'])
      return
    }
    if (data['edges'].length == 0) {
      if (showColumn) {
        setFirstNodeColumns((cols) => [...cols, column])
      } else {
        setFirstNodeTable(source)
      }
      return
    }
    const mergedNodes = mergeNodes(getNodes(), data['nodes'])
    const mergedEdges = mergeEdges(getEdges(), data['edges'])
    setNodes(mergedNodes)
    setEdges(mergedEdges)
    // updateNodeInternals(id)

    if (setNodesPositioned) {
      setTimeout(() => setNodesPositioned(false), 100)
    }
  }, [getNodes, getEdges, showColumn, updateNodeInternals])

  // ノードを非表示にする
  const hideNode = useCallback(() => {
    const nodeIdsToHide = [id]

    setNodes((nodes) => nodes.filter((node) => !nodeIdsToHide.includes(node.id)))

    setEdges((edges) => edges.filter((edge) =>
      !nodeIdsToHide.includes(edge.source) && !nodeIdsToHide.includes(edge.target)
    ))

    if (setNodesPositioned) {
      setTimeout(() => setNodesPositioned(false), 100)
    }
  }, [id, setNodes, setEdges, setNodesPositioned])

  // 子孫ノードを取得する
  const getDescendantNodes = useCallback((nodeId: string): string[] => {
    const childEdges = getEdges().filter(edge => edge.source === nodeId)
    const childNodeIds = childEdges.map(edge => edge.target)

    const descendantNodeIds = childNodeIds.flatMap(childId => getDescendantNodes(childId))
    return [...childNodeIds, ...descendantNodeIds]
  }, [getEdges])

  // 特定のカラムと関連するエッジを削除
  const hideColumnAndRelatedEdges = useCallback((nodeId: string, columnId: string) => {
    // 対象ノードとその子孫ノードを取得
    const descendantNodeIds = getDescendantNodes(nodeId)
    const affectedNodeIds = [nodeId, ...descendantNodeIds]

    // カラム削除のマッピングを作成
    const columnMappings = new Map<string, Set<string>>()
    columnMappings.set(nodeId, new Set())  // クリックしたノードのカラムは削除しない

    // 全てのエッジを処理してカラムのマッピングを更新
    getEdges().forEach(edge => {
      // エッジの送信元と送信先が影響を受けるノードに含まれているか確認
      if (affectedNodeIds.includes(edge.source) && affectedNodeIds.includes(edge.target)) {
        const sourceColumns = columnMappings.get(edge.source) || new Set()
        const targetColumns = columnMappings.get(edge.target) || new Set()

        // エッジのハンドル（列）を取得
        const sourceColumn = edge.sourceHandle?.split('__')[0] || ''
        const targetColumn = edge.targetHandle?.split('__')[0] || ''

        // 列マッピングの更新条件をチェック
        const isClickedNodeEdge = edge.source === nodeId && sourceColumn === columnId
        const isSourceColumnRemoved = sourceColumns.has(sourceColumn)

        // 条件に合致する場合、送信先の列を更新
        if (isClickedNodeEdge || isSourceColumnRemoved) {
          targetColumns.add(targetColumn)
          columnMappings.set(edge.target, targetColumns)
        }
      }
    })

    setNodes((nodes: Node[]) => {
      // 個々のノードを更新する関数
      const updateNode = (node: Node): Node => {
        // 影響を受けないノードはそのまま返す
        if (!affectedNodeIds.includes(node.id)) {
          return node
        }

        // 削除すべきカラムを取得
        const columnsToRemove = columnMappings.get(node.id) || new Set<string>()
        // 削除すべきカラムを除外した新しいカラムリストを作成
        const updatedColumns = node.data.columns.filter((col: string) => !columnsToRemove.has(col))

        // 更新されたノードを返す
        return {
          ...node,
          data: { ...node.data, columns: updatedColumns }
        }
      }

      // すべてのノードを更新
      const updatedNodes = nodes.map(updateNode)

      // カラムが0個になり、かつクリックされたノードでないノードを除外
      return updatedNodes.filter(node =>
        node.id === nodeId || node.data.columns.length > 0
      )
    })

    // 対象のカラムに関連するエッジを削除
    setEdges(edges => edges.filter(edge => {
      // エッジの送信元と送信先の列マッピングを取得
      const sourceColumns = columnMappings.get(edge.source) || new Set()
      const targetColumns = columnMappings.get(edge.target) || new Set()

      // エッジの送信元と送信先のカラムを取得
      const sourceColumn = edge.sourceHandle?.split('__')[0] || ''
      const targetColumn = edge.targetHandle?.split('__')[0] || ''

      // エッジの送信元または送信先が影響を受けるノードに含まれていない場合、エッジを保持
      const isNotAffectedEdge = !affectedNodeIds.includes(edge.source) || !affectedNodeIds.includes(edge.target)
      // エッジの送信元がクリックされたノードでない、または送信元のカラムが削除対象のカラムでない場合
      const isNotClickedNodeSource = edge.source !== nodeId || sourceColumn !== columnId
      // エッジの送信元・送信先のカラムが削除対象に含まれていない場合
      const isSourceColumnRetained = !sourceColumns.has(sourceColumn)
      const isTargetColumnRetained = !targetColumns.has(targetColumn)

      return isNotAffectedEdge || (isNotClickedNodeSource && isSourceColumnRetained) || isTargetColumnRetained
    }))

    if (setNodesPositioned) {
      setTimeout(() => setNodesPositioned(false), 100)
    }
  }, [showColumn, setNodes, setEdges, getDescendantNodes, getEdges, setNodesPositioned])

  return {
    addReverseLineage,
    addSingleLineage,
    hideNode,
    getDescendantNodes,
    hideColumnAndRelatedEdges,
    lastNodeColumns,
    lastNodeTable,
    firstNodeColumns,
    firstNodeTable
  }
}