import { create } from 'zustand'

type State = {
  options: { rankdir: string },
  sidebarActive: boolean,
  loading: boolean
}

type Action = {
  setOptions: (v:any) => void,
  setSidebarActive: (v:boolean) => void,
  setLoading: (v:boolean) => void
}

export const useStore = create<State & Action>()((set) => ({
  options: {rankdir: 'LR'},
  sidebarActive: false,
  loading: false,
  setOptions: (v:any) => set({options: v}),
  setSidebarActive: (v:boolean) => set({sidebarActive: v}),
  setLoading: (v:boolean) => set({loading: v})
}));
