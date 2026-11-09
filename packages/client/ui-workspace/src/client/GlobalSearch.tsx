/** Global navigation search over registered features and the current Host's catalog. */
import { useEffect, useRef, useState } from 'react'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Modal, IconSearchOutlineRegular, IconArchiveOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ShortcutCatalogEntry, ShortcutCommandId, ShortcutInvokeResult } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionSearchResultItem } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { workspaceDisplayTitle } from '@deepseek-ai/dsh-api-workspace-controller/default-workspace'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './GlobalSearch.module.css'
import { SessionGlyph } from './rows/SessionGlyph.tsx'
import { WorkspacePanelIcon } from './WorkspacePanelIcon.tsx'

/** Labels of live sidebar registrations; no plugin installation catalog is exposed. */
export interface SearchPanel {
  readonly id: MainPanelId
  readonly label: string
}

/** Reads and owner actions used by the global navigation dialog. */
export interface GlobalSearchInjected {
  hooks: {
    searchOpen: ObservableSnapshot<boolean>
    searchPanels: ObservableSnapshot<readonly SearchPanel[]>
    shortcuts: ObservableSnapshot<readonly ShortcutCatalogEntry[]>
  }
  setSearchOpen: (open: boolean) => void
  searchSessions: (query: string, signal: AbortSignal) => Promise<{ items: readonly SessionSearchResultItem[]; hasMore: boolean }>
  openSession: (id: SessionId) => void
  openWorkspace: (id: WorkspaceId) => Promise<void>
  restoreSession: (id: SessionId) => Promise<void>
  selectPanel: (id: MainPanelId) => void
  invokeCommand: (id: ShortcutCommandId) => ShortcutInvokeResult
}

/** The frame overlay's derived input faces. */
export type GlobalSearchProps = PropsRuntime<'shell.overlay'> & PropsLocale<'workspace'> & InjectFace<GlobalSearchInjected>

type SearchRow = { key: string; title: string; description: string } & (
  | { kind: 'session'; id: SessionId; archived: boolean }
  | { kind: 'workspace'; id: WorkspaceId }
  | { kind: 'panel'; id: MainPanelId }
  | { kind: 'command'; id: ShortcutCommandId }
)

/**
 * Keep command dispatch outside the dismissed dialog's modal ownership.
 * @param props - live catalog hooks and existing navigation owners.
 * @returns the search dialog, or nothing when closed.
 */
export function GlobalSearch(props: GlobalSearchProps): ReactNode {
  const open = props.useSearchOpen(value => value)
  const pendingCommand = useRef<ShortcutCommandId | null>(null)
  const [commandError, setCommandError] = useState(false)
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (open || pendingCommand.current === null) return
    const id = pendingCommand.current
    pendingCommand.current = null
    try {
      const result = props.invokeCommand(id)
      if (result.status === 'handled') { setQuery(''); return }
    } catch (error) {
      console.warn('Global search command rejected', error)
    }
    setCommandError(true)
    props.setSearchOpen(true)
  }, [open, props.invokeCommand, props.setSearchOpen])
  if (!open) return null
  return <SearchDialog {...props} query={query} setQuery={setQuery} commandError={commandError} close={() => {
    setQuery('')
    setCommandError(false)
    props.setSearchOpen(false)
  }} runCommand={(id) => {
    setCommandError(false)
    pendingCommand.current = id
    props.setSearchOpen(false)
  }} />
}

function SearchDialog({ useSessions, useWorkspaces, useSearchPanels, useShortcuts, searchSessions,
  openSession, openWorkspace, restoreSession, selectPanel, t, close, runCommand, commandError, query, setQuery,
}: GlobalSearchProps & {
  close: () => void
  runCommand: (id: ShortcutCommandId) => void
  commandError: boolean
  query: string
  setQuery: (value: string) => void
}): ReactNode {
  const sessions = useSessions(value => value)
  const workspaces = useWorkspaces(value => value)
  const panels = useSearchPanels(value => value)
  const commands = useShortcuts(value => value)
  const [retry, setRetry] = useState(0)
  const [content, setContent] = useState<{ query: string; items: readonly SessionSearchResultItem[]; hasMore: boolean; state: 'pending' | 'ready' | 'error' }>({ query: '', items: [], hasMore: false, state: 'ready' })
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(false)
  const alive = useRef(true)
  const acting = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const normalized = query.trim().toLocaleLowerCase()
  useEffect(() => {
    if (normalized === '') return
    const controller = new AbortController()
    setContent({ query: normalized, items: [], hasMore: false, state: 'pending' })
    const timer = window.setTimeout(() => {
      void searchSessions(normalized, controller.signal).then((result) => {
        if (!controller.signal.aborted) setContent({ query: normalized, ...result, state: 'ready' })
      }, (error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('Global session search failed', error)
        setContent({ query: normalized, items: [], hasMore: false, state: 'error' })
      })
    }, 180)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [normalized, retry, searchSessions])
  const hits = new Map((normalized !== '' && content.query === normalized ? content.items : []).map(hit => [hit.sessionId, hit.snippet]))
  const matches = (text: string): boolean => text.toLocaleLowerCase().includes(normalized)
  const rows: SearchRow[] = []
  const defaultName = t('workspace.defaultName')
  for (const id of sessions.ids) {
    const session = sessions.byId[id]
    if (session === undefined || session.blank || session.origin === 'subagent') continue
    const workspace = workspaces.items.find(row => row.sessionIds.includes(id))
    const title = session.displayTitle
    const workspaceTitle = workspace === undefined ? '' : workspaceDisplayTitle(workspace.title, defaultName)
    if (!matches(`${title} ${id} ${workspaceTitle}`) && !hits.has(id)) continue
    const archived = workspaces.archivedSessionIds.includes(id)
    rows.push({ kind: 'session', id, key: `session:${id}`, title, archived,
      description: archived ? t('globalSearch.archived') : hits.get(id) ?? t('globalSearch.session') })
  }
  for (const panel of panels) if (matches(panel.label)) rows.push({ kind: 'panel', ...panel, key: `panel:${panel.id}`, title: panel.label, description: t('globalSearch.feature') })
  for (const command of commands) {
    if (command.id === 'session.search' || !matches(`${command.label} ${command.aliases.join(' ')}`)) continue
    if (panels.some(panel => panel.label === command.label)) continue
    rows.push({ kind: 'command', id: command.id, key: `command:${command.id}`, title: command.label, description: t('globalSearch.feature') })
  }
  for (const workspace of workspaces.items) {
    const title = workspaceDisplayTitle(workspace.title, defaultName)
    if (matches(title)) rows.push({ kind: 'workspace', id: workspace.workspaceId, key: `workspace:${workspace.workspaceId}`, title, description: t('section.workspaces') })
  }
  const activate = async (row: SearchRow): Promise<void> => {
    if (acting.current) return
    acting.current = true
    setBusy(true)
    setActionError(false)
    try {
      switch (row.kind) {
        case 'command': runCommand(row.id); return
        case 'panel': selectPanel(row.id); break
        case 'workspace': await openWorkspace(row.id); break
        case 'session':
          if (row.archived) await restoreSession(row.id)
          else openSession(row.id)
          break
        default: assertNever(row)
      }
      if (alive.current) close()
    } catch (error) {
      console.warn('Global search navigation rejected', error)
      if (alive.current) setActionError(true)
    } finally {
      acting.current = false
      if (alive.current) setBusy(false)
    }
  }
  const searching = normalized !== '' && (content.query !== normalized || content.state === 'pending')
  const failed = normalized !== '' && content.query === normalized && content.state === 'error'
  return <Modal open headless title={t('globalSearch.title')} className={clsx(css.dialog)} onClose={close}>
    <header className={css.header}>
      <h2>{t('globalSearch.title')}</h2>
      <button type="button" className={css.close} onClick={close} aria-label={t('close')}><SearchGlyph kind="close" /></button>
    </header>
    <div className={css.body}>
      <div className={css.searchBox}>
        <IconSearchOutlineRegular size={18} />
        <input data-modal-autofocus aria-label={t('globalSearch.aria')} placeholder={t('globalSearch.placeholder')} value={query} onChange={(event) => { setQuery(event.target.value) }} />
        <kbd>{t('globalSearch.escape')}</kbd>
      </div>
      {(actionError || commandError) && <p role="alert" className={css.notice}>{t('globalSearch.actionFailed')}</p>}
      {failed && <p role="alert" className={css.notice}>{t('globalSearch.queryFailed')} <button type="button" onClick={() => { setRetry(value => value + 1) }}>{t('globalSearch.retry')}</button></p>}
      <div aria-label={t('search.results.aria')} aria-busy={searching || busy}>
        {rows.slice(0, 12).map(row => <button className={css.result} type="button" key={row.key} disabled={busy} onClick={() => { void activate(row) }}>
          {row.kind === 'session' ? (row.archived ? <IconArchiveOutlineRegular size={18} /> : <SessionGlyph size={18} />) : row.kind === 'workspace' ? <WorkspacePanelIcon size={18} /> : <SearchGlyph kind="grid" />}
          <span className={css.resultText}>{row.title}<small>{row.description}</small></span>
          <SearchGlyph kind="arrow" />
        </button>)}
        {searching && <p role="status" className={css.notice}>{t('search.pending')}</p>}
        {!searching && rows.length === 0 && <p className={css.empty}>{t('empty.noMatches')}</p>}
        {(normalized !== '' && content.query === normalized && content.hasMore) && <p className={css.notice}>{t('search.hasMore', { n: 12 })}</p>}
      </div>
    </div>
  </Modal>
}

/** Existing grid and diagonal arrow paths from the frozen prototype. */
function SearchGlyph({ kind }: { kind: 'grid' | 'arrow' | 'close' }): ReactNode {
  return <svg className={kind === 'arrow' ? css.trailing : undefined} width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={kind === 'grid' ? 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' : kind === 'close' ? 'm6 6 12 12M18 6 6 18' : 'M7 17 17 7M7 7h10v10'} />
  </svg>
}
