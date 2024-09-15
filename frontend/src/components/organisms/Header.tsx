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
  const showColumn = useStoreZustand((state) => state.showColumn)
  const setShowColumn = useStoreZustand((state) => state.setShowColumn)

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

  const submit = useCallback(async (routeChange=false) => {
    let params: any

    if (!routeChange) {
      params = { schema, source, column }
      const query = new URLSearchParams({...params, show_column: showColumn.toString()})
      // console.log(query.toString())
      router.push(`${pathname}?${query}`)
      params.showColumn =  showColumn.toString()
    } else {
      const qSchema = searchParams.get('schema') as string
      const qSource = searchParams.get('source') as string
      const qColumn = searchParams.get('column') as string
      const qShowColumn = searchParams.get('show_column') as string
      params = { schema: qSchema, source: qSource, column: qColumn, showColumn: qShowColumn }
      // schema や source が変化した場合(=/cte の codejump のときやリロード時)には、それに合わせてプルダウンを変更する
      handleFetchSchemasData()
      await changeSchema(qSchema, false)
      await changeSource(qSchema, qSource, false)
      if (qColumn) setColumn(qColumn)
      if(qShowColumn) setShowColumn(qShowColumn == 'true')
    }
    setLoading(true)
    await handleFetchData(params)
    setLoading(false)
  }, [pathname, schema, source, column, showColumn])

  useEffect(() => {
    if (searchParams.size) {
      // クエリパラメータがある場合はその値でデータ取得しつつ、フォームに値をセットする
      submit(true)
    } else {
      // クエリパラメータがない場合は初期値
      handleFetchSchemasData()
      handleFetchSourcesData(schema)
      handleFetchColumnsData(schema, source)
    }
    if (pathname != lineageMode) setLineageMode(pathname)
  }, [])


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
