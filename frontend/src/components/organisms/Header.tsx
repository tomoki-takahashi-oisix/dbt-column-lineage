'use client'
import { useRouter, usePathname, useSearchParams, useParams } from 'next/navigation'
import React, { useCallback, useEffect, useState } from 'react'
import { Select } from '@/components/ui/Select'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSpinner } from '@fortawesome/free-solid-svg-icons'
import { useStore as useStoreZustand } from '@/store/zustand'

interface HeaderProps {
  handleFetchData: Function,
}

export const Header = ({handleFetchData}: HeaderProps) => {
  const [lineageMode, setLineageMode] = useState('/cl')
  const [schemas, setSchemas] = useState<{label:string, value: string}[]>([])
  const [sources, setSources] = useState<{label: string, options: {label:string, value: string}[]}[]>([])
  const [columns, setColumns] = useState<{label:string, description: string, value: string}[]>([])

  const [schema, setSchema] = useState('obt')
  const [source, setSource] = useState('obt_sales_order')
  const [column, setColumn] = useState('week_ver')

  const loading = useStoreZustand((state) => state.loading)
  const setLoading = useStoreZustand((state) => state.setLoading)

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const handleFetchSchemasData = useCallback(async (): Promise<{label:string, value: string}[]> => {
    const hostName = process.env.NEXT_PUBLIC_API_HOSTNAME || ''
    const response = await fetch(`${hostName}/api/v1/schemas`)
    const responseJson = await response.json()
    setSchemas(responseJson)
    return responseJson
  }, [])

  const handleFetchSourcesData = useCallback(async (schema:string): Promise<{label:string, options: {label:string, value: string}[]}[]> => {
    const query = new URLSearchParams({schema})
    const hostName = process.env.NEXT_PUBLIC_API_HOSTNAME || ''
    const response = await fetch(`${hostName}/api/v1/sources?${query}`)
    const responseJson = await response.json()
    setSources(responseJson)
    return responseJson
  }, [schema])

  const handleFetchColumnsData = useCallback(async (schema:string, source:string): Promise<{label:string, description: string, value: string}[]> => {
    const query = new URLSearchParams({schema, source})
    const hostName = process.env.NEXT_PUBLIC_API_HOSTNAME || ''
    const response = await fetch(`${hostName}/api/v1/columns?${query}`)
    const responseJson = await response.json()
    setColumns(responseJson)
    return responseJson
  }, [schema, source])

  const changeSchema = useCallback(async (schema: string, getColumn=true) => {
    // 対応するスキーマの表示を切り替える
    setSchema(schema)
    const s = await handleFetchSourcesData(schema)
    const t = s[0]['options'][0]['value']
    setSource(t)
    if (getColumn) {
      const c = await handleFetchColumnsData(schema, t)
      if (c) setColumn(c[0]['value'])
    }
  }, [schema])

  const changeSource = useCallback(async (schema: string, source: string, updateColumn=true) => {
    setSource(source)
    const c = await handleFetchColumnsData(schema, source)
    if (updateColumn) {
      if (c) setColumn(c[0]['value'])
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
      setLoading(true)
      const re = await handleFetchData(params)
      setLoading(false)
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
    <header className="bg-white border-b-[1px]">
      <nav className="container mr-auto flex flex-wrap flex-col md:flex-row items-center">
        <a className="flex title-font font-medium items-center text-gray-900 mb-4 md:mb-0">
          <span className="ml-3 text-xl">

            <select value={lineageMode} onChange={e => router.push(e.target.value)}>
              <option value="/cte">CTE Lineage</option>
              <option value="/cl">Column Level Lineage</option>
            </select>
          </span>
        </a>

        <nav className="md:mr-auto md:ml-4 md:py-2 md:pl-4 md:border-l md:border-gray-400	flex flex-wrap items-center text-base justify-center">
          <Select
            value={{ label: schema, value: schema }}
            options={schemas}
            className="mr-2 w-[15vw]"
            onChange={(d:{value: string, label: string}) => changeSchema(d.value)}
          />

          <Select
            value={{ label: source, value: source }}
            options={sources}
            className="mr-2 w-[30vw]"
            onChange={(d:{value: string, label: string}) => changeSource(schema, d.value)}
          />

          {
            columns &&
            <Select
              value={{ label: column, value: column }}
              options={columns}
              className="mr-2 w-[15vw]"
              useFormatOptionLabel={true}
              onChange={(d:{value: string, label: string}) => setColumn(d.value)}
            />
          }

          <button type="button"
                  className="border-[1px] border-blue-400 px-3 py-1.5 bg-blue-400 text-s text-white font-semibold rounded hover:bg-blue-500"
                  onClick={e => submit()}>
            {
              loading
              ? <FontAwesomeIcon icon={faSpinner} spinPulse />
              : <span>Submit</span>
            }
          </button>
          {/*<button onClick={e => {console.log(window.history.state);router.back();}}>back</button>*/}
        </nav>
      <div className="ml-auto">
      </div>
    </nav>
  </header>
)
}
