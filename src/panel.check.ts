// Scenarios for `orca plugin check` and `orca plugin shot --scenario`; never loaded by Orca.
import { defineCheck } from 'orca/testing'
import { hostResults } from './fixtures'

export default defineCheck({
  'no projects': {
    results: {
      'project.list': { projects: [], truncated: false },
      'workspace.list': { workspaces: [], truncated: false },
      'agent.listSessions': { sessions: [], truncated: false }
    }
  },
  'orca unreachable': {},
  'projects and sessions': { results: hostResults() },
  'history off': {
    results: (() => {
      const results = hostResults()
      delete results['agent.listSessions']
      return results
    })(),
    capabilities: ['workspace:read', 'workspace:write', 'agent:read', 'agent:launch', 'terminal:send']
  },
  'needs you filter': {
    results: hostResults(),
    persisted: { plugin: { 'pss.status': 'attention' } }
  }
})
