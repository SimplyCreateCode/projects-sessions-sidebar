import { assert, mockHost, mount, test } from 'orca/testing'
import * as panel from './panel'
import * as worker from './worker'
import { hostResults, sessionId } from './fixtures'
import { buildTree } from './model'

// The panel talks only to its worker; stand in for it with the real tree builder over fixtures.
async function snapshot() {
  const { mountWorker } = await import('orca/testing')
  const w = await mountWorker(worker, { host: mockHost({ results: hostResults() }) })
  const tree = await w.request('tree.load', {})
  await w.deactivate()
  return tree
}

function requests(tree: ReturnType<typeof buildTree>, log: unknown[] = []) {
  return {
    'tree.load': () => tree,
    'session.open': (input: unknown) => {
      log.push(['open', input])
      return { ok: true, how: 'focused' as const }
    },
    'project.newSession': (input: unknown) => {
      log.push(['new', input])
      return { ok: true, how: 'started' as const }
    },
    'workspace.show': () => ({ ok: true, how: 'opened' as const }),
    'sidebar.toggle': () => ({ ok: true, how: 'toggled' as const })
  }
}

test('shows projects with sessions and jumps on click', async () => {
  const tree = await snapshot()
  const log: unknown[] = []
  const view = await mount(panel, { host: mockHost({ requests: requests(tree, log) }), locale: 'en' })
  assert.ok(view.find({ text: 'webshop' }))
  assert.ok(view.find({ label: 'Add Stripe webhooks' }))
  assert.ok(view.find({ text: 'feat/payments' }))
  assert.ok(view.find({ text: 'needs approval' }))
  await view.press({ label: 'Add Stripe webhooks' })
  assert.deepEqual(log[0], [
    'open',
    { terminalId: 'term-2', workspaceId: 'w-shop-pay', sessionId: sessionId(2), agent: 'codex' }
  ])
  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.refusals, [])
  await view.unmount()
})

test('+ starts the chosen agent in the project main workspace', async () => {
  const tree = await snapshot()
  const log: unknown[] = []
  const view = await mount(panel, { host: mockHost({ requests: requests(tree, log) }), locale: 'en' })
  await view.press({ label: 'New Claude session in webshop' })
  assert.deepEqual(log.at(-1), ['new', { workspaceId: 'w-shop-main', agent: 'claude' }])
  await view.unmount()
})

test('search narrows to matching sessions; German labels', async () => {
  const tree = await snapshot()
  const view = await mount(panel, { host: mockHost({ requests: requests(tree) }), locale: 'de' })
  await view.type({ label: 'Projekte und Sessions durchsuchen' }, 'login')
  assert.ok(view.find({ label: 'Fix flaky login test' }))
  assert.equal(view.find({ label: 'Add Stripe webhooks' }), null)
  assert.equal(view.find({ text: 'docs' }), null)
  await view.type({ label: 'Projekte und Sessions durchsuchen' }, 'zzzz', { replace: true })
  assert.ok(view.find({ label: 'Keine Treffer' }))
  assert.deepEqual(view.errors, [])
  await view.unmount()
})

test('a closed project can be expanded and pages its sessions', async () => {
  const tree = await snapshot()
  const view = await mount(panel, { host: mockHost({ requests: requests(tree) }), locale: 'en' })
  // docs has no live session, so it starts collapsed.
  assert.equal(view.find({ label: 'Summarize meeting notes' }), null)
  await view.press({ label: 'Expand docs' })
  assert.ok(view.find({ label: 'Summarize meeting notes' }))
  await view.unmount()
})

test('an agent status event updates the row without a reload', async () => {
  const tree = await snapshot()
  const host = mockHost({ requests: requests(tree) })
  const view = await mount(panel, { host, locale: 'en' })
  await view.emit('agent.status.changed', {
    workspaceId: 'w-shop-pay',
    paneKey: 'p',
    terminalId: 'term-2',
    state: 'working',
    receivedAt: Date.now()
  })
  await view.settled()
  assert.equal(view.find({ text: 'needs approval' }), null)
  await view.unmount()
})
