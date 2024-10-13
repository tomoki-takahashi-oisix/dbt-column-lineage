'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useGetWindowSize } from '@/hooks/useGetWindowSize'
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, { addEdge, applyEdgeChanges, applyNodeChanges, Background, Connection, Controls,
  Edge, EdgeChange, Node, NodeChange, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow
} from 'reactflow'
import 'reactflow/dist/style.css'

import { Header } from '@/components/organisms/Header'
import { useStore as useStoreZustand } from '@/store/zustand'
import CodeMirror, { Decoration, EditorView, ReactCodeMirrorRef, StateEffect, StateField } from '@uiw/react-codemirror'
import { RegExpCursor, SearchCursor } from '@codemirror/search'
import { sql } from '@codemirror/lang-sql'
import dagre from 'dagre'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CteNode, { CteNodeProps, Meta } from '@/components/molecules/CteNode'

const myTheme = EditorView.theme({
  '.cm-content': {
    fontFamily: 'Roboto !important',
    fontSize: 'smaller'
  },
})

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

const getLayoutedElements = (nodes: Node[], edges: Edge[], options: {rankdir: string}) => {
  // create dagre graph
  const dagreGraph = new dagre.graphlib.Graph()
  // this prevents error
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph({ rankdir: options.rankdir, ranksep: 30, nodesep: 30 })

  edges.forEach((edge) => dagreGraph.setEdge(edge.source, edge.target))
  nodes.forEach((node) => dagreGraph.setNode(node.id, {
    label: node.id,
    width: node.width,
    height: node.height,
  }))

  dagre.layout(dagreGraph)

  // 親ノードごとの子ノードを追跡
  const childrenByParent: { [key: string]: Node[] } = {}
  edges.forEach((edge) => {
    if (!childrenByParent[edge.source]) {
      childrenByParent[edge.source] = []
    }
    childrenByParent[edge.source].push(nodes.find(n => n.id === edge.target)!)
  })

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    let xOffset = 0

    // 親ノードの子ノードであれば、オフセットを計算
    Object.values(childrenByParent).forEach((children) => {
      if (children.some(child => child.id === node.id)) {
        const childIndex = children.findIndex(child => child.id === node.id)
        const totalChildren = children.length
        xOffset = (childIndex - (totalChildren - 1) / 2) * 100 // 100はノード間の距離
      }
    })

    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWithPosition.width / 2 + xOffset,
        y: nodeWithPosition.y - nodeWithPosition.height / 2,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}


interface CteFlowProps {
  nodes: Node[]
  edges: Edge[]
  setNodes: Function
  setEdges: Function
  nodesPositioned: boolean
  setNodesPositioned: Function
  codeMirrorRef: React.RefObject<ReactCodeMirrorRef>
  entireMeta: Meta[]
}

const CteFlow = ({ nodes, edges, setNodes, setEdges, nodesPositioned, setNodesPositioned, codeMirrorRef, entireMeta}: CteFlowProps) => {
  const isFirstRender = useRef(true)
  const { fitView } = useReactFlow()
  const searchParams = useSearchParams()

  const [_, setViewIsFit] = useState(false)
  const options = useStoreZustand((state) => state.options)
  const setOptions = useStoreZustand((state) => state.setOptions)

  const codeJump = useCallback((node: Node) => {
    if (codeMirrorRef.current == null || codeMirrorRef.current.view == null) {
      return
    }
    const view: EditorView = codeMirrorRef.current.view
    const searchQuery = `${node.data.label} as (`
    const cursorValues = searchTextCodeMirror(view, searchQuery)
    if (!cursorValues) return
    view?.dispatch({
      selection: { head: cursorValues[0].from, anchor: cursorValues[0].to },
      scrollIntoView: true,
      effects: EditorView.scrollIntoView(cursorValues[0].from, { x: 'start', y: 'start' })
    })
  }, [searchParams])

  const changeLayout = useCallback(() => {
    if (nodes.length == 0 || nodesPositioned) {
      return
    }
    const layouted = getLayoutedElements(nodes, edges, options)
    setNodes([...layouted.nodes])
    setEdges([...layouted.edges])

    window.requestAnimationFrame(() => {
      setTimeout(() => fitView(), 0)
    })
    setViewIsFit(true)
    setNodesPositioned(true)
  }, [nodesPositioned])

  const onNodesChange = useCallback((changes: NodeChange[]) =>
      setNodes((nds: Node[]) => applyNodeChanges(changes, nds))
  , [setNodes])

  const onEdgesChange = useCallback((changes: EdgeChange[]) =>
      setEdges((eds: Edge[]) => applyEdgeChanges(changes, eds))
  , [setEdges])

  const onConnect = useCallback((connection: Connection) =>
      setEdges((eds: Edge[]) => addEdge(connection, eds))
  , [setEdges])

  const searchTextCodeMirror = useCallback((view: EditorView, searchQuery: string) => {
    const cursor = new SearchCursor(view.state.doc, searchQuery)
    const matches = []
    for (let n = cursor.next(); !n.done; n = cursor.next()) {
      matches.push({from: n.value.from, to: n.value.to})
    }
    return matches
  }, [])

  const searchRegExpCodeMirror = useCallback((view: EditorView, searchQuery: string, from?: number, to?: number) => {
    const escapedSearchQuery =  searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const searchPattern = `\\b${escapedSearchQuery}\\b`
    const cursor = new RegExpCursor(view.state.doc, searchPattern, {}, from, to)
    const matches = []
    while (!cursor.next().done) {
      matches.push({from: cursor.value.from, to: cursor.value.to})
    }
    return matches
  }, [])

  const highlightColumns = useCallback(() => {
    if (nodes.length == 0 || nodesPositioned) {
      return
    }
    if (codeMirrorRef.current == null || codeMirrorRef.current.view == null) {
      return
    }
    const columnHighlightDecoration = Decoration.mark({ class: 'bg-amber-200' })
    const nextColumnHighlightDecoration = Decoration.mark({ class: 'bg-emerald-200' })
    const nextTableHighlightDecoration = Decoration.mark({ class: 'bg-indigo-200' })
    const columnHighlightDecorationRanges = []
    const nextColumnHighlightDecorationRanges = []
    const nextTableHighlightDecorationRanges = []

    let prevReferenceCte = null
    for (const entireMt of entireMeta) {
      const column = entireMt.column
      const nextColumns = entireMt.nextColumns
      const nextSources = entireMt.nextSources
      const reference = entireMt.reference

      // CTEの開始部分を取得
      const referenceCte = `${reference} as (`
      const referenceCursorValues = searchTextCodeMirror(codeMirrorRef.current.view, referenceCte)
      let codeFrom = referenceCursorValues.length > 0 ? referenceCursorValues[0].from : 0
      let codeTo = undefined

      // 前回のCTEの開始部分を取得
      if (prevReferenceCte) {
        const currentReferenceCursorValues = searchTextCodeMirror(codeMirrorRef.current.view, prevReferenceCte)
        codeTo = currentReferenceCursorValues.length > 0 ? currentReferenceCursorValues[0].from : undefined
      }

      // ハイライトするカラムの範囲を取得
      const cursorValues = searchRegExpCodeMirror(codeMirrorRef.current.view, column, codeFrom, codeTo)
      for (let cv of cursorValues) {
        columnHighlightDecorationRanges.push(columnHighlightDecoration.range(cv.from, cv.to))
      }
      // ハイライトする次のカラムの範囲を取得
      for (let nextColumn of nextColumns) {
        const nextCursorValues = searchRegExpCodeMirror(codeMirrorRef.current.view, nextColumn, codeFrom, codeTo)
        for (let cv of nextCursorValues) {
          nextColumnHighlightDecorationRanges.push(nextColumnHighlightDecoration.range(cv.from, cv.to))
        }
      }
      // ハイライトする次のテーブルの範囲を取得
      for (let nextSource of nextSources) {
        const nextTableCursorValues = searchRegExpCodeMirror(codeMirrorRef.current.view, nextSource.table, codeFrom, codeTo)
        for (let cv of nextTableCursorValues) {
          nextTableHighlightDecorationRanges.push(nextTableHighlightDecoration.range(cv.from, cv.to))
        }
      }
      // 次のループで前回の参照CTEを取得するために保持
      prevReferenceCte = referenceCte
    }
    // ハイライトを適用
    codeMirrorRef.current.view.dispatch({ effects: highlightEffect.of(columnHighlightDecorationRanges as any) })
    codeMirrorRef.current.view.dispatch({ effects: highlightEffect.of(nextColumnHighlightDecorationRanges as any) })
    codeMirrorRef.current.view.dispatch({ effects: highlightEffect.of(nextTableHighlightDecorationRanges as any) })
  }, [entireMeta, nodesPositioned, codeMirrorRef.current])

  const nodeTypes = useMemo(() => ({
    cte: (props: CteNodeProps) => <CteNode {...props} />
  }), [])

  useEffect(() => {
    highlightColumns()
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
        nodeTypes={nodeTypes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => codeJump(node)}>
        <Controls />
        <Background style={{ backgroundColor: '#f5f5f5' }} />
      </ReactFlow>
    </Suspense>
  )
}

interface QueryParams {
  sources: string[]
  columns: { [source: string]: string[] }
}

export const Cte = () => {
  const { height: windowHeight } = useGetWindowSize()
  const [nodes, setNodes] = useNodesState([])
  const [edges, setEdges] = useEdgesState([])
  const [nodesPositioned, setNodesPositioned] = useState(true)
  const codeMirrorRef = useRef<ReactCodeMirrorRef>(null)
  const [mode, setMode] = useState<string>('lineage')
  const [tableName, setTableName] = useState<string>('')
  const [materialized, setMaterialized] = useState<string>('')
  const [query, setQuery] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [columns, setColumns] = useState<any[]>([])
  const [entireMeta, setEntireMeta] = useState<any[]>([])
  const router = useRouter()

  const handleFetchData = useCallback(async ({sources, columns}: QueryParams) => {
    setNodes([])
    setEdges([])

    const source = sources[0]
    const column = columns[source] ? columns[source][0] : ''
    const query = new URLSearchParams({source, column})
    const hostName = process.env.NEXT_PUBLIC_API_HOSTNAME || ''
    const response = await fetch(`${hostName}/api/v1/cte?${query}`)
    const data = await response.json()
    if (response.status != 200) {
      alert(data['error'])
      router.back()
      return false
    }
    setNodes(data['nodes'])
    setEdges(data['edges'])

    setTableName(data['tableName'])
    setMaterialized(data['materialized'])

    setQuery(data['query'])
    setDescription(data['description'])
    setColumns(data['columns'])

    setEntireMeta(data['entireMeta'])

    setTimeout(()=>setNodesPositioned(false),100)
    handleClickLineageMode()

    return true
  }, [router])

  const handleClickLineageMode = useCallback(() => {
    setMode('lineage')
    setTimeout(()=>setNodesPositioned(false),100)
  }, [setMode, setNodesPositioned])

  const renderColumns = ({columns}: any) => {
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

  return (
    <div>
      <Header handleFetchData={handleFetchData} />
      <div className="flex flex-wrap">
        <div className="w-1/2">
          <h4 className="px-1 text-2xl font-bold flex items-center">
            <span className="select-text">{tableName}</span>
            <small className="ms-2 font-semibold text-gray-500 dark:text-gray-400 select-text">
              {materialized}
            </small>
          </h4>

          <div className="px-2" style={{ height: windowHeight * 0.85, overflowY: 'auto' }}>
            <CodeMirror ref={codeMirrorRef} value={query} theme={myTheme} extensions={[sql(), highlightExtension]} />
          </div>
        </div>
        {/* 一番上のプルダウン一覧の分が55px、タブが24px*/}
        <div className="w-1/2" style={{ height: windowHeight - 55 - 24 }}>
          <div className="mx-2">
            <button className={'px-1 ' + (mode == 'description' && 'font-semibold')} onClick={() => setMode('description')}>
              Description
            </button>
            <button className={'px-1 ' + (mode == 'columns' && 'font-semibold')} onClick={() => setMode('columns')}>
              Columns
            </button>
            <button className={'px-1 ' + (mode == 'lineage' && 'font-semibold')} onClick={() => handleClickLineageMode()}>
              Lineage
            </button>
          </div>
          {mode == 'description' &&
            <Markdown className="markdown" remarkPlugins={[remarkGfm]}>{description}</Markdown>}
          {mode == 'columns' && renderColumns({columns})}
          {mode == 'lineage' &&
          <ReactFlowProvider>
            <CteFlow
              nodes={nodes}
              edges={edges}
              setNodes={setNodes}
              setEdges={setEdges}
              codeMirrorRef={codeMirrorRef}
              nodesPositioned={nodesPositioned}
              setNodesPositioned={setNodesPositioned}
              entireMeta={entireMeta}
            >
            </CteFlow>
          </ReactFlowProvider>
          }
        </div>
      </div>
    </div>
  )
}
