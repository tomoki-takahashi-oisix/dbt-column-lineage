'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useGetWindowSize } from '@/hooks/useGetWindowSize'
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import ReactFlow, {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Connection,
  Controls, Edge,
  EdgeChange,
  Node,
  NodeChange,
  Panel,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState, useReactFlow,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { Header } from '@/components/organisms/Header'
import { useStore as useStoreZustand } from '@/store/zustand'
import CodeMirror, { Decoration, EditorView, ReactCodeMirrorRef, StateEffect, StateField } from '@uiw/react-codemirror'
import { SearchCursor } from '@codemirror/search'
import { sql } from '@codemirror/lang-sql'
import dagre from 'dagre'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const highlightEffect = StateEffect.define()
const highlightExtension = StateField.define({
  create() { return Decoration.none },
  update(value, transaction) {
    value = value.map(transaction.changes)

    for (let effect of transaction.effects) {
      if (effect.is(highlightEffect)) value = value.update({add: effect.value, sort: true} as any)
    }
    return value
  },
  provide: f => EditorView.decorations.from(f)
})

const nodeWidth = 150
const nodeHeight = 40

const getLayoutedElements = (nodes: Node[], edges: Edge[], rankdir: string) => {
  console.log(`rankdir=${rankdir}, layouting...`)
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: rankdir })

  edges.forEach((edge) => g.setEdge(edge.source, edge.target))
  nodes.forEach((node) => g.setNode(node.id, {
    label: node.id,
    width: nodeWidth,
    height: nodeHeight,
  }))

  dagre.layout(g)

  nodes.forEach((node) => {
    const nodeWithPosition = g.node(node.id)
    switch (rankdir) {
      case 'TB':
        node.targetPosition = Position.Top
        node.sourcePosition = Position.Bottom
        break;
      case 'BT':
        node.targetPosition = Position.Bottom
        node.sourcePosition = Position.Top
        break;
      case 'LR':
        node.targetPosition = Position.Left
        node.sourcePosition = Position.Right
        break;
      case 'RL':
        node.targetPosition = Position.Right
        node.sourcePosition = Position.Left
        break;
    }
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    }

    return node
  })
  return {nodes, edges}
}

const Columns = ({columns}: any) => {
  return (
    <table className="table-auto text-xs w-full">
      <thead className="sticky top-0 z-10">
      <tr className="bg-gray-200">
        <th className="border">Column</th>
        <th className="border">Type</th>
        <th className="border">Description</th>
      </tr>
      </thead>
      <tbody>
      {Object.keys(columns).map((key: string, index: number) =>
        <tr key={index}>
          <td className="border">{columns[key]['name'].toLowerCase()}</td>
          <td className="border">{columns[key]['type']}</td>
          <td className="border">{columns[key]['comment']}</td>
        </tr>
      )}
      </tbody>
    </table>
  )
}

interface CteFlowProps {
  nodes: Node[]
  edges: Edge[]
  setNodes: Function
  setEdges: Function
  nodesPositioned: boolean
  setNodesPositioned: Function
  codeMirrorRef: React.RefObject<ReactCodeMirrorRef>
  setMode: Function
  lineageTableColumns: { [key: string]: any }
}

function searchTextCodeMirror(view: EditorView, searchQuery: string) {
  const cursor = new SearchCursor(view.state.doc, searchQuery)
  cursor.next()
  if (cursor.value.from == 0) {
    return null
  }
  return cursor.value
}

const CteFlow = ({ nodes, edges, setNodes, setEdges, nodesPositioned, setNodesPositioned, codeMirrorRef, setMode, lineageTableColumns}: CteFlowProps) => {
  const isFirstRender = useRef(true)
  const { fitView } = useReactFlow()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [viewIsFit, setViewIsFit] = useState(false)
  const [hidden, setHidden] = useState(false)

  const options = useStoreZustand((state) => state.options)
  const setOptions = useStoreZustand((state) => state.setOptions)

  const changeRankDir = useCallback(async (rankdir: string) =>  {
    setOptions({rankdir: rankdir})
    setNodesPositioned(false)
    // await handleFetchData({source: searchParams.get('source') as string})
  }, [searchParams])

  const goToCtePage = useCallback((schema: string, source: string, column: string) => {
    const query = new URLSearchParams({ schema, source})
    if (column) {
      // null の場合がある
      query.set('column', column)
    }
    router.push(`/cte?${query.toString()}`)
  }, [searchParams])

  const codeJump = useCallback((node: Node) => {
    setMode('query')
    if (codeMirrorRef.current == null || codeMirrorRef.current.view == null) {
      return
    }
    if (node.data.db != null) {

      goToCtePage(node.data.db, node.data.table, node.data.column)
      return
    }
    const view: EditorView = codeMirrorRef.current.view
    const searchQuery = `${node.data.label} as (`
    const cursorValue = searchTextCodeMirror(view, searchQuery)
    if (!cursorValue) return
    view?.dispatch({
      selection: { head: cursorValue.from, anchor: cursorValue.to },
      scrollIntoView: true,
      effects: EditorView.scrollIntoView(cursorValue.from, { x: 'start', y: 'start' })
    })
  }, [searchParams])

  const hide = useCallback((hidden: boolean) => (nodeOrEdge: any) => {
    if (nodeOrEdge.type === 'input' || nodeOrEdge.has_db) {
      nodeOrEdge.hidden = hidden
    }
    return nodeOrEdge
  }, [])

  const toggleHidden = useCallback((checked: boolean) => {
    setHidden(checked)
    console.log(`hidden=${checked}`)
    setNodesPositioned(false)
  }, [])

  const changeLayout = useCallback(() => {
    if (nodes.length == 0 || nodesPositioned) {
      return
    }
    console.log(`nodes.length == ${nodes.length}, nodesPositioned=${nodesPositioned}`)
    const layouted = getLayoutedElements(nodes, edges, options.rankdir)
    setNodes([...layouted.nodes].map(hide(hidden)))
    setEdges([...layouted.edges].map(hide(hidden)))

    window.requestAnimationFrame(() => {
      setTimeout(() => fitView(), 0)
    })
    setViewIsFit(true)
    setNodesPositioned(true)
  }, [nodesPositioned])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nds: Node[]) => applyNodeChanges(changes, nds)),
    [setNodes],
  )
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds: Edge[]) => applyEdgeChanges(changes, eds)),
    [setEdges],
  )
  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds: Edge[]) => addEdge(connection, eds)),
    [setEdges],
  )

  useEffect(() => {
    if (nodes.length == 0 || nodesPositioned) {
      return
    }
    if (codeMirrorRef.current == null || codeMirrorRef.current.view == null) {
      return
    }
    // console.log(nodesPositioned, nodes.length)

    const highlightDecorationRanges = []
    const highlightDecoration = Decoration.mark({
      class: 'bg-yellow-200'
    })
    console.log(lineageTableColumns)
    for (const table in lineageTableColumns) {
      const meta = lineageTableColumns[table]
      for (const column of meta['columns'] as string[]) {
        // table_alias.column のハイライト
        const searchQuery = `${meta['alias']}.${column}` || ''
        const cursorValue = searchTextCodeMirror(codeMirrorRef.current.view, searchQuery)
        if (!cursorValue) continue

        highlightDecorationRanges.push(highlightDecoration.range(cursorValue.from, cursorValue.to))
      }
      // db.table のハイライト
      const searchQuery = `${meta['db']}.${table}` || ''
      const cursorValue = searchTextCodeMirror(codeMirrorRef.current.view, searchQuery)
      if (!cursorValue) continue

      highlightDecorationRanges.push(highlightDecoration.range(cursorValue.from, cursorValue.to))
    }
    console.log(highlightDecorationRanges)
    codeMirrorRef.current.view.dispatch({
      effects: highlightEffect.of(highlightDecorationRanges as any)
    })
  }, [nodesPositioned, codeMirrorRef.current])

  useEffect(() => {
    if(isFirstRender.current) return
    changeLayout()
  }, [nodesPositioned])

  useEffect(() => {
    setOptions({rankdir: 'TB'})
    isFirstRender.current = false
  }, [])

  return (
    <Suspense>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(event, node) => codeJump(node)}
      >
        <Panel position="top-right">
          <div>
            <select value={options.rankdir} onChange={e => changeRankDir(e.target.value)}>
              <option value="LR">Left - Right</option>
              <option value="RL">Right - Left</option>
              <option value="TB">Top - Bottom</option>
              <option value="BT">Bottom - Top</option>
            </select>
          </div>
          <div>
            <label htmlFor="ishidden">
              <input id="ishidden" type="checkbox" checked={hidden} onChange={(event) => toggleHidden(event.target.checked)} />
              Hide source table
            </label>
          </div>

        </Panel>
        <Controls />
        <Background style={{ backgroundColor: '#f5f5f5' }} />
      </ReactFlow>
    </Suspense>
  )
}
export const Cte = () => {
  const { height: windowHeight, width: windowWidth } = useGetWindowSize()
  const [nodes, setNodes] = useNodesState([])
  const [edges, setEdges] = useEdgesState([])
  const [nodesPositioned, setNodesPositioned] = useState(true)
  const codeMirrorRef = useRef<ReactCodeMirrorRef>(null)
  const [mode, setMode] = useState<string>('query')
  const [tableName, setTableName] = useState<string>('')
  const [materialized, setMaterialized] = useState<string>('')
  const [query, setQuery] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [columns, setColumns] = useState<any[]>([])
  const [lineageTableColumns, setLineageTableColumns] = useState({})

  const router = useRouter()

  const handleFetchData = useCallback(async ({source, column}: {source: string, column: string}) => {
    if (nodes.length != 0) {
      setNodes([])
      setEdges([])
      // await new Promise(resolve => setTimeout(resolve, 1000))
    }
    const query = new URLSearchParams({source, column})
    const hostName = process.env.NEXT_PUBLIC_API_HOSTNAME || ''
    const response = await fetch(`${hostName}/api/v1/cte?${query}`)
    const data = await response.json()
    if (response.status != 200) {
      alert(data['error'])
      router.back()
      return false
    }
    console.log(data)
    setNodes(data['nodes'])
    setEdges(data['edges'])

    setTableName(data['table_name'])
    setMaterialized(data['materialized'])
    setQuery(data['query'])
    setDescription(data['description'])
    setColumns(data['columns'])
    setLineageTableColumns(data['lineage_table_columns'])
    setNodesPositioned(false)
    return true
  }, [router])

  return (
    <div>
      <Header handleFetchData={handleFetchData} />
      <div className="flex flex-wrap">
        <div className="w-1/2">
          <h4 className="px-1 text-2xl font-bold">
            <span>{tableName}</span>
            <small className="ms-2 font-semibold text-gray-500 dark:text-gray-400">{materialized}</small>
          </h4>

          <div className="mx-2">
            <button className={'px-1 ' + (mode == 'description' && 'font-semibold')}
                    onClick={() => setMode('description')}>Description
            </button>
            <button className={'px-1 ' + (mode == 'columns' && 'font-semibold')}
                    onClick={() => setMode('columns')}>Columns
            </button>
            <button className={'px-1 ' + (mode == 'query' && 'font-semibold')} onClick={() => setMode('query')}>Query
            </button>
          </div>
          <div className="px-2" style={{ height: windowHeight * 0.85, overflowY: 'auto' }}>
            {mode == 'description' &&
              <Markdown className="markdown" remarkPlugins={[remarkGfm]}>{description}</Markdown>}
            {mode == 'columns' && <Columns columns={columns}></Columns>}
            {mode == 'query' &&
              <CodeMirror ref={codeMirrorRef} value={query} extensions={[sql(), highlightExtension]} />}
          </div>
        </div>
        {/* 一番上のプルダウン一覧の分が55px*/}
        <div className="w-1/2" style={{ height: windowHeight - 55 }}>
          <ReactFlowProvider>
            <CteFlow
              nodes={nodes}
              edges={edges}
              setNodes={setNodes}
              setEdges={setEdges}
              codeMirrorRef={codeMirrorRef}
              nodesPositioned={nodesPositioned}
              setNodesPositioned={setNodesPositioned}
              setMode={setMode}
              lineageTableColumns={lineageTableColumns}
            >
            </CteFlow>
          </ReactFlowProvider>
        </div>
      </div>
    </div>
  )
}
