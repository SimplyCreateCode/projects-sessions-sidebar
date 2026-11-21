import { assert, mockHost, mountWorker, test } from 'orca/testing'
import * as main from './worker'
import { fixtureNow, hostResults, sessionId } from './fixtures'
import { buildTree, patchAgentStatus, viewProjects, viewUnassigned, type ViewOptions } from './model'

const base: ViewOptions = { query: '', status: 'all', agent: '', sort: 'activity', showEmpty: true, showHidden: false }

test('builds projects with their sessions, live state and branch tags', async () => {
  const host = mockHost({ results: hostResults() })
  const worker = await mountWorker(main, { host })
  const tree = await worker.request('tree.load', { limit: 200 })

  const shop = tree.projects.find((p) => p.id === 'p-shop')!
  assert.equal(shop.primaryWorkspaceId, 'w-shop-main')
  assert.deepEqual(
    shop.sessions.map((s) => [s.title, s.state, s.live, s.onPrimary]),
    [
      ['OpenCode', 'done', true, true],
      ['Refactor the cart checkout', 'working', true, true],
      ['Add Stripe webhooks', 'blocked', true, false],
      ['Fix flaky login test', 'closed', false, true]
    ]
  )
  const pay = shop.sessions.find((s) => s.sessionId === sessionId(2))!
  assert.equal(pay.branch, 'feat/payments')
  assert.equal(pay.terminalId, 'term-2')
  // Folder projects: the folder workspace is the primary one.
  assert.equal(tree.projects.find((p) => p.id === 'p-docs')!.primaryWorkspaceId, 'w-docs')
  // Trailing slashes do not hide the main checkout.
  assert.equal(tree.projects.find((p) => p.id === 'p-empty')!.workspaces[0].primary, true)
  assert.equal(tree.unassigned.length, 1)
  // Only workspaces with terminals are asked for their agents.
  assert.deepEqual(
    host.callsOf('agents.list').map((c) => (c as { workspaceId: string }).workspaceId).sort(),
    ['w-shop-main', 'w-shop-pay']
  )
  assert.deepEqual(tree.missing, [])
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
})

test('a live session is focused, a closed one resumed, anything else shown', async () => {
  const host = mockHost({ results: hostResults() })
  const worker = await mountWorker(main, { host })

  assert.equal((await worker.request('session.open', { terminalId: 'term-1', workspaceId: 'w-shop-main' })).how, 'focused')
  const resumed = await worker.request('session.open', {
    terminalId: null,
    workspaceId: 'w-shop-main',
    sessionId: sessionId(3),
    agent: 'claude'
  })
  assert.equal(resumed.how, 'resumed')
  assert.deepEqual(host.callsOf('agent.resume')[0], {
    workspaceId: 'w-shop-main',
    agent: 'claude',
    sessionId: sessionId(3)
  })
  assert.deepEqual(host.callsOf('terminal.focus').at(-1), { terminalId: 'term-9' })
  // An agent agent.resume does not know: just show the workspace.
  assert.equal(
    (await worker.request('session.open', { workspaceId: 'w-docs', sessionId: sessionId(4), agent: 'unknown-agent' })).how,
    'opened'
  )
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
})

test('+ starts the chosen agent or a terminal in the project workspace', async () => {
  const host = mockHost({ results: hostResults() })
  const worker = await mountWorker(main, { host })
  assert.equal((await worker.request('project.newSession', { workspaceId: 'w-docs', agent: 'codex' })).how, 'started')
  assert.deepEqual(host.callsOf('agent.launch')[0], { workspaceId: 'w-docs', agent: 'codex' })
  await worker.request('project.newSession', { workspaceId: 'w-docs', agent: 'terminal' })
  assert.deepEqual(host.callsOf('terminal.create')[0], { workspaceId: 'w-docs' })
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
})

test('agent events are coalesced into one tree.changed', async () => {
  const worker = await mountWorker(main, { host: mockHost({ results: hostResults() }) })
  for (const state of ['working', 'waiting', 'done'] as const) {
    await worker.emit('agent.status.changed', { workspaceId: null, paneKey: 'p', state, receivedAt: 1 })
  }
  await new Promise((resolve) => setTimeout(resolve, 1400))
  assert.equal(worker.posts.length, 1)
  assert.equal(worker.posts[0].event, 'tree.changed')
  await worker.deactivate()
})

test('history off still lists live agents and says what is missing', async () => {
  const results = hostResults()
  delete results['agent.listSessions']
  const host = mockHost({ results, capabilities: ['workspace:read', 'workspace:write', 'agent:read', 'agent:launch', 'terminal:send'] })
  const worker = await mountWorker(main, { host })
  const tree = await worker.request('tree.load', {})
  assert.ok(tree.missing.some((m) => m.startsWith('agent.listSessions')))
  assert.equal(tree.projects.find((p) => p.id === 'p-shop')!.sessions.length, 3)
  await worker.deactivate()
})

test('filters: search, status, agent, empty and hidden projects', () => {
  const tree = buildTree({
    projects: [
      { id: 'a', name: 'alpha', kind: 'git', hostId: 'local', path: '/a' },
      { id: 'b', name: 'beta', kind: 'git', hostId: 'local', path: '/b' },
      { id: 'h', name: 'hidden', kind: 'git', hostId: 'local', path: '/h', hidden: true }
    ],
    workspaces: [
      { id: 'wa', kind: 'worktree', name: 'alpha', projectId: 'a', path: '/a', branch: 'main', hostId: 'local' },
      { id: 'wb', kind: 'worktree', name: 'beta', projectId: 'b', path: '/b', branch: 'main', hostId: 'local' }
    ],
    sessions: [
      { sessionId: sessionId(10), agent: 'claude', title: 'Write docs', workspaceId: 'wa', hostId: 'local', branch: 'main', createdAt: 1, updatedAt: 10, messageCount: 1, totalTokens: 1, running: false },
      { sessionId: sessionId(11), agent: 'codex', title: 'Ship release', workspaceId: 'wa', hostId: 'local', branch: 'main', createdAt: 1, updatedAt: 20, messageCount: 1, totalTokens: 1, running: false },
      { sessionId: sessionId(12), agent: 'claude', title: 'Lost one', workspaceId: 'gone', hostId: 'local', branch: null, createdAt: 1, updatedAt: 5, messageCount: 1, totalTokens: 1, running: false }
    ],
    agents: { wa: [{ terminalId: 't', title: 'Codex', agent: 'codex', state: 'waiting', stateStartedAt: 30, sessionId: sessionId(11) }] },
    now: fixtureNow
  })
  assert.deepEqual(viewProjects(tree, base).map((v) => v.project.id), ['a', 'b'])
  assert.deepEqual(viewProjects(tree, { ...base, showEmpty: false }).map((v) => v.project.id), ['a'])
  assert.deepEqual(viewProjects(tree, { ...base, showHidden: true }).map((v) => v.project.id), ['a', 'b', 'h'])
  assert.deepEqual(viewProjects(tree, { ...base, query: 'ship' })[0].sessions.map((s) => s.title), ['Ship release'])
  // A project-name match keeps all its sessions and also an empty project.
  assert.deepEqual(viewProjects(tree, { ...base, query: 'beta' }).map((v) => v.project.id), ['b'])
  assert.equal(viewProjects(tree, { ...base, query: 'alpha' })[0].sessions.length, 2)
  assert.deepEqual(viewProjects(tree, { ...base, status: 'attention' })[0].sessions.map((s) => s.agent), ['codex'])
  assert.deepEqual(viewProjects(tree, { ...base, status: 'closed' })[0].sessions.map((s) => s.title), ['Write docs'])
  assert.deepEqual(viewProjects(tree, { ...base, agent: 'claude' })[0].sessions.map((s) => s.title), ['Write docs'])
  assert.deepEqual(viewProjects(tree, { ...base, sort: 'name', status: 'all' }).map((v) => v.project.id), ['a', 'b'])
  assert.deepEqual(viewUnassigned(tree, base).map((s) => s.title), ['Lost one'])

  const patched = patchAgentStatus(tree, { terminalId: 't', state: 'working', receivedAt: 99 })!
  assert.equal(patched.projects[0].sessions[0].state, 'working')
  assert.equal(patchAgentStatus(tree, { terminalId: 'nope', state: 'done', receivedAt: 1 }), null)
})
