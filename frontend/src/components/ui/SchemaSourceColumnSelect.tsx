import { Select } from '@/components/ui/Select'
import { clsx } from 'clsx'
import React, { useCallback, useEffect, useState } from 'react'
import { Columns3, Table } from 'lucide-react'
import { useStore as useStoreZustand } from '@/store/zustand'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { DashboardOption, HeaderProps } from '@/components/organisms/Header'

export const SchemaSourceColumnSelect: React.FC<HeaderProps> = ({handleFetchData}) => {
  const [schemas, setSchemas] = useState<{label: string, value: string}[]>([])
  const [sources, setSources] = useState<{label: string, options: {label:string, value: string}[]}[]>([])
  const [columns, setColumns] = useState<{[source: string]: {label:string, description: string, value: string}[]}>({})

  const [schema, setSchema] = useState('')
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [activeSource, setActiveSource] = useState('')
  const [currentSelectedColumns, setCurrentSelectedColumns] = useState<string[]>([])
  const [selectedColumnsBySource, setSelectedColumnsBySource] = useState<{[source: string]: string[]}>({})
  const [searchShowColumn, setSearchShowColumn] = useState(true)

  const setLoading = useStoreZustand((state) => state.setLoading)
  const setColumnModeEdges = useStoreZustand((state) => state.setColumnModeEdges)
  const setIsSubmitDisabled = useStoreZustand((state) => state.setIsSubmitDisabled)
  const setHeaderSearchDisplayMessage = useStoreZustand((state) => state.setHeaderSearchDisplayMessage)
  const submitClicked = useStoreZustand((state) => state.submitClicked)
  const resetSubmitClicked = useStoreZustand((state) => state.resetSubmitClicked)

  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const isCl = pathname === '/cl'
  const viewModeButtons = [
    { id: 'table', icon: Table, label: 'Table' },
    { id: 'column', icon: Columns3, label: 'Column' },
  ]

  const handleFetchSchemasData = useCallback(async () => {
    const hostName = process.env.NEXT_PUBLIC_API_HOSTNAME || ''
    const response = await fetch(`${hostName}/api/v1/schemas`)
    const responseJson = await response.json()
    setSchemas(responseJson)
    return responseJson
  }, [])

  const handleFetchSourcesData = useCallback(async (schema: string) => {
    const query = new URLSearchParams({ schema })
    const hostName = process.env.NEXT_PUBLIC_API_HOSTNAME || ''
    const response = await fetch(`${hostName}/api/v1/sources?${query}`)
    const responseJson = await response.json()
    setSources(responseJson)
    return responseJson
  }, [])

  const handleFetchColumnsData = useCallback(async (source: string) => {
    const query = new URLSearchParams({ source })
    const hostName = process.env.NEXT_PUBLIC_API_HOSTNAME || ''
    const response = await fetch(`${hostName}/api/v1/columns?${query}`)
    const responseJson = await response.json()
    setColumns(prev => ({ ...prev, [source]: responseJson }))
    return responseJson
  }, [])

  const changeSchema = useCallback(async (newSchema: string) => {
    setSchema(newSchema)
    await handleFetchSourcesData(newSchema)
  }, [handleFetchSourcesData])

  const changeSources = useCallback(async (sources: string[]) => {
    setSelectedSources(sources)
  }, [])

  const changeColumns = useCallback((newColumns: string[]) => {
    setCurrentSelectedColumns(newColumns)
    setSelectedColumnsBySource(prev => ({ ...prev, [activeSource]: newColumns }))
  }, [activeSource])

  //
  const changeActiveSource = useCallback(async (source: string, setCurrentSelectedColumn = true) => {
    setActiveSource(source)
    if (!columns[source]) {
      await handleFetchColumnsData(source)
    }
    if (setCurrentSelectedColumn) {
      const savedColumns = selectedColumnsBySource[source] || []
      setCurrentSelectedColumns(savedColumns)
    }
  }, [columns, selectedColumnsBySource, handleFetchColumnsData])


  const handleSourcesChange = (selected: any, actionTypes: any) => {
    if (isCl) {
      const newSources = selected.map((s: { value: string; label: string }) => s.value)
      changeSources(newSources)
      if (actionTypes.action === 'select-option') {
        changeActiveSource(actionTypes.option.value)
      } else {
        changeActiveSource(newSources[0])
      }
    } else {
      changeSources([selected.value])
      changeActiveSource(selected.value)
    }
  }
  const handleColumnsChange = (selected: any, actionTypes: any) => {
    if (actionTypes.action === 'clear') {
      changeColumns([])
      return
    }
    if (isCl) {
      const newColumns = selected.map((c: { value: string; label: string }) => c.value)
      changeColumns(newColumns)
    } else {
      changeColumns([selected.value])
    }
  }
  const submit = useCallback(async (routeChange=false) => {
    let params: {}

    if (!routeChange) {
      params = {
        schema,
        sources: selectedSources,
        columns: selectedColumnsBySource,
        showColumn: searchShowColumn,
        depth: NaN,
      }
    } else {
      const qSchema = searchParams.get('schema') as string
      const qSources = searchParams.get('sources')?.split(',') || []
      const qActiveSource = searchParams.get('activeSource') as string
      const qSelectedColumns = JSON.parse(searchParams.get('selectedColumns') as string) || {}
      const qShowColumnExt = searchParams.get('showColumn')
      const qShowColumn = qShowColumnExt == 'true'
      const qDepth = parseInt(searchParams.get('depth') as string)

      handleFetchSchemasData()
      changeSchema(qSchema)
      changeSources(qSources)
      changeActiveSource(qActiveSource, false)

      if(qShowColumnExt) setSearchShowColumn(qShowColumn)
      setSelectedColumnsBySource(qSelectedColumns)
      setCurrentSelectedColumns(qSelectedColumns[qActiveSource] || [])

      params = {
        schema: qSchema,
        sources: qSources,
        columns: qSelectedColumns,
        showColumn: qShowColumn,
        depth: qDepth,
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
        showColumn: searchShowColumn.toString()
      })
      router.push(`${pathname}?${query}`)
    }
  }, [pathname, schema, selectedSources, activeSource, searchShowColumn, selectedColumnsBySource])

  const handleHeaderShowColumnChange = useCallback((newShowColumn: boolean) => {
    setSearchShowColumn(newShowColumn)
  }, [setSearchShowColumn])

  // 初回読み込み時の処理
  useEffect(() => {
    if (searchParams.size) {
      submit(true)
    } else {
      handleFetchSchemasData()
      handleFetchSourcesData(schema)
      handleFetchColumnsData(activeSource)
    }
  }, [])

  useEffect(() => {
    // 基本条件: schemaとsourceの選択が必要
    const hasBasicRequirements = schema && selectedSources.length > 0

    if (!hasBasicRequirements) {
      setIsSubmitDisabled(true)
      return
    }

    // CLモードで列選択UIが表示されている場合の追加チェック
    if (isCl && searchShowColumn) {
      // 選択されたソースのいずれかに、1つ以上選択された列があるか確認
      const hasSelectedColumns = selectedSources.some(source =>
        selectedColumnsBySource[source]?.length > 0
      )

      setIsSubmitDisabled(!hasSelectedColumns)
      return
    }

    // 基本条件を満たし、かつCLモードでない場合は有効
    setIsSubmitDisabled(false)
  }, [schema, selectedSources, activeSource, selectedColumnsBySource, searchShowColumn])

  // 選択されたスキーマ、ソース、カラムの表示名を更新
  useEffect(() => {
    if (schema || activeSource || currentSelectedColumns.length > 0) {
      setHeaderSearchDisplayMessage([
        schema,
        activeSource,
        currentSelectedColumns.length > 0 ? currentSelectedColumns.join(', ') : null,
      ].filter(Boolean).join(' | '))
    } else {
      setHeaderSearchDisplayMessage('Select search model')
    }
  }, [schema, activeSource, currentSelectedColumns])

  // submitボタン押下時の処理
  useEffect(() => {
    if (submitClicked) {
      console.log(submitClicked)
      submit()
      resetSubmitClicked()
    }
  }, [submitClicked])

  return (
    <div>
    {isCl && (
      <div>
        <div className="font-medium text-gray-700 mb-2">View Mode</div>
        <div className="inline-flex rounded-md shadow-sm mb-4" role="group">
          {viewModeButtons.map((button) => (
            <button
              key={button.id}
              type="button"
              className={`px-4 py-2 text-sm font-medium border flex items-center whitespace-nowrap ${
                (searchShowColumn ? 'column' : 'table') === button.id
                  ? 'bg-blue-500 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              } ${
                button.id === 'table'
                  ? 'rounded-l-lg'
                  : 'rounded-r-lg'
              }`}
              onClick={() => handleHeaderShowColumnChange(button.id === 'column')}
            >
              <button.icon className="mr-2" size={16} />
              <span>{button.label}</span>
            </button>
          ))}
        </div>
      </div>
    )}
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="font-medium text-gray-700 mb-2">Schema</div>
        <Select
          options={schemas}
          value={{ label: schema, value: schema }}
          onChange={(selected: any) => changeSchema(selected.value)}
          className="mb-4"
        />
        <div className="font-medium text-gray-700 mb-2">Sources</div>
        <Select
          options={sources}
          value={selectedSources.map(s => ({ label: s, value: s }))}
          onChange={handleSourcesChange}
          className="mb-2"
          isMulti={isCl}
          useFormatOptionLabel={true}
        />
      </div>
      {searchShowColumn && (
        <div>
          <div className="font-medium text-gray-700 mb-2">Active Source</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {selectedSources.map((source) => (
              <button
                key={source}
                className={clsx(
                  'px-3 py-1 rounded-md text-sm font-medium',
                  source === activeSource
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300',
                )}
                onClick={() => changeActiveSource(source)}
              >
                {source}
              </button>
            ))}
          </div>
          <div className="font-medium text-gray-700 mb-2">Columns</div>
          {columns[activeSource] && (
            <Select
              options={columns[activeSource]}
              value={currentSelectedColumns.map(c => ({ label: c, value: c }))}
              onChange={handleColumnsChange}
              className="mb-2"
              isMulti={isCl}
              isClearable={!isCl}
              useFormatOptionLabel={true}
            />
          )}
        </div>
      )}
    </div>
    </div>
  )
}