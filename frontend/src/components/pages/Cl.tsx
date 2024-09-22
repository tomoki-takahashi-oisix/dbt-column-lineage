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

// TODO: 一旦ここに書いてあるが、この部分がPluginごとに異なる部分になる想定
export type NodeDataType = {
  name: string
  color: string
  schema: string
  materialized: string
  columns: string[]
  first: boolean
  last: boolean
}

interface QueryParams {
  sources: string[]
  columns: {[source: string]: string[]}
  showColumn: string
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

  const searchParams = useSearchParams()

  const handleFetchData = useCallback(async ({ sources, columns, showColumn }: QueryParams) => {
    setNodes([])
    setEdges([])

    const query = new URLSearchParams({sources:sources.join(','), columns: JSON.stringify(columns), show_column: showColumn})
    // テーブルモードの場合は広がり過ぎるのでdepthを1にする
    if (showColumn) {
      query.append('depth', '-1')
    } else {
      query.append('depth', '1')
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

  const nodeTypes = useMemo(
    () => ({
      eventNode: (props: EventNodeProps) => <EventNode {...props} />
    }),
    [],
  )
  return (
    // 一番上のプルダウン一覧の分が55px
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
              {/*<select value={options.rankdir} onChange={e => changeRankDir(e.target.value)}>*/}
              {/*  <option value="LR">Left - Right</option>*/}
              {/*  <option value="RL">Right - Left</option>*/}
              {/*</select>*/}
              <div className="App">
                <ToggleButtons />
              </div>
              <div className="flex items-center">
                <input
                  id="leftMaxDepth"
                  type="checkbox"
                  checked={leftMaxDepth}
                  onChange={() => setLeftMaxDepth(!leftMaxDepth)}
                  className="form-checkbox h-5 w-5 text-blue-600 rounded"
                />
                <label htmlFor="leftMaxDepth">
                <span className="ml-2 text-gray-700">
                  max depth for left (+) button
                </span>
                </label>
              </div>
              {showColumn != true &&
              <div className="flex items-center">
                <input
                  id="rightMaxDepth"
                  type="checkbox"
                  checked={rightMaxDepth}
                  onChange={() => setRightMaxDepth(!rightMaxDepth)}
                  className="form-checkbox h-5 w-5 text-blue-600 rounded"
                />
                <label htmlFor="rightMaxDepth">
                <span className="ml-2 text-gray-700">
                  max depth for right (+) button
                </span>
                </label>
              </div>}
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
