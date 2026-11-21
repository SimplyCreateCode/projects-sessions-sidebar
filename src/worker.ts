// The plugin's worker: the panel cannot call project.list, workspace.list, agent.listSessions,
// terminal.focus or agent.resume itself (they are worker-only), so it asks here.
// Only Orca's host API is used: no `orca` CLI calls and no reading of agent files on disk.
import type { OrcaWorkerApi } from 'orca/worker'
import { buildTree, RESUMABLE_AGENTS, type RawAgent, type RawSession, type RawWorkspace, type TreeSnapshot } from './model'
import type { ActionResult, OpenSessionInput } from './protocol'

const DEFAULT_LIMIT = 200
/** At most this many workspaces are asked for their live agents per load. */
const MAX_AGENT_WORKSPACES = 40
const AGENT_CONCURRENCY = 6
const CHANGE_DEBOUNCE_MS = 1200

function codeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : 'action_failed'
}
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
function failed(error: unknown): ActionResult {
  return { ok: false, how: 'none', code: codeOf(error), message: messageOf(error) }
}

async function inBatches<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(run))))
  }
  return out
}

export async function loadTree(orca: OrcaWorkerApi, limit = DEFAULT_LIMIT): Promise<TreeSnapshot> {
  const missing: string[] = []
  const has = (method: string): boolean => {
    const ok = orca.host.has(method as never)
    if (!ok) missing.push(method)
    return ok
  }

  const [projects, workspaceAnswer] = await Promise.all([
    has('project.list') ? orca.host.call('project.list', {}).then((r) => r.projects) : Promise.resolve([]),
    has('workspace.list')
      ? orca.host.call('workspace.list', { includeStatus: true })
      : Promise.resolve({ workspaces: [] as RawWorkspace[], truncated: false })
  ])
  const workspaces = workspaceAnswer.workspaces as RawWorkspace[]
  let truncated = workspaceAnswer.truncated

  let sessions: RawSession[] = []
  if (has('agent.listSessions')) {
    try {
      const answer = await orca.host.call('agent.listSessions', { limit: Math.min(Math.max(limit, 1), 200) })
      sessions = answer.sessions
      truncated = truncated || answer.truncated
    } catch (error) {
      // History off, or not granted: the tree still shows live agents.
      missing.push(`agent.listSessions (${codeOf(error)})`)
    }
  }

  const agents: Record<string, RawAgent[]> = {}
  if (has('agents.list')) {
    const withTerminals = workspaces
      .filter((w) => (w.status?.terminalCount ?? 0) > 0)
      .sort((a, b) => (b.status?.lastActivityAt ?? 0) - (a.status?.lastActivityAt ?? 0))
      .slice(0, MAX_AGENT_WORKSPACES)
    await inBatches(withTerminals, AGENT_CONCURRENCY, async (workspace) => {
      try {
        const answer = await orca.host.call('agents.list', { workspaceId: workspace.id })
        if (answer.agents.length > 0) agents[workspace.id] = answer.agents
      } catch {
        // The workspace went away between the two calls; the next load corrects it.
      }
    })
    // Without per-workspace status (older Orca or a truncated list), at least the focused one.
    if (withTerminals.length === 0 && workspaceAnswer.workspaces.every((w) => !w.status)) {
      try {
        const context = await orca.host.call('workspace.readContext', {})
        if (context?.workspaceId) {
          const answer = await orca.host.call('agents.list', {})
          if (answer.agents.length > 0) agents[context.workspaceId] = answer.agents
        }
      } catch {
        // Nothing focused.
      }
    }
  }

  return buildTree({ projects, workspaces, sessions, agents, truncated, missing })
}

async function focusTerminal(orca: OrcaWorkerApi, terminalId: string): Promise<boolean> {
  try {
    return (await orca.host.call('terminal.focus', { terminalId })).focused
  } catch {
    return false
  }
}

export async function openSession(orca: OrcaWorkerApi, input: OpenSessionInput): Promise<ActionResult> {
  // 1. A live pane: focus it.
  if (input.terminalId && (await focusTerminal(orca, input.terminalId))) {
    return { ok: true, how: 'focused' }
  }
  // 2. A closed session Orca can resume: resume it in the workspace that owns its folder.
  if (input.sessionId && input.workspaceId && input.agent && RESUMABLE_AGENTS.includes(input.agent)) {
    try {
      const resumed = await orca.host.call('agent.resume', {
        workspaceId: input.workspaceId,
        agent: input.agent as never,
        sessionId: input.sessionId
      })
      await orca.host.call('workspace.open', { workspaceId: input.workspaceId }).catch(() => undefined)
      await focusTerminal(orca, resumed.terminalId)
      return { ok: true, how: resumed.started ? 'resumed' : 'focused' }
    } catch (error) {
      // Fall through to showing the workspace, but tell the panel why it did not resume.
      if (!input.workspaceId) return failed(error)
      try {
        await orca.host.call('workspace.open', { workspaceId: input.workspaceId })
        return { ok: false, how: 'opened', code: codeOf(error), message: messageOf(error) }
      } catch {
        return failed(error)
      }
    }
  }
  // 3. Anything else: show its workspace.
  if (input.workspaceId) {
    try {
      await orca.host.call('workspace.open', { workspaceId: input.workspaceId })
      return { ok: true, how: 'opened' }
    } catch (error) {
      return failed(error)
    }
  }
  return { ok: false, how: 'none', code: 'invalid_params', message: 'no terminal, session or workspace' }
}

export async function newSession(
  orca: OrcaWorkerApi,
  input: { workspaceId: string; agent: string }
): Promise<ActionResult> {
  try {
    const { terminalId } =
      input.agent === 'terminal'
        ? await orca.host.call('terminal.create', { workspaceId: input.workspaceId })
        : await orca.host.call('agent.launch', { workspaceId: input.workspaceId, agent: input.agent })
    await orca.host.call('workspace.open', { workspaceId: input.workspaceId }).catch(() => undefined)
    await focusTerminal(orca, terminalId)
    return { ok: true, how: 'started' }
  } catch (error) {
    return failed(error)
  }
}

export default function activate(orca: OrcaWorkerApi): void {
  orca.panels.handle('tree.load', async (input) => loadTree(orca, input?.limit ?? DEFAULT_LIMIT))
  orca.panels.handle('session.open', async (input) => openSession(orca, input))
  orca.panels.handle('project.newSession', async (input) => newSession(orca, input))
  orca.panels.handle('workspace.show', async ({ workspaceId }) => {
    try {
      await orca.host.call('workspace.open', { workspaceId })
      return { ok: true, how: 'opened' } satisfies ActionResult
    } catch (error) {
      return failed(error)
    }
  })
  orca.panels.handle('sidebar.toggle', async () => {
    try {
      await orca.host.call('commands.run', { action: 'sidebar.left.toggle' })
      return { ok: true, how: 'toggled' } satisfies ActionResult
    } catch (error) {
      return failed(error)
    }
  })

  // Coalesce bursts of events (an agent streaming status, a batch of worktrees) into one reload.
  let timer: ReturnType<typeof setTimeout> | null = null
  let reasons = new Set<string>()
  const changed = (reason: string): void => {
    reasons.add(reason)
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      const reason = [...reasons].join(',')
      reasons = new Set()
      orca.panels.post('tree.changed', { reason })
    }, CHANGE_DEBOUNCE_MS)
  }
  orca.events.on('agent.status.changed', () => changed('agent'))
  orca.events.on('workspace.created', () => changed('workspace'))
  orca.events.on('workspace.removed', () => changed('workspace'))
}
