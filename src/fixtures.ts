// Sample host answers for tests and `orca plugin check` scenarios (never loaded by Orca itself).
const NOW = 1_795_000_000_000
const MIN = 60_000

export const fixtureNow = NOW

export const projects = {
  projects: [
    { id: 'p-shop', name: 'webshop', kind: 'git', hostId: 'local', path: '/home/me/code/webshop' },
    { id: 'p-docs', name: 'docs', kind: 'folder', hostId: 'local', path: '/home/me/notes/docs' },
    { id: 'p-empty', name: 'old-tool', kind: 'git', hostId: 'local', path: '/home/me/code/old-tool' },
    { id: 'p-hidden', name: 'secret-lab', kind: 'git', hostId: 'local', path: '/home/me/lab', hidden: true }
  ],
  truncated: false
} as const

export const workspaces = {
  workspaces: [
    {
      id: 'w-shop-main',
      kind: 'worktree',
      name: 'webshop',
      project: 'webshop',
      projectId: 'p-shop',
      path: '/home/me/code/webshop',
      branch: 'main',
      hostId: 'local',
      status: { state: 'working', unread: false, terminalCount: 2, lastActivityAt: NOW - 2 * MIN }
    },
    {
      id: 'w-shop-pay',
      kind: 'worktree',
      name: 'payments',
      project: 'webshop',
      projectId: 'p-shop',
      path: '/home/me/.orca/worktrees/webshop/payments',
      branch: 'feat/payments',
      hostId: 'local',
      status: { state: 'permission', unread: true, terminalCount: 1, lastActivityAt: NOW - 5 * MIN }
    },
    {
      id: 'w-docs',
      kind: 'folder',
      name: 'docs',
      project: 'docs',
      projectId: 'p-docs',
      path: '/home/me/notes/docs',
      branch: null,
      hostId: 'local',
      status: { state: 'inactive', unread: false, terminalCount: 0, lastActivityAt: NOW - 3 * 24 * 60 * MIN }
    },
    {
      id: 'w-empty',
      kind: 'worktree',
      name: 'old-tool',
      project: 'old-tool',
      projectId: 'p-empty',
      path: '/home/me/code/old-tool/',
      branch: 'main',
      hostId: 'local',
      status: { state: 'inactive', unread: false, terminalCount: 0, lastActivityAt: null }
    }
  ],
  truncated: false
} as const

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export const sessions = {
  sessions: [
    {
      sessionId: UUID(1),
      agent: 'claude',
      title: 'Refactor the cart checkout',
      workspaceId: 'w-shop-main',
      hostId: 'local',
      branch: 'main',
      createdAt: NOW - 60 * MIN,
      updatedAt: NOW - 2 * MIN,
      messageCount: 42,
      totalTokens: 120000,
      running: true
    },
    {
      sessionId: UUID(2),
      agent: 'codex',
      title: 'Add Stripe webhooks',
      workspaceId: 'w-shop-pay',
      hostId: 'local',
      branch: 'feat/payments',
      createdAt: NOW - 90 * MIN,
      updatedAt: NOW - 5 * MIN,
      messageCount: 17,
      totalTokens: 40000,
      running: true
    },
    {
      sessionId: UUID(3),
      agent: 'claude',
      title: 'Fix flaky login test',
      workspaceId: 'w-shop-main',
      hostId: 'local',
      branch: 'main',
      createdAt: NOW - 2 * 24 * 60 * MIN,
      updatedAt: NOW - 2 * 24 * 60 * MIN,
      messageCount: 8,
      totalTokens: 9000,
      running: false
    },
    {
      sessionId: UUID(4),
      agent: 'gemini',
      title: 'Summarize meeting notes',
      workspaceId: 'w-docs',
      hostId: 'local',
      branch: null,
      createdAt: NOW - 3 * 24 * 60 * MIN,
      updatedAt: NOW - 3 * 24 * 60 * MIN,
      messageCount: 5,
      totalTokens: 3000,
      running: false
    },
    {
      sessionId: UUID(5),
      agent: 'claude',
      title: 'Quick question about regex',
      workspaceId: null,
      hostId: 'local',
      branch: null,
      createdAt: NOW - 7 * 24 * 60 * MIN,
      updatedAt: NOW - 7 * 24 * 60 * MIN,
      messageCount: 2,
      totalTokens: 500,
      running: false
    }
  ],
  truncated: false
}

export const agentsByWorkspace: Record<string, unknown> = {
  'w-shop-main': {
    agents: [
      { terminalId: 'term-1', title: 'Claude', agent: 'claude', state: 'working', stateStartedAt: NOW - 1 * MIN, sessionId: UUID(1) },
      // A fresh agent the history does not list yet.
      { terminalId: 'term-3', title: 'OpenCode', agent: 'opencode', state: 'done', stateStartedAt: NOW - 30_000, sessionId: null }
    ]
  },
  'w-shop-pay': {
    agents: [
      { terminalId: 'term-2', title: 'Codex', agent: 'codex', state: 'blocked', stateStartedAt: NOW - 4 * MIN, sessionId: UUID(2) }
    ]
  }
}

export const sessionId = UUID

/** `results` for mockHost / defineCheck: every worker call the tree load makes. */
export function hostResults(): Record<string, unknown> {
  return {
    'project.list': projects,
    'workspace.list': workspaces,
    'agent.listSessions': sessions,
    'agents.list': (params: { workspaceId?: string } | undefined) =>
      agentsByWorkspace[params?.workspaceId ?? ''] ?? { agents: [] },
    'workspace.readContext': { workspaceId: 'w-shop-main', branch: 'main', displayName: 'webshop', terminals: [] },
    'terminal.focus': { focused: true },
    'workspace.open': { opened: true },
    'agent.resume': { terminalId: 'term-9', started: true },
    'agent.launch': { terminalId: 'term-10' },
    'terminal.create': { terminalId: 'term-11' },
    'commands.run': { ran: true }
  }
}
