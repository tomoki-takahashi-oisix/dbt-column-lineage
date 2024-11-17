import { create } from 'zustand'
import { Edge } from 'reactflow'

export type SourceModeType = 'dbt' | 'looker'
type MessageType = 'success' | 'error' | 'info'

type State = {
  options: { rankdir: string }
  showColumn: boolean
  sidebarActive: boolean
  loading: boolean
  clearNodePosition: boolean
  columnModeEdges: Edge[]
  leftMaxDepth: boolean
  rightMaxDepth: boolean
  message: string | null
  messageType: MessageType | null
  sourceMode: SourceModeType
  submitClicked: boolean
  isSubmitDisabled: boolean
  headerSearchDisplayMessage: string
}

type Action = {
  setOptions: (v:any) => void
  setShowColumn: (v:boolean) => void
  setSidebarActive: (v:boolean) => void
  setLoading: (v:boolean) => void
  setClearNodePosition: (v: boolean) => void
  setColumnModeEdges: (v: Edge[]) => void
  setLeftMaxDepth: (v: boolean) => void
  setRightMaxDepth: (v: boolean) => void
  setMessage: (message: string | null, type: MessageType | null) => void
  setSourceMode: (mode: SourceModeType) => void
  triggerSubmitClicked: () => void
  resetSubmitClicked: () => void
  setIsSubmitDisabled: (v: boolean) => void
  setHeaderSearchDisplayMessage: (v: string) => void
}

export const useStore = create<State & Action>()((set) => ({
  options: { rankdir: 'LR' },
  showColumn: true,
  sidebarActive: false,
  loading: false,
  clearNodePosition: false,
  columnModeEdges: [],
  leftMaxDepth: false,
  rightMaxDepth: false,
  message: null,
  messageType: null,
  sourceMode: 'dbt',
  submitClicked: false,
  isSubmitDisabled: false,
  headerSearchDisplayMessage: 'Select search model',
  setOptions: (v:any) => set({options: v}),
  setShowColumn: (v:boolean) => set({showColumn: v}),
  setSidebarActive: (v:boolean) => set({sidebarActive: v}),
  setLoading: (v:boolean) => set({loading: v}),
  setClearNodePosition: (v: boolean) => set({ clearNodePosition: v }),
  setColumnModeEdges: (v: Edge[]) => set({ columnModeEdges: v }),
  setLeftMaxDepth: (v: boolean) => set({ leftMaxDepth: v }),
  setRightMaxDepth: (v: boolean) => set({ rightMaxDepth: v }),
  setMessage: (message, type) => set({ message, messageType: type }),
  setSourceMode: (mode) => set({ sourceMode: mode }),
  triggerSubmitClicked: () => set({ submitClicked: true }),
  resetSubmitClicked: () => set({ submitClicked: false }),
  setIsSubmitDisabled: (v: boolean) => set({ isSubmitDisabled: v }),
  setHeaderSearchDisplayMessage: (v: string) => set({ headerSearchDisplayMessage: v }),
}))
