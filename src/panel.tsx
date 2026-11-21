// Projects & Sessions: a project-first view of every agent session, as asked for in
// github.com/stablyai/orca/discussions/25461. A components panel: Orca draws it with its own
// controls, so it follows the theme and keyboard rules. No build step.
import {
  atom,
  Badge,
  Box,
  Button,
  Callout,
  Collapsible,
  derived,
  EmptyState,
  env,
  IconButton,
  Input,
  List,
  ListItem,
  on,
  plugin,
  read,
  RelativeTime,
  Row,
  Select,
  set,
  Skeleton,
  Stack,
  Switch,
  Text,
  update,
  type PanelContext
} from 'orca'
import { agentName, strings } from './i18n'
import {
  agentsIn,
  needsAttention,
  patchAgentStatus,
  viewProjects,
  viewUnassigned,
  type ProjectNode,
  type ProjectSort,
  type SessionRow,
  type StatusFilter,
  type TreeSnapshot,
  type ViewOptions
} from './model'
import type { ActionResult } from './protocol'

const PAGE = 5
const PAGE_STEP = 10
const RELOAD_DEBOUNCE_MS = 250
const UNASSIGNED = '__unassigned__'
const NEW_AGENTS = ['claude', 'codex', 'gemini', 'opencode', 'copilot', 'cursor', 'kimi', 'terminal']

// What Orca told us, this run.
const tree = atom<TreeSnapshot | null>(null)
const loadError = atom<string | null>(null)
const actionError = atom<string | null>(null)
const busy = atom<string | null>(null)
const focusedWorkspace = atom<string | null>(null)
/** Rows shown per project beyond the first page (key: project id). */
const shown = atom<Record<string, number>>({})

// What the person chose; kept across runs.
const query = atom('pss.query', '', { persist: 'plugin' })
const status = atom<StatusFilter>('pss.status', 'all', { persist: 'plugin' })
const agentFilter = atom('pss.agent', '', { persist: 'plugin' })
const sort = atom<ProjectSort>('pss.sort', 'activity', { persist: 'plugin' })
const newAgent = atom('pss.newAgent', 'claude', { persist: 'plugin' })
const showEmpty = atom('pss.showEmpty', true, { persist: 'plugin' })
const showHidden = atom('pss.showHidden', false, { persist: 'plugin' })
/** Project id -> open. Unset projects start open when they have a live session. */
const expanded = atom<Record<string, boolean>>('pss.expanded', {}, { persist: 'plugin' })

const options = derived<ViewOptions>(() => ({
  query: read(query),
  status: read(status),
  agent: read(agentFilter),
  sort: read(sort),
  showEmpty: read(showEmpty),
  showHidden: read(showHidden)
}))

const t = () => strings(env.locale)

// ---------------------------------------------------------------------------------------------
// Data

let reloadTimer: ReturnType<typeof setTimeout> | null = null
let loading = false
let again = false

export async function reload(): Promise<void> {
  if (loading) {
    again = true
    return
  }
  loading = true
  try {
    set(tree, await plugin.request('tree.load', { limit: 200 }, { timeoutMs: 30_000 }))
    set(loadError, null)
  } catch (error) {
    set(loadError, error instanceof Error ? error.message : String(error))
  } finally {
    loading = false
    if (again) {
      again = false
      void reload()
    }
  }
}

function scheduleReload(): void {
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => {
    reloadTimer = null
    void reload()
  }, RELOAD_DEBOUNCE_MS)
}

async function act(key: string, run: () => Promise<ActionResult>): Promise<void> {
  if (read(busy)) return
  set(busy, key)
  set(actionError, null)
  try {
    const result = await run()
    if (!result.ok) {
      set(actionError, result.how === 'opened' ? t().resumeFailed : `${t().failed}: ${result.message ?? result.code}`)
    }
  } catch (error) {
    set(actionError, `${t().failed}: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    set(busy, null)
    scheduleReload()
  }
}

function openRow(row: SessionRow): void {
  void act(row.key, () =>
    plugin.request('session.open', {
      terminalId: row.terminalId,
      workspaceId: row.workspaceId,
      sessionId: row.sessionId,
      agent: row.agent
    })
  )
}

function startIn(project: ProjectNode, agent: string): void {
  const workspaceId = project.primaryWorkspaceId
  if (!workspaceId) {
    set(actionError, t().noWorkspace)
    return
  }
  void act(`new:${project.id}`, () => plugin.request('project.newSession', { workspaceId, agent }))
}

export function setup(ctx: PanelContext): () => void {
  ctx.subscriptions.push(
    plugin.on('tree.changed', () => scheduleReload()),
    // Status flips show at once; the worker's debounced tree.changed fills in the rest.
    on('agent.status.changed', (event) => {
      const current = read(tree)
      const patched = current
        ? patchAgentStatus(current, {
            terminalId: event.terminalId,
            sessionId: event.sessionId,
            state: event.state,
            receivedAt: event.receivedAt
          })
        : null
      if (patched) set(tree, patched)
      else scheduleReload()
    }),
    on('workspace.changed', ({ context }) => {
      const id = context?.workspaceId ?? null
      if (id !== read(focusedWorkspace)) set(focusedWorkspace, id)
    })
  )
  void reload()
  return () => {
    if (reloadTimer) clearTimeout(reloadTimer)
  }
}

// ---------------------------------------------------------------------------------------------
// View

const STATE_TONE: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'danger'> = {
  working: 'accent',
  blocked: 'danger',
  waiting: 'warning',
  done: 'success',
  closed: 'neutral'
}
const STATE_ICON = {
  working: 'activity',
  blocked: 'warning',
  waiting: 'bell',
  done: 'check',
  closed: 'file-text'
} as const

function isOpen(project: ProjectNode, forced: boolean): boolean {
  if (forced) return true
  const chosen = read(expanded)[project.id]
  if (chosen !== undefined) return chosen
  return project.sessions.some((row) => row.live) || project.id === focusedProjectId()
}

function focusedProjectId(): string | null {
  const id = read(focusedWorkspace)
  const current = read(tree)
  if (!id || !current) return null
  return current.projects.find((p) => p.workspaces.some((w) => w.id === id))?.id ?? null
}

function SessionItem({ row }: { row: SessionRow }) {
  const s = t()
  const here = row.live && row.workspaceId !== null && row.workspaceId === read(focusedWorkspace)
  return (
    <ListItem
      key={row.key}
      title={row.title}
      icon={STATE_ICON[row.state]}
      current={here}
      disabled={read(busy) !== null}
      onPress={() => openRow(row)}
    >
      <Row gap="xs" wrap>
        <Badge tone={STATE_TONE[row.state]}>{s.state[row.state] ?? row.state}</Badge>
        {!row.onPrimary && row.branch ? <Badge tone="neutral">{row.branch}</Badge> : null}
        <Text size="xs" muted>
          {agentName(row.agent)}
        </Text>
        <RelativeTime at={row.updatedAt} format="short" muted />
      </Row>
    </ListItem>
  )
}

function SessionList({ id, label, rows }: { id: string; label: string; rows: SessionRow[] }) {
  const s = t()
  const extra = read(shown)[id] ?? 0
  const limit = PAGE + extra
  const visible = rows.slice(0, limit)
  const rest = rows.length - visible.length
  return (
    <Stack gap="xs">
      {visible.length > 0 ? (
        <List label={label}>
          {visible.map((row) => (
            <SessionItem key={row.key} row={row} />
          ))}
        </List>
      ) : null}
      {rest > 0 || extra > 0 ? (
        <Row gap="xs">
          {rest > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              icon="expand"
              onPress={() => update(shown, (m) => ({ ...m, [id]: (m[id] ?? 0) + PAGE_STEP }))}
            >
              {s.showMore(Math.min(rest, PAGE_STEP))}
            </Button>
          ) : null}
          {extra > 0 ? (
            <Button variant="ghost" size="sm" icon="collapse" onPress={() => update(shown, (m) => ({ ...m, [id]: 0 }))}>
              {s.showLess}
            </Button>
          ) : null}
        </Row>
      ) : null}
    </Stack>
  )
}

function ProjectBlock({ project, rows, filtering }: { project: ProjectNode; rows: SessionRow[]; filtering: boolean }) {
  const s = t()
  const open = isOpen(project, filtering)
  const live = project.sessions.filter((row) => row.live).length
  const attention = project.sessions.filter(needsAttention).length
  const agent = read(newAgent)
  const isHere = project.id === focusedProjectId()
  const starting = read(busy) === `new:${project.id}`
  const unread = project.workspaces.some((w) => w.unread)
  return (
    <Box key={project.id} gap="xs">
      <Row gap="xs" justify="between">
        <Row gap="xs">
          <IconButton
            icon={open ? 'collapse' : 'expand'}
            label={open ? s.collapse(project.name) : s.expand(project.name)}
            variant="ghost"
            size="sm"
            onPress={() => update(expanded, (m) => ({ ...m, [project.id]: !open }))}
          />
          <Text weight="semibold" truncate>
            {project.name}
          </Text>
          {!open ? (
            <Text size="xs" muted>
              {project.sessions.length}
            </Text>
          ) : null}
          {isHere ? <Badge tone="accent">{s.here}</Badge> : null}
          {unread ? <Badge tone="accent">{s.unread}</Badge> : null}
          {attention > 0 ? <Badge tone="warning">{s.attentionCount(attention)}</Badge> : null}
          {live > 0 ? <Badge tone="success">{s.liveCount(live)}</Badge> : null}
          {project.hidden ? <Badge tone="neutral">{s.hidden}</Badge> : null}
        </Row>
        <Row gap="none">
          {project.primaryWorkspaceId ? (
            <IconButton
              icon="open-external"
              label={s.openWorkspace(project.name)}
              variant="ghost"
              size="sm"
              onPress={() => {
                const workspaceId = project.primaryWorkspaceId as string
                void act(`ws:${project.id}`, () => plugin.request('workspace.show', { workspaceId }))
              }}
            />
          ) : null}
          <IconButton
            icon="add"
            label={agent === 'terminal' ? s.newTerminalIn(project.name) : s.newSessionIn(agentName(agent), project.name)}
            variant="ghost"
            size="sm"
            disabled={starting || !project.primaryWorkspaceId}
            onPress={() => startIn(project, agent)}
          />
        </Row>
      </Row>
      {open ? (
        rows.length > 0 ? (
          <SessionList id={project.id} label={project.name} rows={rows} />
        ) : (
          <Text size="xs" muted>
            {s.sessionsCount(0)}
          </Text>
        )
      ) : null}
    </Box>
  )
}

function Filters() {
  const s = t()
  const current = read(tree)
  const agents = current ? agentsIn(current) : []
  return (
    <Stack gap="xs">
      <Row gap="xs">
        <Box grow>
          <Input
            label={s.search}
            labelHidden
            type="search"
            placeholder={s.searchPlaceholder}
            value={read(query)}
            onChange={(value) => set(query, value)}
          />
        </Box>
        <IconButton icon="refresh" label={s.refresh} variant="ghost" onPress={() => void reload()} />
        <IconButton
          icon="layers"
          label={s.toggleSidebar}
          variant="ghost"
          onPress={() => void act('sidebar', () => plugin.request('sidebar.toggle'))}
        />
      </Row>
      <Row gap="xs" wrap>
        <Select
          label={s.status}
          labelHidden
          value={read(status)}
          options={[
            { value: 'all', label: s.statusAll },
            { value: 'live', label: s.statusLive },
            { value: 'attention', label: s.statusAttention },
            { value: 'closed', label: s.statusClosed }
          ]}
          onChange={(value) => set(status, value as StatusFilter)}
        />
        <Select
          label={s.agentFilter}
          labelHidden
          value={read(agentFilter) || '*'}
          options={[{ value: '*', label: s.agentAll }, ...agents.map((a) => ({ value: a, label: agentName(a) }))]}
          onChange={(value) => set(agentFilter, value === '*' ? '' : value)}
        />
      </Row>
      <Collapsible title={s.options}>
        <Stack gap="xs">
          <Select
            label={s.newAgent}
            value={read(newAgent)}
            options={NEW_AGENTS.map((a) => ({ value: a, label: a === 'terminal' ? s.terminal : agentName(a) }))}
            onChange={(value) => set(newAgent, value)}
          />
          <Select
            label={s.sort}
            value={read(sort)}
            options={[
              { value: 'activity', label: s.sortActivity },
              { value: 'name', label: s.sortName }
            ]}
            onChange={(value) => set(sort, value as ProjectSort)}
          />
          <Switch label={s.showEmpty} checked={read(showEmpty)} onChange={(v) => set(showEmpty, v)} />
          <Switch label={s.showHidden} checked={read(showHidden)} onChange={(v) => set(showHidden, v)} />
          <Row gap="xs" wrap>
            <Button
              variant="outline"
              size="sm"
              icon="expand"
              onPress={() =>
                set(expanded, Object.fromEntries((read(tree)?.projects ?? []).map((p) => [p.id, true])))
              }
            >
              {s.expandAll}
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon="collapse"
              onPress={() =>
                set(expanded, Object.fromEntries((read(tree)?.projects ?? []).map((p) => [p.id, false])))
              }
            >
              {s.collapseAll}
            </Button>
          </Row>
        </Stack>
      </Collapsible>
    </Stack>
  )
}

export default function Panel() {
  const s = t()
  const current = read(tree)
  const error = read(loadError)
  const opts = read(options)
  const filtering = opts.query.trim() !== '' || opts.status !== 'all' || opts.agent !== ''

  if (!current) {
    return (
      <Stack gap="sm">
        <Filters />
        {error ? (
          <Callout tone="danger" title={s.failed}>
            <Text>{error}</Text>
          </Callout>
        ) : (
          <Skeleton shape="text" lines={6} label={s.loading} />
        )}
      </Stack>
    )
  }

  const projects = viewProjects(current, opts)
  const others = viewUnassigned(current, opts)
  const all = [...current.projects.flatMap((p) => p.sessions), ...current.unassigned]
  const live = all.filter((row) => row.live).length
  const attention = all.filter(needsAttention).length
  const historyMissing = current.missing.some((m) => m.startsWith('agent.listSessions'))

  return (
    <Stack gap="sm">
      <Filters />
      <Text size="xs" muted>
        {s.summary(current.projects.filter((p) => !p.hidden).length, live, attention)}
      </Text>
      {read(actionError) ? (
        <Callout tone="warning" title={s.failed}>
          <Text>{read(actionError)}</Text>
        </Callout>
      ) : null}
      {error ? (
        <Callout tone="danger" title={s.failed}>
          <Text>{error}</Text>
        </Callout>
      ) : null}
      {historyMissing ? (
        <Callout tone="neutral" icon="info">
          <Text size="sm">{s.historyMissing}</Text>
        </Callout>
      ) : null}
      {current.projects.length === 0 && current.unassigned.length === 0 ? (
        <EmptyState title={s.nothing} description={s.nothingHint} icon="folder" />
      ) : projects.length === 0 && others.length === 0 ? (
        <EmptyState title={s.noMatch} description={s.noMatchHint} icon="search">
          <Button
            variant="outline"
            onPress={() => {
              set(query, '')
              set(status, 'all')
              set(agentFilter, '')
            }}
          >
            {s.clearFilters}
          </Button>
        </EmptyState>
      ) : (
        <Stack gap="sm">
          {projects.map(({ project, sessions }) => (
            <ProjectBlock key={project.id} project={project} rows={sessions} filtering={filtering} />
          ))}
          {others.length > 0 ? (
            <Collapsible key={UNASSIGNED} title={s.unassigned} description={s.unassignedHint} defaultOpen={filtering}>
              <SessionList id={UNASSIGNED} label={s.unassigned} rows={others} />
            </Collapsible>
          ) : null}
        </Stack>
      )}
      {current.truncated ? (
        <Text size="xs" muted>
          {s.truncated}
        </Text>
      ) : null}
    </Stack>
  )
}
