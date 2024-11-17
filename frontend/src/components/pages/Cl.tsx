'use client'
import { useSearchParams } from 'next/navigation'
import { TableNode, TableNodeProps } from '@/components/molecules/TableNode'
import { useGetWindowSize } from '@/hooks/useGetWindowSize'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Connection,
  Controls,
  EdgeChange,
  NodeChange,
  Panel,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { Sidebar } from '@/components/organisms/Sidebar'
import { Header } from '@/components/organisms/Header'
import { useStore as useStoreZustand } from '@/store/zustand'
import ToggleButtons from '@/components/ui/ToggleButtons'
import { getColorClassForMaterialized, materializedTypes } from '@/lib/utils'
import { DashboardNode, DashboardNodeProps } from '@/components/molecules/DashboardNode'

interface QueryParams {
  dashboardId?: string
  sources: string[]
  columns: {[source: string]: string[]}
  showColumn: boolean
  depth: Number
}

export const Cl = () => {
  const { height: windowHeight, width: windowWidth } = useGetWindowSize()

  const [nodes, setNodes] = useNodesState([])
  const [edges, setEdges] = useEdgesState([])
  const [viewIsFit, setViewIsFit] = useState(false)
  const [nodesPositioned, setNodesPositioned] = useState(true)

  const setMessage = useStoreZustand((state) => state.setMessage)
  const sidebarActive = useStoreZustand((state) => state.sidebarActive)
  const options = useStoreZustand((state) => state.options)
  const setOptions = useStoreZustand((state) => state.setOptions)
  const clearNodePosition = useStoreZustand((state) => state.clearNodePosition)
  const setClearNodePosition = useStoreZustand((state) => state.setClearNodePosition)
  const leftMaxDepth = useStoreZustand((state) => state.leftMaxDepth)
  const setLeftMaxDepth = useStoreZustand((state) => state.setLeftMaxDepth)
  const rightMaxDepth = useStoreZustand((state) => state.rightMaxDepth)
  const setRightMaxDepth = useStoreZustand((state) => state.setRightMaxDepth)
  const showColumn = useStoreZustand((state) => state.showColumn)
  const setShowColumn = useStoreZustand((state) => state.setShowColumn)

  const searchParams = useSearchParams()

  const handleFetchData = useCallback(async ({ dashboardId, sources, columns, showColumn, depth }: QueryParams) => {
    setNodes([])
    setEdges([])
    // undefined が入っている場合は false に変換
    setShowColumn(Boolean(showColumn))

    const hostName = process.env.NEXT_PUBLIC_API_HOSTNAME || ''
    let response

    if (dashboardId) {
      const query = new URLSearchParams({ dashboard_id: dashboardId, depth: '1' })
      response = await fetch(`${hostName}/api/v1/dashboard_lineage?${query}`)
    } else {
      const query = new URLSearchParams({
        sources: sources.join(','),
        columns: JSON.stringify(columns),
        show_column: showColumn.toString()
      })
      // depthの指定がない場合
      if (Number.isNaN(depth)) {
        if (showColumn) {
          query.append('depth', '-1')
        } else {
          // テーブルモードの場合は広がり過ぎるのでdepthを1にする
          query.append('depth', '1')
        }
      } else {
        query.set('depth', depth.toString())
      }
      response = await fetch(`${hostName}/api/v1/lineage?${query}`)
    }
    const data = await response.json()
    if (response.status != 200) {
      setMessage(data['detail'], 'error')
      setTimeout(() => setMessage(null, null), 3000) // Clear message after 3 seconds
      return false
    }
    setNodes(data['nodes'])
    setEdges(data['edges'])

    setNodesPositioned(false)
    return true
  }, [searchParams])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes],
  )
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges],
  )
  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  )

  const nodeTypes = useMemo(() => ({
    tableNode: (props: TableNodeProps) => <TableNode {...props} />,
    dashboardNode: (props: DashboardNodeProps) => <DashboardNode {...props} />
  }), [])

  // 外部から setRefreshNodesPosition が呼ばれた場合
  useEffect(() => {
    if (clearNodePosition) {
      // console.log('clearNodePosition')
      setClearNodePosition(false)
      setTimeout(()=>setNodesPositioned(false), 100)
    }
  }, [clearNodePosition])

  useEffect(() => {
    setNodesPositioned(false)
  }, [sidebarActive])

  useEffect(() => {
    setOptions({ rankdir: 'RL' })
  }, [])

  return (
    <div>
      <Header handleFetchData={handleFetchData} />
      <div className="flex flex-wrap">
        <ReactFlowProvider>
          <div className={sidebarActive ? "w-5/6" : "w-[calc(100%-20px)]"} style={{ height: windowHeight - 55 }}>
            <ReactFlow
              minZoom={0.2}
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
            >
              <Panel position="top-left">
                <div className="flex flex-col space-y-4">
                  <ToggleButtons />
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center">
                      <input
                        id="leftMaxDepth"
                        type="checkbox"
                        checked={leftMaxDepth}
                        onChange={() => setLeftMaxDepth(!leftMaxDepth)}
                        className="form-checkbox h-4 w-4 text-blue-600 rounded"
                      />
                      <label htmlFor="leftMaxDepth" className="ml-2 text-sm text-gray-700">
                        Max depth for left (+) button
                      </label>
                    </div>
                    {!showColumn && (
                      <div className="flex items-center">
                        <input
                          id="rightMaxDepth"
                          type="checkbox"
                          checked={rightMaxDepth}
                          onChange={() => setRightMaxDepth(!rightMaxDepth)}
                          className="form-checkbox h-4 w-4 text-blue-600 rounded"
                        />
                        <label htmlFor="rightMaxDepth" className="ml-2 text-sm text-gray-700">
                          Max depth for right (+) button
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
              <Panel position="top-right">
                { nodes.length > 0 && <div className="p-1 rounded">
                  <div className="flex items-center space-x-2">
                    {materializedTypes.map((type) => (
                      <div key={type} className="flex items-center">
                        <div
                          className={`w-4 h-4 mr-1 rounded-sm ${getColorClassForMaterialized(type)}`}
                        ></div>
                        <span className="text-[10px] whitespace-nowrap text-gray-700">{type}</span>
                      </div>
                    ))}
                  </div>
                </div>
                }
              </Panel>
              <Controls />
              <Background style={{ backgroundColor: '#f5f5f5' }} />
            </ReactFlow>
          </div>
          <Sidebar setNodes={setNodes} setEdges={setEdges} setViewIsFit={setViewIsFit}
                   setNodesPositioned={setNodesPositioned} nodesPositioned={nodesPositioned} />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
