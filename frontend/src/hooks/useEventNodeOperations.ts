import { useCallback, useState } from 'react'
import { Node, Edge, useReactFlow, useUpdateNodeInternals, getConnectedEdges } from 'reactflow'
import { useStore as useStoreZustand } from '@/store/zustand'

export const useEventNodeOperations = (id: string) => {
  const { getNodes, setNodes, getEdges, setEdges } = useReactFlow()
  const updateNodeInternals = useUpdateNodeInternals()

  const [lastNodeColumns, setLastNodeColumns] = useState<string[]>([])
  const [firstNodeColumns, setFirstNodeColumns] = useState<string[]>([])
  const [lastNodeTable, setLastNodeTable] = useState<string>()
  const [firstNodeTable, setFirstNodeTable] = useState<string>()

  const setLoading = useStoreZustand((state) => state.setLoading)
  const showColumn = useStoreZustand((state) => state.showColumn)
  const setClearNodePosition = useStoreZustand((state) => state.setClearNodePosition)
  const leftMaxDepth = useStoreZustand((state) => state.leftMaxDepth)
  const rightMaxDepth = useStoreZustand((state) => state.rightMaxDepth)

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
    const columns = JSON.stringify({ [source]: [column] })
    const query = new URLSearchParams({sources:source, columns, depth: '1', show_column: showColumn.toString(), reverse: 'true'})
    if (rightMaxDepth) {
      query.set('depth', '-1')
    } else {
      query.set('depth', '1')
    }
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

    setClearNodePosition(true)
  }, [getNodes, getEdges, showColumn, rightMaxDepth])

  // シングルリネージしてノードを追加する
  const addSingleLineage = useCallback(async (source: string, column: string) => {
    setLoading(true)
    const columns = JSON.stringify({ [source]: [column] })
    const query = new URLSearchParams({ sources:source, columns, depth: '1', show_column: showColumn.toString() })
    if (leftMaxDepth) {
      query.set('depth', '-1')
    } else {
      query.set('depth', '1')
    }
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

    setClearNodePosition(true)
  }, [getNodes, getEdges, showColumn, updateNodeInternals, leftMaxDepth])

  // ノードを非表示にする
  const hideNode = useCallback(() => {
    const nodeIdsToHide = [id]

    setNodes((nodes) => nodes.filter((node) => !nodeIdsToHide.includes(node.id)))

    setEdges((edges) => edges.filter((edge) =>
      !nodeIdsToHide.includes(edge.source) && !nodeIdsToHide.includes(edge.target)
    ))

    setClearNodePosition(true)
  }, [id, setNodes, setEdges])

  // targetに複数のエッジを持つノードを取得
  const identifyNodesWithMultipleConnections = useCallback((edges: Edge[]): string[] => {
    // sourceごとのtargetHandleの出現回数を追跡するオブジェクト
    const targetTargetHandleCounts: Record<string, Record<string, number>> = {}

    // すべてのエッジをループしてtargetHandleの出現回数をカウント
    edges.forEach(edge => {
      if (!targetTargetHandleCounts[edge.target]) {
        targetTargetHandleCounts[edge.target] = {}
      }
      if (edge.targetHandle) {
        targetTargetHandleCounts[edge.target][edge.targetHandle] =
          (targetTargetHandleCounts[edge.target][edge.targetHandle] || 0) + 1
      }
    })

    // 重複するtargetHandleを持つsourceを抽出
    return Object.entries(targetTargetHandleCounts)
      .filter(([_, targetHandleCounts]) =>
        Object.values(targetHandleCounts).some(count => count >= 2)
      )
      .map(([target]) => target)
  }, [])

  // 子孫ノードを取得する
  const getDescendantNodes = useCallback((nodeId: string, edges: Edge[]): string[] => {
    const childEdges = edges.filter(edge => edge.source === nodeId)
    const childNodeIds = childEdges.map(edge => edge.target)
    const nodesWithMultipleConnections =  identifyNodesWithMultipleConnections(edges)

    const newChildNodeIds = childNodeIds.filter(childId => {
      // 複数のエッジを持つノードはその子孫ノードを取得しない
      return (!nodesWithMultipleConnections.includes(childId))
    })

    const descendantNodeIds = newChildNodeIds.flatMap(childId => getDescendantNodes(childId, edges))
    return [...newChildNodeIds, ...descendantNodeIds]
  }, [getEdges])

  // 特定のカラムと関連するエッジを削除
  const hideColumnAndRelatedEdges = useCallback((nodeId: string, columnId: string) => {
    // 対象ノードとその子孫ノードを取得
    const descendantNodeIds = getDescendantNodes(nodeId, getEdges())
    const affectedNodeIds = [nodeId, ...descendantNodeIds]

    // 削除対象のカラムのマッピング情報(送信元ID -> 送信先IDのセット)
    const columnMappings = new Map<string, Set<string>>()
    const fixedEdges = new Set()

    getEdges().forEach((edge: any) => {
      if (edge.fixed) {
        fixedEdges.add(edge.target)
      }
      // エッジの送信元と送信先が削除対象ノードに含まれている場合
      if (affectedNodeIds.includes(edge.source) && affectedNodeIds.includes(edge.target)) {
        const sourceColumns = columnMappings.get(edge.source) || new Set()
        const targetColumns = columnMappings.get(edge.target) || new Set()

        // エッジのハンドル（列）を取得
        const sourceColumn = edge.sourceHandle?.split('__')[0] || ''
        const targetColumn = edge.targetHandle?.split('__')[0] || ''

        // クリックしたノードを起点とするエッジは削除対象とする
        const isClickedNodeEdge = edge.source === nodeId && sourceColumn === columnId
        // 既に削除対象となっている列からのエッジの場合
        const isSourceColumnRemoved = sourceColumns.has(sourceColumn)

        if (isClickedNodeEdge || isSourceColumnRemoved) {
          // 送信先の列を削除対象に追加し、マッピング情報を更新
          targetColumns.add(targetColumn)
          columnMappings.set(edge.target, targetColumns)
        }
      }
    })

    setNodes((nodes: Node[]) => {
      // 個々のノードを更新する関数
      return nodes.map(node => {
        // 削除対象以外のノードはなにもしない
        if (!affectedNodeIds.includes(node.id)) {
          return node
        }
        const columnsToRemove = columnMappings.get(node.id) || new Set<string>()
        //  削除すべきカラムを除外したカラムリストを取得
        const updatedColumns = node.data.columns.filter((col: string) => !columnsToRemove.has(col))

        // 更新されたノード情報を返す
        return {
          ...node,
          data: { ...node.data, columns: updatedColumns }
        }
      }).filter(node =>
        // クリックされたノード、またはカラムが1つ以上ある、または固定されたエッジを持つノードのみを残す
        node.id === nodeId || node.data.columns.length > 0 || fixedEdges.has(node.id)
      )
    })

    // 対象のカラムに関連するエッジを削除
    setEdges(edges => {
      // 生きているエッジのみを取得
      const connectedEdges = getConnectedEdges(getNodes(), edges)
      // クリックしたノードを起点とするエッジは除外
      return connectedEdges
          .filter(edge => edge.source != nodeId || edge.sourceHandle?.split('__')[0] != columnId)
    })

    setClearNodePosition(true)
  }, [showColumn, setNodes, setEdges, getDescendantNodes, getNodes, getEdges])

  // テーブルと関連するエッジを削除
  const hideTableAndRelatedEdges = useCallback((nodeId: string) => {
    const nodesToDelete = getDescendantNodes(nodeId, getEdges())

    setNodes(nodes => nodes.filter(n => !nodesToDelete.includes(n.id)))
    setEdges(edges => {
        const connectedEdges = getConnectedEdges(getNodes(), edges)
        return connectedEdges.filter(edge =>
          edge.source != id &&
          !nodesToDelete.includes(edge.source))
      }
    )
    setClearNodePosition(true)
  }, [getDescendantNodes, getNodes, getEdges])

  return {
    addReverseLineage,
    addSingleLineage,
    hideNode,
    getDescendantNodes,
    hideColumnAndRelatedEdges,
    hideTableAndRelatedEdges,
    lastNodeColumns,
    lastNodeTable,
    firstNodeColumns,
    firstNodeTable
  }
}