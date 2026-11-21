// German and English strings; everything else falls back to English.
const en = {
  search: 'Search projects and sessions',
  searchPlaceholder: 'Search… (title, agent, branch, project)',
  refresh: 'Refresh',
  toggleSidebar: "Show or hide Orca's own left sidebar",
  status: 'Status',
  statusAll: 'All sessions',
  statusLive: 'Running now',
  statusAttention: 'Needs you',
  statusClosed: 'Closed',
  agentFilter: 'Agent',
  agentAll: 'All agents',
  sort: 'Sort projects',
  sortActivity: 'Latest activity',
  sortName: 'Name',
  newAgent: 'Agent for +',
  terminal: 'Plain terminal',
  showEmpty: 'Show projects without sessions',
  showHidden: 'Show hidden projects',
  options: 'Options',
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
  loading: 'Reading projects and session history…',
  nothing: 'No projects yet',
  nothingHint: 'Add a repository or folder in Orca and its sessions show up here.',
  noMatch: 'Nothing matches',
  noMatchHint: 'Change the search or the filters.',
  clearFilters: 'Clear filters',
  unassigned: 'Other sessions',
  unassignedHint: 'Sessions Orca could not tie to one of your projects',
  showMore: (n: number) => `Show ${n} more`,
  showLess: 'Show fewer',
  newSessionIn: (agent: string, project: string) => `New ${agent} session in ${project}`,
  newTerminalIn: (project: string) => `New terminal in ${project}`,
  openWorkspace: (project: string) => `Show ${project} in Orca`,
  expand: (project: string) => `Expand ${project}`,
  collapse: (project: string) => `Collapse ${project}`,
  noWorkspace: 'Orca has no workspace for this project yet: open it once in Orca.',
  sessionsCount: (n: number) => (n === 1 ? '1 session' : `${n} sessions`),
  liveCount: (n: number) => `${n} running`,
  attentionCount: (n: number) => (n === 1 ? '1 needs you' : `${n} need you`),
  here: 'current',
  hidden: 'hidden',
  unread: 'new',
  state: {
    working: 'working',
    blocked: 'needs approval',
    waiting: 'waiting for you',
    done: 'ready',
    closed: 'closed'
  } as Record<string, string>,
  messages: (n: number) => (n === 1 ? '1 message' : `${n} messages`),
  truncated: 'Only the newest sessions are shown (Orca returns at most 200).',
  historyMissing:
    'Session history is not available, so only live agents are listed. Turn on Settings → Agent Session History.',
  failed: 'That did not work',
  resumeFailed: 'Could not resume the session; its workspace is shown instead.',
  summary: (projects: number, live: number, attention: number) =>
    `${projects} projects · ${live} running · ${attention} waiting for you`,
  updated: 'Updated'
}

type Strings = typeof en

const de: Strings = {
  search: 'Projekte und Sessions durchsuchen',
  searchPlaceholder: 'Suchen… (Titel, Agent, Branch, Projekt)',
  refresh: 'Aktualisieren',
  toggleSidebar: 'Orcas eigene linke Seitenleiste ein- oder ausblenden',
  status: 'Status',
  statusAll: 'Alle Sessions',
  statusLive: 'Läuft gerade',
  statusAttention: 'Braucht dich',
  statusClosed: 'Beendet',
  agentFilter: 'Agent',
  agentAll: 'Alle Agents',
  sort: 'Projekte sortieren',
  sortActivity: 'Letzte Aktivität',
  sortName: 'Name',
  newAgent: 'Agent für +',
  terminal: 'Nur Terminal',
  showEmpty: 'Projekte ohne Sessions zeigen',
  showHidden: 'Ausgeblendete Projekte zeigen',
  options: 'Optionen',
  expandAll: 'Alle aufklappen',
  collapseAll: 'Alle zuklappen',
  loading: 'Lese Projekte und Session-Verlauf…',
  nothing: 'Noch keine Projekte',
  nothingHint: 'Füge in Orca ein Repository oder einen Ordner hinzu, dann erscheinen seine Sessions hier.',
  noMatch: 'Keine Treffer',
  noMatchHint: 'Ändere die Suche oder die Filter.',
  clearFilters: 'Filter zurücksetzen',
  unassigned: 'Weitere Sessions',
  unassignedHint: 'Sessions, die Orca keinem deiner Projekte zuordnen konnte',
  showMore: (n) => `${n} weitere zeigen`,
  showLess: 'Weniger zeigen',
  newSessionIn: (agent, project) => `Neue ${agent}-Session in ${project}`,
  newTerminalIn: (project) => `Neues Terminal in ${project}`,
  openWorkspace: (project) => `${project} in Orca zeigen`,
  expand: (project) => `${project} aufklappen`,
  collapse: (project) => `${project} zuklappen`,
  noWorkspace: 'Orca hat für dieses Projekt noch keinen Workspace: öffne es einmal in Orca.',
  sessionsCount: (n) => (n === 1 ? '1 Session' : `${n} Sessions`),
  liveCount: (n) => `${n} aktiv`,
  attentionCount: (n) => `${n} warten`,
  here: 'aktuell',
  hidden: 'ausgeblendet',
  unread: 'neu',
  state: {
    working: 'arbeitet',
    blocked: 'braucht Freigabe',
    waiting: 'wartet auf dich',
    done: 'bereit',
    closed: 'beendet'
  },
  messages: (n) => (n === 1 ? '1 Nachricht' : `${n} Nachrichten`),
  truncated: 'Es werden nur die neuesten Sessions gezeigt (Orca liefert höchstens 200).',
  historyMissing:
    'Kein Session-Verlauf verfügbar, daher nur laufende Agents. Einschalten unter Einstellungen → Agent Session History.',
  failed: 'Das hat nicht geklappt',
  resumeFailed: 'Session ließ sich nicht fortsetzen; stattdessen wird ihr Workspace gezeigt.',
  summary: (projects, live, attention) => `${projects} Projekte · ${live} aktiv · ${attention} warten`,
  updated: 'Aktualisiert'
}

export function strings(locale: string | undefined): Strings {
  return (locale ?? '').toLowerCase().startsWith('de') ? de : en
}

const AGENT_NAMES: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  opencode: 'OpenCode',
  opencode2: 'OpenCode',
  copilot: 'Copilot',
  cursor: 'Cursor',
  kimi: 'Kimi',
  'qwen-code': 'Qwen Code',
  droid: 'Droid',
  grok: 'Grok',
  devin: 'Devin',
  kiro: 'Kiro',
  hermes: 'Hermes',
  pi: 'Pi'
}

export function agentName(agent: string | null | undefined): string {
  if (!agent) return 'Agent'
  return AGENT_NAMES[agent] ?? agent.charAt(0).toUpperCase() + agent.slice(1)
}
