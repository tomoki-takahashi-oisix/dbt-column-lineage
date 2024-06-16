'use client'
import { NodeDataType } from '@/components/pages/Cl'
import { Handle, NodeProps, Position, useUpdateNodeInternals } from 'reactflow'
import Node, { contentStyle as style, contentStyleIo, contentStyleTextLeft } from './Node'
import { useStore as useStoreZustand } from '@/store/zustand'
import React, { useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAnglesRight } from '@fortawesome/free-solid-svg-icons'

export interface EventNodeProps extends NodeProps {
  data: NodeDataType
  addReverseLineage?: Function
}

export const EventNode = ({ data, id, selected, addReverseLineage }: EventNodeProps) => {
  const options = useStoreZustand((state) => state.options)
  const setLoading = useStoreZustand((state) => state.setLoading)

  const updateNodeInternals = useUpdateNodeInternals()

  const goToCte = useCallback((e:React.MouseEvent, rawColumn: string) => {
    e.stopPropagation()
    const schema = data.schema
    const source = data.name
    const column = rawColumn.toLowerCase()
    const params = new URLSearchParams({schema, source, column })

    // router.push(`/cte?${params.toString()}`)
    window.open(`/cte?${params.toString()}`, '_blank')
  }, [data])

  const handleConnectClicked = useCallback(async(e:React.MouseEvent, id:string, source:string, column:string) => {
    e.stopPropagation()

    setLoading(true)
    const query = new URLSearchParams({source, column})
    const hostName = process.env.NEXT_PUBLIC_API_HOSTNAME || ''
    const response = await fetch(`${hostName}/api/v1/reverse_lineage?${query}`)
    const props = await response.json()
    // console.log(props)
    if (addReverseLineage) addReverseLineage({updateNodeInternals, props, id, source, column})
    setLoading(false)
  }, [data])

  return (
    <Node
      label={data.name}
      selected={selected}
      color={'Lavender'}
      content={
        <>
          {data.columns.map((column) => (
            <div
              className="flex"
              key={'i-' + column}
              style={{ ...contentStyleIo, ...contentStyleTextLeft }}>
              <p
                className="cursor-pointer hover:underline"
                onClick={(e) => {goToCte(e, column)}}>
                {column}
              </p>
            {
              !data.last &&
              <Handle
                type="source"
                position={options.rankdir == 'LR' ? Position.Right : Position.Left}
                id={column + '__source'}
                style={{ ...style.handle, ...(options.rankdir == 'LR' ? style.right: style.left) }}
              />
            }
            {
              (!data.first || (data?.opened && data.opened.includes(column) )) ?
              <Handle
                type="target"
                position={options.rankdir == 'LR' ? Position.Left : Position.Right}
                id={column + '__target'}
                style={{ ...style.handle, ...(options.rankdir == 'LR' ? style.left: style.right) }}
              />
              :
              <p className='ml-auto'>
                <FontAwesomeIcon
                  onClick={(e) => handleConnectClicked(e, id, data.name, column)}
                  className="cursor-pointer mx-1 fa-sm"
                  icon={faAnglesRight} />
              </p>
            }
          </div>
        ))}
      </>
      }
    />
  )
}
