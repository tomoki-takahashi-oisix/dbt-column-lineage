import { create } from 'zustand'

type State = {
  options: { rankdir: string, },
  showColumn: boolean,
  sidebarActive: boolean,
  loading: boolean
}

type Action = {
  setOptions: (v:any) => void,
  setShowColumn: (v:boolean) => void,
  setSidebarActive: (v:boolean) => void,
  setLoading: (v:boolean) => void
}

export const useStore = create<State & Action>()((set) => ({
  options: {rankdir: 'LR'},
  showColumn: true,
  sidebarActive: false,
  loading: false,
  setOptions: (v:any) => set({options: v}),
  setShowColumn: (v:boolean) => set({showColumn: v}),
  setSidebarActive: (v:boolean) => set({sidebarActive: v}),
  setLoading: (v:boolean) => set({loading: v})
}));
