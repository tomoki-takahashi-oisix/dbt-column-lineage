'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { NodeDataType } from '@/components/pages/Cl'
import { Handle, Position } from 'reactflow'
import Node, { contentStyle as style, contentStyleIo, contentStyleTextLeft } from './Node'
import { useStore as useStoreZustand } from '@/store/zustand'
import { useCallback } from 'react'

interface EventNodeProps {
  data: NodeDataType
  selected: boolean
}

export const EventNode = ({ data, selected }: EventNodeProps) => {
  const options = useStoreZustand((state) => state.options)
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const goToCte = useCallback((rawColumn: string) => {
    // console.log(source, column)
    const schema = data.schema
    const source = data.name
    const column = rawColumn.toLowerCase()
    const params = new URLSearchParams({schema, source, column })

    // router.push(`/cte?${params.toString()}`)
    window.open(`/cte?${params.toString()}`, '_blank')
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
              key={'i-' + column}
              onClick={() => goToCte(column)}
              className="hover:bg-blue-200 cursor-pointer"
              style={{ ...contentStyleIo, ...contentStyleTextLeft }}
            >
              {column}
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
                !data.first &&
                <Handle
                  type="target"
                  position={options.rankdir == 'LR' ? Position.Left : Position.Right}
                  id={column + '__target'}
                  style={{ ...style.handle, ...(options.rankdir == 'LR' ? style.left: style.right) }}
                />
              }
            </div>
          ))}
        </>
      }
    />
  )
}
