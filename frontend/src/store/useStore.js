import { create } from 'zustand'
import { getStoredUser, api, clearAuth } from '../api/client'

const tokenFromStorage = () => typeof window !== 'undefined' ? localStorage.getItem('pondr_token') : null
const initialUser = getStoredUser()
const hasToken = !!tokenFromStorage()

export const useStore = create((set, get) => ({
  // Auth / User
  user: hasToken ? initialUser : null,
  token: tokenFromStorage() || null,
  authReady: false,
  setUser: (user) => set({ user }),
  setAuth: (user, token) => set({ user, token, authReady: true }),

  /** Clear token and user from storage and store; caller should navigate to / or /login */
  signOut: () => {
    clearAuth()
    set({ user: null, token: null })
  },

  // On app start: if token exists use stored user; if no token leave user null so Landing shows
  initAuth: async () => {
    const token = tokenFromStorage()
    const user = token ? getStoredUser() : null
    set({ user, token: token || null, authReady: true })
  },

  // Hubs (list from API)
  hubs: [],
  currentHubId: null,
  fetchHubs: async () => {
    const state = get()
    if (!state.user) return []
    try {
      const res = await api.get('/graph/hubs')
      const hubs = res.data.hubs || []
      set({ hubs })
      return hubs
    } catch (err) {
      console.error('Failed to fetch hubs:', err)
      return get().hubs
    }
  },
  selectHub: (hubId) => set({ currentHubId: hubId }),

  // Shared graph data cache (scoped by currentHubId when set)
  graphNodes: [],
  graphEdges: [],
  graphLoaded: false,
  graphLoading: false,
  currentTopic: '',
  fetchGraph: async (hubId = null, force = false) => {
    const state = get()
    if (!state.user) return { nodes: [], edges: [] }
    const effectiveHubId = hubId !== undefined && hubId !== null ? hubId : state.currentHubId
    const cacheValid = state.graphLoaded && !force && state.currentHubId === effectiveHubId
    if (cacheValid) return { nodes: state.graphNodes, edges: state.graphEdges }
    if (state.graphLoading) {
      return new Promise((resolve) => {
        const unsub = useStore.subscribe((s) => {
          if (!s.graphLoading) {
            unsub()
            resolve({ nodes: s.graphNodes, edges: s.graphEdges })
          }
        })
      })
    }
    set({ graphLoading: true, currentHubId: effectiveHubId })
    try {
      const url = effectiveHubId ? `/graph/canvas?hub_id=${effectiveHubId}` : '/graph/canvas'
      const res = await api.get(url)
      const nodes = res.data.nodes || []
      const edges = res.data.edges || []
      set({ graphNodes: nodes, graphEdges: edges, graphLoaded: true, graphLoading: false })
      return { nodes, edges }
    } catch (err) {
      console.error('Failed to fetch graph:', err)
      set({ graphLoading: false })
      return { nodes: get().graphNodes, edges: get().graphEdges }
    }
  },
  invalidateGraph: () => set({ graphLoaded: false }),

  // Search topic — creates a new hub and its graph
  searchTopic: async (topic) => {
    const state = get()
    if (!state.user || !topic.trim()) return { nodes: [], edges: [], hub_id: null }
    set({ graphLoading: true, graphNodes: [], graphEdges: [], graphLoaded: false, currentTopic: topic })
    try {
      const res = await api.post('/graph/search', { topic })
      const hubId = res.data.hub_id || null
      if (!hubId) {
        set({ graphLoading: false })
        return { nodes: [], edges: [], hub_id: null }
      }
      // Refresh hubs list so UI shows the new hub
      try {
        const hubsRes = await api.get('/graph/hubs')
        set({ hubs: hubsRes.data.hubs || [] })
      } catch (_) {}
      // Try to load canvas; if this fails (e.g. ECONNRESET), still return hub_id so Canvas can load it on mount
      let nodes = []
      let edges = []
      try {
        const canvasRes = await api.get(`/graph/canvas?hub_id=${hubId}`)
        nodes = canvasRes.data.nodes || []
        edges = canvasRes.data.edges || []
      } catch (canvasErr) {
        console.warn('Canvas fetch after search failed (will retry on Canvas):', canvasErr.message)
      }
      set({
        currentHubId: hubId,
        graphNodes: nodes,
        graphEdges: edges,
        graphLoaded: nodes.length > 0,
        graphLoading: false,
      })
      return { nodes, edges, hub_id: hubId }
    } catch (err) {
      console.error('Search failed:', err)
      set({ graphLoading: false })
      return { nodes: [], edges: [], hub_id: null }
    }
  },

  // Gamification (streak, level, XP) — set by useGamification hook
  gamification: {},
  setGamification: (data) => set({ gamification: data || {} }),

  // Sidebar
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}))
