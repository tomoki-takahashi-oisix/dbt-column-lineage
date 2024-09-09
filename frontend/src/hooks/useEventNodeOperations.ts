import { useCallback, useState } from 'react'
import { Node, Edge, useReactFlow, useUpdateNodeInternals } from 'reactflow'
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

    updateNodeInternals(id)
    if (setNodesPositioned)
      setTimeout(() => setNodesPositioned(false), 100)
  }, [getNodes, getEdges, showColumn])

  // シングルリネージしてノードを追加する
  const addSingleLineage = useCallback(async (source: string, column:string) => {
    setLoading(true)
    const query = new URLSearchParams({source, column, depth: '1', show_column: showColumn.toString()})
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
    updateNodeInternals(id)

    if (setNodesPositioned)
      setTimeout(() => setNodesPositioned(false), 100)
  }, [getNodes, getEdges, showColumn])

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

  // 子孫ノードを取得する(column用)
  const getDescendantNodes = useCallback((nodeId: string, columnId: string): string[] => {
    let childEdges: Edge[] = []
    if (showColumn) {
      childEdges = getEdges().filter(
        edge => edge.source === nodeId && edge.sourceHandle === `${columnId}__source`
      )
    } else {
      childEdges = getEdges().filter(
        edge => edge.source === nodeId
      )
    }

    const childNodeIds = childEdges.map(edge => edge.target)
    const descendantNodeIds = childNodeIds.flatMap(
      childId => getDescendantNodes(childId, columnId)
    )
    return [...childNodeIds, ...descendantNodeIds]
  }, [getEdges])

  return {
    addReverseLineage,
    addSingleLineage,
    hideNode,
    getDescendantNodes,
    lastNodeColumns,
    lastNodeTable,
    firstNodeColumns,
    firstNodeTable
  }
}