'use client'
import React, { useCallback } from 'react'
import { NodeProps, Position } from 'reactflow'
import { useStore as useStoreZustand } from '@/store/zustand'
import { useEventNodeOperations } from '@/hooks/useEventNodeOperations'
import EventNodeHandle from '@/components/molecules/EventNodeHandle'
import EventNodeFrame from '@/components/molecules/EventNodeFrame'
import EventNodeColumns from '@/components/molecules/EventNodeColumns'
import TableNodeHandle from '@/components/molecules/TableNodeHandle'

export interface EventNodeProps extends NodeProps {
  data: NodeDataType
}

interface NodeDataType {
  name: string
  color: string
  schema: string
  materialized: string
  columns: string[]
  first: boolean
  last: boolean
}


export const EventNode: React.FC<EventNodeProps> = ({ data, id, selected }) => {
  const { addSingleLineage, addReverseLineage, hideNode,
    hideTableAndRelatedEdges, hideColumnAndRelatedEdges,
    lastNodeColumns, lastNodeTable, firstNodeColumns, firstNodeTable } = useEventNodeOperations(id)

  const options = useStoreZustand((state) => state.options)
  const showColumn = useStoreZustand((state) => state.showColumn)

  // カラム名押下時にCTE画面に遷移する
  const handleClickColumnName = useCallback((e: React.MouseEvent, rawColumn: string) => {
    e.stopPropagation()
    const { schema: schema, name: sources } = data
    const columns = rawColumn.toLowerCase()
    const activeSource = sources
    const selectedColumns = JSON.stringify({ [sources]: [columns] })
    const params = new URLSearchParams({schema, sources, activeSource, selectedColumns})

    // router.push(`/cte?${params.toString()}`)
    window.open(`/cte?${params.toString()}`, '_blank')
  }, [data])

  // (+)ハンドル押下時にリネージを追加する
  const handlePlusClickEventNodeHandle = useCallback(async (column: string, handleType: 'source' | 'target') => {
    if (handleType === 'target') {
      await addReverseLineage(id, data.name, column)
    } else if (handleType === 'source') {
      await addSingleLineage(data.name, column)
    }
  }, [addReverseLineage, addSingleLineage, id, data.name])

  // (-)ハンドル押下時に関連するノードを削除する
  const handleMinusClickEventNodeHandle = useCallback((column: string) => {
    if (showColumn) {
      hideColumnAndRelatedEdges(id, column)
    } else {
      hideTableAndRelatedEdges(id)
    }
  }, [showColumn, hideColumnAndRelatedEdges, hideTableAndRelatedEdges, id])

  // table モードの描画
  const renderTableNode = () => (
    <EventNodeFrame
      schema={data.schema}
      tableName={data.name}
      selected={selected}
      color={data.materialized === 'incremental' ? '#ADD8E6' : 'Lavender'}
      hideNode={hideNode}
      isClickableTableName={true}
      content={
        <>
          {(firstNodeTable != data.name) && (
            <TableNodeHandle
              type="source"
              position={Position.Left}
              id={`${id}__source`}
              isConnectable={true}
              nodeId={id}
              onConnect={() => handlePlusClickEventNodeHandle('', 'source')}
              onDelete={handleMinusClickEventNodeHandle}
            />
          )}
          {(lastNodeTable != data.name) && (
            <TableNodeHandle
              type="target"
              position={Position.Right}
              id={`${id}__target`}
              isConnectable={true}
              nodeId={id}
              onConnect={() => handlePlusClickEventNodeHandle('', 'target')}
              onDelete={handleMinusClickEventNodeHandle}
            />
          )}
        </>
      }
    />
  )

  // column モードの描画
  const renderColumnNode = () => (
    <EventNodeFrame
      schema={data.schema}
      tableName={data.name}
      selected={selected}
      color={data.materialized === 'incremental' ? '#ADD8E6' : 'Lavender'}
      hideNode={hideNode}
      isClickableTableName={false}
      content={
        <>
          {/* table => column 切替時に残るハンドル */}
          <div>
            {(firstNodeTable != data.name) && (
              <TableNodeHandle
                type="source"
                position={Position.Left}
                id={`${id}__source`}
                isConnectable={true}
                nodeId={id}
              />
            )}
            {(lastNodeTable != data.name) && (
              <TableNodeHandle
                type="target"
                position={Position.Right}
                id={`${id}__target`}
                isConnectable={true}
                nodeId={id}
              />
            )}
          </div>
          <div className="py-2 px-0">
            {data.columns.map((column) => (
              <div
                className="flex items-center relative"
                key={'i-' + column}
                style={{
                  position: 'relative', padding: '8px 16px',
                  flexGrow: 1, textAlign: 'left', paddingRight: '24px', paddingLeft: '24px',
                }}
              >
                <p
                  className="cursor-pointer hover:underline flex-grow"
                  onClick={(e) => handleClickColumnName(e, column)}
                >
                  {column}
                </p>
                {( !data.last && !firstNodeColumns.includes(column)) && (
                  <EventNodeHandle
                    type="source"
                    position={options.rankdir === 'LR' ? Position.Right : Position.Left}
                    id={`${column}__source`}
                    isConnectable={true}
                    nodeId={id}
                    onDelete={() => handleMinusClickEventNodeHandle(column)}
                    onConnect={() => handlePlusClickEventNodeHandle(column, 'source')}
                  />
                )}
                {( !data.first && !lastNodeColumns.includes(column)) && (
                  <EventNodeHandle
                    type="target"
                    position={options.rankdir === 'LR' ? Position.Left : Position.Right}
                    id={`${column}__target`}
                    isConnectable={true}
                    nodeId={id}
                    onDelete={() => handleMinusClickEventNodeHandle(column)}
                    onConnect={() => handlePlusClickEventNodeHandle(column, 'target')}
                  />
                )}
              </div>
            ))}
            <EventNodeColumns
              schema={data.schema}
              tableName={data.name}
              nodeColumns={data.columns}
              handlePlusClickEventNodeHandle={handlePlusClickEventNodeHandle}
            />
          </div>
        </>
      }
    />
  )

  return showColumn ? renderColumnNode() : renderTableNode()
}
