import { Select } from '@/components/ui/Select'
import { DashboardOption, HeaderProps } from '@/components/organisms/Header'
import React, { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useStore as useStoreZustand } from '@/store/zustand'

export const DashboardContentSelect: React.FC<HeaderProps> = ({handleFetchData}) => {
  const isLookerEnabled = Boolean(process.env.NEXT_PUBLIC_USE_LOOKER)
  const [dashboards, setDashboards] = useState<DashboardOption[]>([])
  const [selectedDashboard, setSelectedDashboard] = useState('')

  const setLoading = useStoreZustand((state) => state.setLoading)
  const setColumnModeEdges = useStoreZustand((state) => state.setColumnModeEdges)
  const setIsSubmitDisabled = useStoreZustand((state) => state.setIsSubmitDisabled)
  const setHeaderSearchDisplayMessage = useStoreZustand((state) => state.setHeaderSearchDisplayMessage)
  const submitClicked = useStoreZustand((state) => state.submitClicked)
  const resetSubmitClicked = useStoreZustand((state) => state.resetSubmitClicked)

  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const groupedOptions = dashboards.reduce<Array<{
    label: string
    options: Array<{
      value: string
      label: string
      description: string
    }>
  }>>((acc, dashboard) => {
    const pathParts = dashboard.description.split('/')
    const groupPath = pathParts.slice(0, -1).join('/')

    const existingGroup = acc.find(group => group.label === groupPath)
    const option = {
      value: dashboard.value,
      label: dashboard.label,
      description: ''
    }

    if (existingGroup) {
      existingGroup.options.push(option)
    } else {
      acc.push({
        label: groupPath,
        options: [option]
      })
    }

    return acc
  }, [])

  const handleFetchDashboards = useCallback(async () => {
    if (!isLookerEnabled) return
    const hostName = process.env.NEXT_PUBLIC_API_HOSTNAME || ''
    const response = await fetch(`${hostName}/api/v1/dashboards`)
    const json = await response.json()
    if (json.status === 'success') {
      const dashboardOptions = json.data
        .sort((a: any, b: any) => a.folder_path.localeCompare(b.folder_path))
        .map((dashboard: any) => ({
          value: dashboard.id,
          label: dashboard.title,
          description: dashboard.folder_path
        }))
      setDashboards(dashboardOptions)
    }
  }, [isLookerEnabled])

  const changeDashboard = useCallback(async (dashboardId: string) => {
    setSelectedDashboard(dashboardId)
  }, [])

  const submit = useCallback(async (routeChange=false) => {
    let params: {}

    if (!routeChange) {
      params = {
        dashboardId: selectedDashboard,
      }
    } else {
      const qDashboardId = searchParams.get('dashboardId') as string
      handleFetchDashboards()
      setSelectedDashboard(qDashboardId)

      params = {
        dashboardId: qDashboardId,
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
        dashboardId: selectedDashboard,
      })
      router.push(`${pathname}?${query}`)
    }
  }, [selectedDashboard])

  // 初回読み込み時の処理
  useEffect(() => {
    if (searchParams.size) {
      submit(true)
    } else {
      handleFetchDashboards()
    }
  }, [])

  // submitボタンのdisabled制御
  useEffect(() => {
    setIsSubmitDisabled(!selectedDashboard)
  }, [selectedDashboard])

  // 選択されたダッシュボードの表示名を更新
  useEffect(() => {
    if (selectedDashboard) {
      setHeaderSearchDisplayMessage(dashboards?.find(d => d.value === selectedDashboard)?.label || 'Select dashboard')
    } else {
      setHeaderSearchDisplayMessage('Select dashboard')
    }
  }, [selectedDashboard, dashboards])

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
      <div className="font-medium text-gray-700 mb-2">Dashboard</div>
      <Select
        options={groupedOptions}
        value={dashboards.find(d => d.value === selectedDashboard)}
        onChange={(selected: any) => changeDashboard(selected.value)}
        isClearable={true}
        useFormatOptionLabel={true}
      />
    </div>
  )
}