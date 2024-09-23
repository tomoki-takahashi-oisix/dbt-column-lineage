import { create } from 'zustand'
import { Edge } from 'reactflow'

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
  setOptions: (v:any) => set({options: v}),
  setShowColumn: (v:boolean) => set({showColumn: v}),
  setSidebarActive: (v:boolean) => set({sidebarActive: v}),
  setLoading: (v:boolean) => set({loading: v}),
  setClearNodePosition: (v: boolean) => set({ clearNodePosition: v }),
  setColumnModeEdges: (v: Edge[]) => set({ columnModeEdges: v }),
  setLeftMaxDepth: (v: boolean) => set({ leftMaxDepth: v }),
  setRightMaxDepth: (v: boolean) => set({ rightMaxDepth: v }),
  setMessage: (message, type) => set({ message, messageType: type }),
}))
