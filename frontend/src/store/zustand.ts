import { create } from 'zustand'

type State = {
  options: { rankdir: string },
  sidebarActive: boolean
}

type Action = {
  setOptions: (v:any) => void,
  setSidebarActive: (v:boolean) => void
}

export const useStore = create<State & Action>()((set) => ({
  options: {rankdir: 'LR'},
  sidebarActive: false,
  setOptions: (v:any) => set({options: v}),
  setSidebarActive: (v:boolean) => set({sidebarActive: v})
}));
