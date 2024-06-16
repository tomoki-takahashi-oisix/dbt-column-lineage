'use client'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Edge, Node, Position, ReactFlowState, useReactFlow, useStore } from 'reactflow'
import { useStore as useStoreZustand } from '@/store/zustand'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAngleRight, faAngleLeft } from '@fortawesome/free-solid-svg-icons'
import dagre from 'dagre'

interface DagreNodePositioningProps {
  setNodes: Function,
  setEdges: Function
  setViewIsFit: Function,
  nodesPositioned: boolean,
  setNodesPositioned: Function
}

const getLayoutedElements = (nodes: Node[], edges: Edge[], options: {rankdir: string}) => {
  // create dagre graph
  const dagreGraph = new dagre.graphlib.Graph()
  // this prevents error
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph(options)

  edges.forEach((edge) => dagreGraph.setEdge(edge.source, edge.target))
  nodes.forEach((node) => dagreGraph.setNode(node.id, {
    label: node.id,
    width: node.width,
    height: node.height,
  }))

  dagre.layout(dagreGraph)

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    switch (options.rankdir) {
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
      x: nodeWithPosition.x - nodeWithPosition.width / 2 + Math.random() / 1000,
      y: nodeWithPosition.y - nodeWithPosition.height / 2,
    }

    return node
  })

  return { nodes, edges }
}

export const Sidebar = ({setNodes, setEdges, setViewIsFit, nodesPositioned, setNodesPositioned}: DagreNodePositioningProps) => {
  const { fitView } = useReactFlow()
  const nodeInternals = useStore((state: ReactFlowState) => state.nodeInternals)
  const flattenedNodes = Array.from(nodeInternals.values())
  const edges = useStore((state: ReactFlowState) => state.edges)
  const transform = useStore((state: ReactFlowState) => state.transform)
  const options = useStoreZustand((state) => state.options)
  const sidebarActive = useStoreZustand((state) => state.sidebarActive)
  const setSidebarActive = useStoreZustand((state) => state.setSidebarActive)
  const router = useRouter()

  const goToCte = useCallback((node: Node, column: string) => {
    const schema = node.data.schema
    const source = node.data.name
    const query = new URLSearchParams({schema, source, column})

    router.push(`/cte?${query.toString()}`)
  }, [nodeInternals])

  useEffect(() => {
    try {
      // node dimensions are not immediately detected, so we want to wait until they are
      if (flattenedNodes[0]?.width) {

        // use dagre graph to layout nodes

        // if nodes exist and nodes are not positioned
        // console.log(nodesPositioned)
        if (flattenedNodes.length > 0 && !nodesPositioned) {
          const layouted = getLayoutedElements(flattenedNodes, edges, options)

          console.log('redraw', layouted)
          // update react flow state
          setNodes(layouted.nodes)
          setEdges(layouted.edges)
          setNodesPositioned(true)

          // fit view
          window.requestAnimationFrame(() => {
            setTimeout(()=> fitView(), 0)

          })
          setViewIsFit(true)
        }
      }
    } catch (error) {
      console.log('error', error)
    }
  }, [nodesPositioned, flattenedNodes])

  return (
    // <div className={' bg-white absolute top-8 right-0 z-50 drop-shadow-md ' + (active ? 'w-1/6': 'w-5')}>
    <div className={'bg-white drop-shadow-md '+ (sidebarActive ? 'w-1/6': 'w-5')}>
      <div className="px-1" onClick={() => setSidebarActive(!sidebarActive)}>
        <FontAwesomeIcon icon={sidebarActive ? faAngleRight: faAngleLeft} className="h-[20px]" />
      </div>
      {sidebarActive && <div className="px-2 text-sm">
        <div className="py-1 font-semibold text-base">Zoom & pan transform</div>
        <div className="transform break-words">
          [{transform[0].toFixed(2)}, {transform[1].toFixed(2)}, {transform[2].toFixed(2)}]
        </div>
        <div className="py-1 font-semibold text-base">Nodes</div>
        {flattenedNodes.map((node) => (
          <div key={node.id}>
            <span
                  className="font-medium break-words">{node.data.name}</span>
            <div>x: {node.position.x.toFixed(2)}, y: {node.position.y.toFixed(2)}</div>
            {/*<ul className="list-disc px-4">*/}
            {/*  {node.data.columns.map((column: string, index: number) => (*/}
            {/*    <li className="underline hover:text-blue-600 cursor-pointer" onClick={() => goToCte(node, column.toLowerCase())} key={index}>{column.toLowerCase()}</li>*/}
            {/*  ))}*/}
            {/*</ul>*/}
          </div>
        ))}
      </div>}
    </div>
  );
}
