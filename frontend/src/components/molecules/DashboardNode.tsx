'use client'
import React, { useCallback } from 'react'
import { NodeProps, Position } from 'reactflow'
import { useStore as useStoreZustand } from '@/store/zustand'
import { useEventNodeOperations } from '@/hooks/useEventNodeOperations'
import TableNodeColumnHandle from '@/components/molecules/TableNodeColumnHandle'
import DashboardNodeFrame from '@/components/molecules/DashboardNodeFrame'
import TableNodeHandle from '@/components/molecules/TableNodeHandle'


export interface DashboardNodeProps extends NodeProps {
  data: DashboardNodeType
}

interface DashboardNodeType {
  id: string
  name: string
  url: string
  elements: DashboardElementType[]
  first: boolean
  last: boolean
}
interface DashboardElementType {
  id: string
  title: string
  explore_url: string
}

export const DashboardNode: React.FC<DashboardNodeProps> = ({ data, id, selected }) => {
  const { hideNode } = useEventNodeOperations(id)
  const options = useStoreZustand((state) => state.options)

  const handleClickColumnName = useCallback((e: React.MouseEvent, exploreUrl: string) => {
    e.stopPropagation()
    window.open(exploreUrl, '_blank')
  }, [data])

  return (
    <DashboardNodeFrame
      id={data.id}
      name={data.name}
      url={data.url}
      selected={selected}
      hideNode={hideNode}
      content={
        <>
          {/* table => column 切替時に残るハンドル */}
          <div>
            <TableNodeHandle
              type="source"
              position={Position.Left}
              id={`${id}__source`}
              isConnectable={true}
              nodeId={id}
            />
          </div>
          <div className="py-2 px-0">
            {data.elements.map((ele) => (
              <div
                className="flex items-center relative"
                key={'i-' + ele.id}
                style={{
                  position: 'relative', padding: '8px 16px',
                  flexGrow: 1, textAlign: 'left', paddingRight: '24px', paddingLeft: '24px',
                }}
              >
                <p
                  className="cursor-pointer hover:underline flex-grow"
                  onClick={(e) => handleClickColumnName(e, ele.explore_url)}
                >
                  {ele.title}
                </p>
                <TableNodeColumnHandle
                  type="source"
                  position={options.rankdir === 'LR' ? Position.Right : Position.Left}
                  id={`${ele.id}__source`}
                  isConnectable={true}
                  nodeId={id}
                  showToggle={false}
                  onDelete={() => null}
                  onConnect={() => null}
                />
              </div>
            ))}
          </div>
        </>
      }
    />
  )
}
