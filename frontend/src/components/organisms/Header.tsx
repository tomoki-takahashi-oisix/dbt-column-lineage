import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import React, { useCallback, useEffect, useState } from 'react'
import { SchemaSourceColumnSelect } from '@/components/ui/SchemaSourceColumnSelect'
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
  const [columns, setColumns] = useState<{[source: string]: {label:string, description: string, value: string}[]}>({})
  const [isSubmitDisabled, setIsSubmitDisabled] = useState(true)

  const [schema, setSchema] = useState('obt')
  const [selectedSources, setSelectedSources] = useState<string[]>(['obt_sales_order'])
  const [activeSource, setActiveSource] = useState('obt_sales_order')
  const [currentSelectedColumns, setCurrentSelectedColumns] = useState<string[]>(['week_ver'])
  // カラムの選択状態の記憶
  const [selectedColumnsBySource, setSelectedColumnsBySource] = useState<{[source: string]: string[]}>({'obt_sales_order': ['week_ver']})

  const loading = useStoreZustand((state) => state.loading)
  const setLoading = useStoreZustand((state) => state.setLoading)
  const showColumn = useStoreZustand((state) => state.showColumn)
  const setShowColumn = useStoreZustand((state) => state.setShowColumn)
  const setColumnModeEdges = useStoreZustand((state) => state.setColumnModeEdges)

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

  const handleFetchColumnsData = useCallback(async (source:string): Promise<{label:string, description: string, value: string}[]> => {
    const query = new URLSearchParams({source})
    const hostName = process.env.NEXT_PUBLIC_API_HOSTNAME || ''
    const response = await fetch(`${hostName}/api/v1/columns?${query}`)
    const responseJson = await response.json()
    setColumns(prev => ({...prev, [source]: responseJson}))
    return responseJson
  }, [schema])

  const changeSchema = useCallback(async (newSchema: string) => {
    setSchema(newSchema)
    await handleFetchSourcesData(newSchema)
  }, [])

  const changeSources = useCallback(async (sources: string[]) => {
    setSelectedSources(sources)
  }, [])

  const changeActiveSource = useCallback(async (source: string, setCurrentSelectedColumn=true) => {
    setActiveSource(source)
    if (!columns[source]) {
      await handleFetchColumnsData(source)
    }
    if (setCurrentSelectedColumn) {
      const savedColumns = selectedColumnsBySource[source] || []
      setCurrentSelectedColumns(savedColumns)
    }
  }, [schema, columns, selectedColumnsBySource])

  const handleColumnsChange = useCallback((newColumns: string[]) => {
    setCurrentSelectedColumns(newColumns)
    setSelectedColumnsBySource(prev => ({...prev, [activeSource]: newColumns}))

  }, [activeSource])

  const submit = useCallback(async (routeChange=false) => {
    let params: {}

    if (!routeChange) {
      params = {
        schema,
        sources: selectedSources,
        columns: selectedColumnsBySource,
        showColumn,
      }
    } else {
      const qSchema = searchParams.get('schema') as string
      const qSources = searchParams.get('sources')?.split(',') || []
      const qActiveSource = searchParams.get('activeSource') as string
      const qSelectedColumns = JSON.parse(searchParams.get('selectedColumns') as string) || {}
      const qShowColumn = searchParams.get('showColumn') as string === 'true'

      handleFetchSchemasData()
      changeSchema(qSchema)
      changeSources(qSources)
      changeActiveSource(qActiveSource, false)

      if(qShowColumn) setShowColumn(qShowColumn)
      setSelectedColumnsBySource(qSelectedColumns)
      setCurrentSelectedColumns(qSelectedColumns[qActiveSource] || [])

      params = {
        schema: qSchema,
        sources: qSources,
        columns: qSelectedColumns,
        showColumn: qShowColumn,
      }
    }
    // データ取得中はローディング表示
    setLoading(true)
    const ret = await handleFetchData(params)
    setLoading(false)
    // 保存していたカラムモードのエッジを削除
    setColumnModeEdges([])

    if (!routeChange && ret) { // submit押したときかつデータ取得成功時
      const query = new URLSearchParams({
        schema,
        sources: selectedSources.join(','),
        activeSource: activeSource,
        selectedColumns: JSON.stringify(selectedColumnsBySource),
        showColumn: showColumn.toString()
      })
      router.push(`${pathname}?${query}`)
    }
  }, [pathname, schema, selectedSources, activeSource, showColumn, selectedColumnsBySource])

  const isLineageModeColumnLevel = useCallback(() => {
    return lineageMode === '/cl'
  }, [lineageMode])


  useEffect(() => {
    if (searchParams.size) {
      submit(true)
    } else {
      handleFetchSchemasData()
      handleFetchSourcesData(schema)
      handleFetchColumnsData(activeSource)
    }
    if (pathname !== lineageMode) setLineageMode(pathname)
  }, [])

  // submitボタンのdisabled制御
  useEffect(() => {
    if (schema && selectedSources.length > 0) {
      for (const source of selectedSources) {
        if (isLineageModeColumnLevel() &&(!selectedColumnsBySource[source] || selectedColumnsBySource[source].length === 0)) {
          setIsSubmitDisabled(true)
          return
        }
      }
      setIsSubmitDisabled(false)
    } else {
      setIsSubmitDisabled(true)
    }
  }, [schema, selectedSources, activeSource, selectedColumnsBySource])

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
          <SchemaSourceColumnSelect
            schemas={schemas}
            sources={sources}
            selectedSources={selectedSources}
            columns={columns}
            schema={schema}
            activeSource={activeSource}
            selectedColumns={currentSelectedColumns}
            onSchemaChange={(newSchema) => changeSchema(newSchema)}
            onSourcesChange={(sources) => changeSources(sources)}
            onActiveSourceChange={(source) => changeActiveSource(source)}
            onColumnsChange={handleColumnsChange}
            className="mr-2 w-[60vw]"
            isMulti={isLineageModeColumnLevel()}
          />
          <button
            type="button"
            className="border-[1px] border-blue-400 px-3 py-1.5 bg-blue-400 text-s text-white font-semibold rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => submit()}
            disabled={isSubmitDisabled}
          >
            {loading ? (
              <FontAwesomeIcon icon={faSpinner} spinPulse />
            ) : (
              <span>Submit</span>
            )}
          </button>
        </nav>
      </nav>
    </header>
  )
}