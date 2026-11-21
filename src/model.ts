// Pure data shaping: Orca's host API answers in, one project -> sessions tree out.
// No `orca` imports here, so the worker and the panel (and plain tests) can share it.

export type SessionState = 'working' | 'blocked' | 'waiting' | 'done' | 'closed'

export interface SessionRow {
  /** Unique across the whole tree. */
  key: string
  sessionId: string | null
  agent: string | null
  title: string
  workspaceId: string | null
  workspaceName: string | null
  /** Branch of the worktree the session ran in. */
  branch: string | null
  /** True when the session ran in the project's main checkout (no branch tag shown). */
  onPrimary: boolean
  updatedAt: number
  state: SessionState
  /** An Orca terminal runs it now. */
  live: boolean
  terminalId: string | null
  messageCount: number | null
  /** `agent.resume` can reopen it. */
  resumable: boolean
}

export interface WorkspaceNode {
  id: string
  name: string
  branch: string | null
  primary: boolean
  state: string | null
  unread: boolean
}

export interface ProjectNode {
  id: string
  name: string
  kind: 'git' | 'folder'
  hostId: string | null
  path: string
  hidden: boolean
  /** Where + starts a session: the main checkout's workspace, or null if Orca has none. */
  primaryWorkspaceId: string | null
  workspaces: WorkspaceNode[]
  sessions: SessionRow[]
  lastActivityAt: number | null
}

export interface TreeSnapshot {
  projects: ProjectNode[]
  /** Sessions Orca could not tie to a workspace of a listed project. */
  unassigned: SessionRow[]
  loadedAt: number
  truncated: boolean
  /** Host methods this Orca lacks or refused, so the panel can say what is missing. */
  missing: string[]
}

// Raw shapes, as the host API documents them (only the fields used here).
export interface RawProject {
  id: string
  name: string
  kind: 'git' | 'folder'
  hostId: string | null
  path: string
  hidden?: boolean
}
export interface RawWorkspace {
  id: string
  kind: 'worktree' | 'folder'
  name: string
  projectId?: string | null
  path: string
  branch: string | null
  hostId: string | null
  status?: { state: string; unread: boolean; terminalCount: number; lastActivityAt: number | null }
}
export interface RawSession {
  sessionId: string
  agent: string
  title: string
  workspaceId: string | null
  hostId: string
  branch: string | null
  createdAt: number | null
  updatedAt: number
  messageCount: number
  totalTokens: number
  running: boolean
}
export interface RawAgent {
  terminalId: string | null
  title: string | null
  agent: string | null
  state: 'working' | 'blocked' | 'waiting' | 'done'
  stateStartedAt: number
  sessionId?: string | null
}

/** Agents `agent.resume` takes (host API 1.10). */
export const RESUMABLE_AGENTS: readonly string[] = [
  'claude', 'codebuddy', 'codex', 'qoder', 'qoder-cn', 'qwen-code', 'gemini', 'antigravity',
  'opencode', 'opencode2', 'pi', 'mimo-code', 'droid', 'grok', 'devin', 'omp', 'prime-agent',
  'copilot', 'cursor', 'kimi', 'muse', 'zcode', 'dsh', 'jcode', 'kiro', 'hermes'
]

export function normalizePath(path: string): string {
  const slashed = path.replace(/\\/g, '/')
  const trimmed = slashed.length > 1 ? slashed.replace(/\/+$/, '') : slashed
  // Windows drive letters and paths compare case-insensitively.
  return /^[a-zA-Z]:/.test(trimmed) ? trimmed.toLowerCase() : trimmed
}

function cleanTitle(title: string | null | undefined, fallback: string): string {
  const text = (title ?? '').replace(/\s+/g, ' ').trim()
  return text || fallback
}

export function buildTree(input: {
  projects: RawProject[]
  workspaces: RawWorkspace[]
  sessions: RawSession[]
  /** Live agents per workspace id. */
  agents: Record<string, RawAgent[]>
  truncated?: boolean
  missing?: string[]
  now?: number
}): TreeSnapshot {
  const now = input.now ?? Date.now()
  const projectById = new Map<string, ProjectNode>()
  for (const project of input.projects) {
    projectById.set(project.id, {
      id: project.id,
      name: project.name,
      kind: project.kind,
      hostId: project.hostId,
      path: project.path,
      hidden: project.hidden === true,
      primaryWorkspaceId: null,
      workspaces: [],
      sessions: [],
      lastActivityAt: null
    })
  }

  const workspaceById = new Map<string, { raw: RawWorkspace; project: ProjectNode | null; primary: boolean }>()
  for (const workspace of input.workspaces) {
    const project = workspace.projectId ? (projectById.get(workspace.projectId) ?? null) : null
    const primary =
      project !== null &&
      (workspace.kind === 'folder' || normalizePath(workspace.path) === normalizePath(project.path))
    workspaceById.set(workspace.id, { raw: workspace, project, primary })
    if (project) {
      project.workspaces.push({
        id: workspace.id,
        name: workspace.name,
        branch: workspace.branch,
        primary,
        state: workspace.status?.state ?? null,
        unread: workspace.status?.unread === true
      })
      if (primary && project.primaryWorkspaceId === null) project.primaryWorkspaceId = workspace.id
      const activity = workspace.status?.lastActivityAt ?? null
      if (activity !== null && (project.lastActivityAt === null || activity > project.lastActivityAt)) {
        project.lastActivityAt = activity
      }
    }
  }
  for (const project of projectById.values()) {
    // No main checkout listed: + falls back to the first workspace so it still works.
    if (project.primaryWorkspaceId === null && project.workspaces.length > 0) {
      project.primaryWorkspaceId = project.workspaces[0].id
    }
    project.workspaces.sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name))
  }

  // Live agents, keyed by session id where they report one.
  const liveBySession = new Map<string, { agent: RawAgent; workspaceId: string }>()
  const liveWithoutHistory: { agent: RawAgent; workspaceId: string }[] = []
  for (const [workspaceId, agents] of Object.entries(input.agents)) {
    for (const agent of agents) {
      if (agent.sessionId) liveBySession.set(agent.sessionId, { agent, workspaceId })
      else liveWithoutHistory.push({ agent, workspaceId })
    }
  }

  const unassigned: SessionRow[] = []
  const seenSessions = new Set<string>()
  const place = (row: SessionRow): void => {
    const owner = row.workspaceId ? workspaceById.get(row.workspaceId) : undefined
    const project = owner?.project ?? null
    if (!project) {
      unassigned.push(row)
      return
    }
    project.sessions.push(row)
    if (project.lastActivityAt === null || row.updatedAt > project.lastActivityAt) {
      project.lastActivityAt = row.updatedAt
    }
  }
  const describeWorkspace = (workspaceId: string | null, branch: string | null) => {
    const owner = workspaceId ? workspaceById.get(workspaceId) : undefined
    return {
      workspaceName: owner?.raw.name ?? null,
      branch: owner?.raw.branch ?? branch,
      onPrimary: owner ? owner.primary : true
    }
  }

  for (const session of input.sessions) {
    if (seenSessions.has(session.sessionId)) continue
    seenSessions.add(session.sessionId)
    const live = liveBySession.get(session.sessionId)
    const workspaceId = session.workspaceId ?? live?.workspaceId ?? null
    place({
      key: `s:${session.sessionId}`,
      sessionId: session.sessionId,
      agent: session.agent || live?.agent.agent || null,
      title: cleanTitle(session.title, live?.agent.title ?? session.agent),
      workspaceId,
      ...describeWorkspace(workspaceId, session.branch),
      updatedAt: Math.max(session.updatedAt, live?.agent.stateStartedAt ?? 0),
      state: live ? live.agent.state : session.running ? 'working' : 'closed',
      live: live !== undefined || session.running,
      terminalId: live?.agent.terminalId ?? null,
      messageCount: session.messageCount,
      resumable: RESUMABLE_AGENTS.includes(session.agent)
    })
  }
  // Live agents the history does not list (yet): new sessions, or agents without history.
  for (const [sessionId, live] of liveBySession) {
    if (seenSessions.has(sessionId)) continue
    liveWithoutHistory.push(live)
  }
  for (const { agent, workspaceId } of liveWithoutHistory) {
    place({
      key: `t:${agent.terminalId ?? `${workspaceId}:${agent.sessionId ?? agent.stateStartedAt}`}`,
      sessionId: agent.sessionId ?? null,
      agent: agent.agent,
      title: cleanTitle(agent.title, agent.agent ?? 'Agent'),
      workspaceId,
      ...describeWorkspace(workspaceId, null),
      updatedAt: agent.stateStartedAt || now,
      state: agent.state,
      live: true,
      terminalId: agent.terminalId,
      messageCount: null,
      resumable: false
    })
  }

  const byNewest = (a: SessionRow, b: SessionRow) => b.updatedAt - a.updatedAt
  for (const project of projectById.values()) project.sessions.sort(byNewest)
  unassigned.sort(byNewest)

  return {
    projects: [...projectById.values()],
    unassigned,
    loadedAt: now,
    truncated: input.truncated === true,
    missing: input.missing ?? []
  }
}

// ---------------------------------------------------------------------------------------------
// Filtering and sorting, used by the panel.

export type StatusFilter = 'all' | 'live' | 'attention' | 'closed'
export type ProjectSort = 'activity' | 'name'

export interface ViewOptions {
  query: string
  status: StatusFilter
  agent: string
  sort: ProjectSort
  showEmpty: boolean
  showHidden: boolean
}

export function needsAttention(row: SessionRow): boolean {
  return row.live && (row.state === 'blocked' || row.state === 'waiting')
}

function matchesStatus(row: SessionRow, status: StatusFilter): boolean {
  switch (status) {
    case 'live':
      return row.live
    case 'attention':
      return needsAttention(row)
    case 'closed':
      return !row.live
    default:
      return true
  }
}

/** Every word of the query must appear in the haystack (case-insensitive). */
export function matchesQuery(haystack: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const text = haystack.toLowerCase()
  return words.every((word) => text.includes(word))
}

export interface ProjectView {
  project: ProjectNode
  sessions: SessionRow[]
  /** The project itself matched the query (name or path), so its sessions are not narrowed by it. */
  projectMatched: boolean
}

export function viewProjects(tree: TreeSnapshot, options: ViewOptions): ProjectView[] {
  const query = options.query.trim()
  const filtering = query !== '' || options.status !== 'all' || options.agent !== ''
  const views: ProjectView[] = []
  for (const project of tree.projects) {
    if (project.hidden && !options.showHidden) continue
    const projectMatched = query !== '' && matchesQuery(`${project.name} ${project.path}`, query)
    const sessions = project.sessions.filter(
      (row) =>
        matchesStatus(row, options.status) &&
        (options.agent === '' || row.agent === options.agent) &&
        (query === '' || projectMatched || matchesQuery(sessionHaystack(row), query))
    )
    const onlyQuery = options.status === 'all' && options.agent === ''
    const keep = filtering
      ? sessions.length > 0 || (projectMatched && onlyQuery)
      : project.sessions.length > 0 || options.showEmpty
    if (!keep) continue
    views.push({ project, sessions, projectMatched })
  }
  views.sort((a, b) =>
    options.sort === 'name'
      ? a.project.name.localeCompare(b.project.name)
      : (b.project.lastActivityAt ?? 0) - (a.project.lastActivityAt ?? 0) ||
        a.project.name.localeCompare(b.project.name)
  )
  return views
}

export function viewUnassigned(tree: TreeSnapshot, options: ViewOptions): SessionRow[] {
  const query = options.query.trim()
  return tree.unassigned.filter(
    (row) =>
      matchesStatus(row, options.status) &&
      (options.agent === '' || row.agent === options.agent) &&
      (query === '' || matchesQuery(sessionHaystack(row), query))
  )
}

function sessionHaystack(row: SessionRow): string {
  return [row.title, row.agent, row.branch, row.workspaceName].filter(Boolean).join(' ')
}

export function agentsIn(tree: TreeSnapshot): string[] {
  const agents = new Set<string>()
  for (const project of tree.projects) for (const row of project.sessions) if (row.agent) agents.add(row.agent)
  for (const row of tree.unassigned) if (row.agent) agents.add(row.agent)
  return [...agents].sort()
}

/** Applies one `agent.status.changed` to a snapshot; null when no row matches (reload instead). */
export function patchAgentStatus(
  tree: TreeSnapshot,
  event: { terminalId?: string; sessionId?: string; state: SessionState; receivedAt: number }
): TreeSnapshot | null {
  let hit = false
  const patch = (row: SessionRow): SessionRow => {
    const same =
      (event.terminalId !== undefined && row.terminalId === event.terminalId) ||
      (event.sessionId !== undefined && row.sessionId === event.sessionId)
    if (!same) return row
    hit = true
    return {
      ...row,
      state: event.state,
      live: true,
      terminalId: event.terminalId ?? row.terminalId,
      updatedAt: Math.max(row.updatedAt, event.receivedAt)
    }
  }
  const projects = tree.projects.map((project) => {
    const sessions = project.sessions.map(patch)
    return sessions.some((row, i) => row !== project.sessions[i]) ? { ...project, sessions } : project
  })
  const unassigned = tree.unassigned.map(patch)
  return hit ? { ...tree, projects, unassigned } : null
}
