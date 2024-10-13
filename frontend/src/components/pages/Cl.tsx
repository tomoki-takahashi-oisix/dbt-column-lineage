'use client'
import { useSearchParams } from 'next/navigation'
import { EventNode, EventNodeProps } from '@/components/molecules/EventNode'
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
import { AlertTriangle, Check, Info } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface QueryParams {
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
  const message = useStoreZustand((state) => state.message)
  const messageType = useStoreZustand((state) => state.messageType)

  const searchParams = useSearchParams()

  const handleFetchData = useCallback(async ({ sources, columns, showColumn, depth }: QueryParams) => {
    setNodes([])
    setEdges([])
    setShowColumn(showColumn)

    const query = new URLSearchParams({sources:sources.join(','), columns: JSON.stringify(columns), show_column: showColumn.toString()})
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
    const hostName = process.env.NEXT_PUBLIC_API_HOSTNAME || ''
    const response = await fetch(`${hostName}/api/v1/lineage?${query}`)
    const data = await response.json()
    if (response.status != 200) {
      alert(data['error'])
      return false
    }
    setNodes(data['nodes'])
    setEdges(data['edges'])

    setNodesPositioned(false)
    return true
  }, [searchParams])

  const changeRankDir = useCallback(async (value: string) => {
    setOptions({ rankdir: value })
    setNodesPositioned(false)
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

  const getMessageIcon = (type: string | null) => {
    switch (type) {
      case 'success':
        return <Check className="inline-block mr-2" size={20} />
      case 'error':
        return <AlertTriangle className="inline-block mr-2" size={20} />
      default:
        return <Info className="inline-block mr-2" size={20} />
    }
  }

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

  const nodeTypes = useMemo(() => ({
    eventNode: (props: EventNodeProps) => <EventNode {...props} />
  }), [])

  return (
    <div>
      <Header handleFetchData={handleFetchData} />
      <div className="flex flex-wrap">
        <ReactFlowProvider>
          <div className={sidebarActive ? "w-5/6" : "w-[calc(100%-20px)]"} style={{ height: windowHeight - 55 }}>
            <ReactFlow
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
              <Controls />
              <Background style={{ backgroundColor: '#f5f5f5' }} />
            </ReactFlow>
          </div>
          <Sidebar setNodes={setNodes} setEdges={setEdges} setViewIsFit={setViewIsFit}
                   setNodesPositioned={setNodesPositioned} nodesPositioned={nodesPositioned} />
        </ReactFlowProvider>
      </div>
      {message && (
        <div
          className={`absolute top-4 right-4 px-4 py-3 rounded shadow-md z-50 flex items-center ${
            messageType === 'success' ? 'bg-green-100 border-green-400 text-green-700' :
              messageType === 'error' ? 'bg-red-100 border-red-400 text-red-700' :
                'bg-blue-100 border-blue-400 text-blue-700'
          }`}
          role="alert"
        >
          {getMessageIcon(messageType)}
          <div className="sm:inline text-xs max-w-xl">
            <Markdown className="markdown" remarkPlugins={[remarkGfm]}>{message}</Markdown>
          </div>
        </div>
      )}

    </div>
  )
}
