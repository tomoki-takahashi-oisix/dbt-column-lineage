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
  Node,
  NodeChange,
  Panel,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { Sidebar } from '@/components/organisms/Sidebar'
import { Header } from '@/components/organisms/Header'
import { useStore as useStoreZustand } from '@/store/zustand'

// TODO: 一旦ここに書いてあるが、この部分がPluginごとに異なる部分になる想定
export type NodeDataType = {
  label: string
  name: string
  color: string
  schema: string
  columns: string[]
  first: boolean
  last: boolean
  opened?: string[]
  forceToolbarVisible?: boolean
  toolbarPosition?: Position
}

export const Cl = () => {
  const { height: windowHeight, width: windowWidth } = useGetWindowSize()
  const [nodes, setNodes] = useNodesState([])
  const [baseNodes, setBaseNodes] = useNodesState([])
  const [edges, setEdges] = useEdgesState([])
  const [viewIsFit, setViewIsFit] = useState(false)
  const [nodesPositioned, setNodesPositioned] = useState(true)

  const sidebarActive = useStoreZustand((state) => state.sidebarActive)
  const options = useStoreZustand((state) => state.options)
  const setOptions = useStoreZustand((state) => state.setOptions)
  const searchParams = useSearchParams()

  const handleFetchData = useCallback(async ({ source, column, m }: { source: string, column: string, m: string }) => {
    if (nodes.length != 0) {
      setNodes([])
      setEdges([])
      // await new Promise(resolve => setTimeout(resolve, 1000))
    }

    const query = new URLSearchParams({source, column})
    const hostName = process.env.NEXT_PUBLIC_API_HOSTNAME || ''
    const response = await fetch(`${hostName}/api/v1/lineage?${query}`)
    const data = await response.json()
    if (response.status != 200) {
      alert(data['error'])
      return false
    }
    if (m == 'a') {
      // TODO マージ方法検討
      const n = [...baseNodes, ...data['nodes'].filter((node: Node) => node.data.name != source)]
      const e = [...edges, ...data['edges']]
      setNodes(n)
      setEdges(e)
      setBaseNodes(n)
    } else {
      setNodes(data['nodes'])
      setEdges(data['edges'])
      setBaseNodes(data['nodes'])
    }
    setNodesPositioned(false)
    return true
  }, [searchParams])

  const addReverseLineage = useCallback(async({ updateNodeInternals, props, id, source, column }: {updateNodeInternals: Function, props:any, id:string, source: string, column: string} ) => {
    const merged = new Set()
    setNodes((nds: Node[]) => nds.map((node: Node) => {
      // open target node column
      if (node.data.name == source) {
        const opened = node.data.opened || []
        opened.push(column)
        node.data = { ...node.data, opened, }
      }
      // merge target node columns
      const foundNode = props['nodes'].find((n: Node) => n.data.name == node.data.name)
      if (foundNode) {
        const columnsSet = new Set(node.data.columns)
        for (const c of foundNode.data.columns) {
          columnsSet.add(c)
        }
        node.data.columns = Array.from(columnsSet)
        merged.add(node.data.name)
      }
      return node
    }))
    updateNodeInternals(id)

    for (const n of props['nodes']) {
      if (merged.has(n.data.name)) continue
      setNodes((nds) => nds.concat(n))
    }
    for (const e of props['edges']) {
      setEdges((eds) => addEdge(e, eds))
    }
    setTimeout(() => setNodesPositioned(false), 100)
  }, [nodes, edges])

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

  useEffect(() => {
    setNodesPositioned(false)
  }, [sidebarActive])

  useEffect(() => {
    setOptions({ rankdir: 'RL' })
  }, [])

  const nodeTypes = useMemo(
    () => ({
      eventNode: (props: EventNodeProps) => <EventNode addReverseLineage={addReverseLineage} {...props} />
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
              <select value={options.rankdir} onChange={e => changeRankDir(e.target.value)}>
                <option value="LR">Left - Right</option>
                <option value="RL">Right - Left</option>
              </select>
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
