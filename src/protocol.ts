// The panel <-> worker contract, declared once: src/panel.tsx and src/worker.ts both read it.
import type { TreeSnapshot } from './model'

export interface OpenSessionInput {
  terminalId?: string | null
  workspaceId?: string | null
  sessionId?: string | null
  agent?: string | null
}

export interface ActionResult {
  ok: boolean
  /** What happened: `focused` a live pane, `resumed` a closed session, `opened` its workspace. */
  how: 'focused' | 'resumed' | 'opened' | 'started' | 'toggled' | 'none'
  /** Error code from Orca when `ok` is false. */
  code?: string
  message?: string
}

declare module 'orca' {
  interface PluginRequests {
    /** Projects, their workspaces and every session under them. */
    'tree.load': { input: { limit?: number }; output: TreeSnapshot }
    /** Focuses a live session's pane, resumes a closed one, or opens its workspace. */
    'session.open': { input: OpenSessionInput; output: ActionResult }
    /** Starts an agent (or a plain terminal) in a project's main workspace. */
    'project.newSession': {
      input: { workspaceId: string; agent: string }
      output: ActionResult
    }
    /** Shows a workspace, as clicking it in Orca's sidebar does. */
    'workspace.show': { input: { workspaceId: string }; output: ActionResult }
    /** Shows or hides Orca's own left sidebar. */
    'sidebar.toggle': { output: ActionResult }
  }
  interface PluginPanelEvents {
    /** Something changed that the tree shows; the panel reloads. */
    'tree.changed': { reason: string }
  }
}
