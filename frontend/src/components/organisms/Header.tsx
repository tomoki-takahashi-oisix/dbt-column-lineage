'use client'
import { useRouter, usePathname, useSearchParams, useParams } from 'next/navigation'
import React, { useCallback, useEffect, useState } from 'react'

interface HeaderProps {
  handleFetchData: Function,
}

export const Header = ({handleFetchData}: HeaderProps) => {
  const [lineageMode, setLineageMode] = useState('/cl')
  const [schemas, setSchemas] = useState<string[]>([])
  const [sources, setSources] = useState<{ [key: string]: string[] }>({})
  const [columns, setColumns] = useState<string[]>([])

  const [schema, setSchema] = useState('obt')
  const [source, setSource] = useState('obt_sales_order')
  const [column, setColumn] = useState('week_ver')

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const handleFetchSchemasData = useCallback(async (): Promise<{ [key: string]: string[] }> => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_HOSTNAME}/api/v1/schemas`)
    const data = await response.json()
    setSchemas(data)
    return data
  }, [])

  const handleFetchSourcesData = useCallback(async (schema:string): Promise<{ [key: string]: string[] }> => {
    const query = new URLSearchParams({schema})
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_HOSTNAME}/api/v1/sources?${query}`)
    const data = await response.json()
    setSources(data)
    return data
  }, [schema])

  const handleFetchColumnsData = useCallback(async (schema:string, source:string): Promise<string[]> => {
    const query = new URLSearchParams({schema, source})
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_HOSTNAME}/api/v1/columns?${query}`)
    const data = await response.json()
    setColumns(data)
    return data
  }, [schema, source])

  const changeSchema = useCallback(async (schema: string, getColumn=true) => {
    // 対応するスキーマの表示を切り替える
    setSchema(schema)
    const s = await handleFetchSourcesData(schema)
    const t = Object.values(s)[0][0]
    setSource(t)
    if (getColumn) {
      const c = await handleFetchColumnsData(schema, t)
      if (c) setColumn(c[0])
    }
  }, [schema])

  const changeSource = useCallback(async (schema: string, source: string, updateColumn=true) => {
    setSource(source)
    const c = await handleFetchColumnsData(schema, source)
    if (updateColumn) {
      if (c) setColumn(c[0])
    }
  }, [schema, source])

  const submit = useCallback(() => {
    const query = new URLSearchParams({ schema, source, column })
    router.push(`${pathname}?${query}`)
  }, [pathname, schema, source, column])

  const routeChange = useCallback(async () => {
    const qSchema = searchParams.get('schema')
    const qSource = searchParams.get('source')
    const qColumn = searchParams.get('column')
    const qDepth = searchParams.get('depth')
    const params = { schema: qSchema, source: qSource, column: qColumn, depth: qDepth }
    if (qSchema && qSource) {
      const re = await handleFetchData(params)
      if (re) {
        // schema や source が変化した場合(=/cte の codejump のときやリロード時)には、それに合わせてプルダウンを変更する
        handleFetchSchemasData()
        if (params.schema != schema) await changeSchema(params.schema as string, false)
        if (params.source != source) await changeSource(params.schema as string, params.source as string, false)
        if (params.column && params.column != column) setColumn(params.column as string)
      }
    }
  }, [pathname, searchParams])

  useEffect(() => {
    if (searchParams.size && (searchParams.get('schema') != schema && searchParams.get('source') != source)) return
    console.log('init')
    handleFetchSchemasData()
    handleFetchSourcesData(schema)
    handleFetchColumnsData(schema, source)
  }, [])

  useEffect(() => {
    routeChange()
    if (pathname != lineageMode) setLineageMode(pathname)
  }, [pathname, searchParams])

  return (
    // 一番上のプルダウン一覧の分が24px
    <header className="text-gray-600 body-font">
      <nav className="container mr-auto flex flex-wrap flex-col md:flex-row items-center">
        <a className="flex title-font font-medium items-center text-gray-900 mb-4 md:mb-0">
          <span className="ml-3 text-xl">

            <select value={lineageMode} onChange={e => router.push(e.target.value)}>
              <option value="/cte">CTE Lineage</option>
              <option value="/cl">Column Level Lineage</option>
            </select>
          </span>
        </a>

        <nav className="md:mr-auto md:ml-4 md:py-1 md:pl-4 md:border-l md:border-gray-400	flex flex-wrap items-center text-base justify-center">
          <select value={schema} onChange={e => changeSchema(e.target.value)}>
            {schemas.map((schema: string, index: number) => <option key={index} value={schema}>{schema}</option>)}
          </select>

          <select className="max-w-lg" value={source} onChange={async e => changeSource(schema, e.target.value)}>
            {Object.keys(sources).map((key: string, index: number) =>
              <optgroup key={index} label={key}>
                {sources[key].map((source: string, i: number) => <option key={i} value={source}>{source}</option>)}
              </optgroup>)}
          </select>

          {
            columns &&
            <select className="max-w-48" value={column} onChange={e => setColumn(e.target.value)}>
              {columns && columns.map((column: string, index: number) => <option key={index}
                                                                                 value={column}>{column}</option>)}
            </select>
          }

          <button type="button"
                  className="px-2 py-1 bg-blue-400 text-xs text-white font-semibold rounded hover:bg-blue-500"
                  onClick={e => submit()}>Submit
          </button>
          {/*<button onClick={e => {console.log(window.history.state);router.back();}}>back</button>*/}
        </nav>
      <div className="ml-auto">
      </div>
    </nav>
  </header>
)
}
