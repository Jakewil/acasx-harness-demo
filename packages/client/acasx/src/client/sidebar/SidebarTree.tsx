/** ACAS.X 左侧业务树：罪犯名单、选中罪犯的固定模块列表，以及该（罪犯, 场景）组合下的会话。 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { isMainConversationPanel } from '../main-conversation.ts'

/** 一条 mock 罪犯记录：显示名与所属监区。 */
interface Criminal {
  readonly id: string
  readonly name: string
  readonly area: string
}

/** 一个业务模块。承载会话的模块带 agent preset，其余只是数据入口。 */
interface Scenario {
  readonly name: string
  readonly preset?: string
}

/** 占位名单，等业务后端提供数据后替换。 */
const CRIMINALS: readonly Criminal[] = [
  { id: 'c1', name: '张三', area: '一监区' },
  { id: 'c2', name: '李四', area: '一监区' },
  { id: 'c3', name: '王五', area: '二监区' },
  { id: 'c4', name: '张伟', area: '一监区' },
  { id: 'c5', name: '吕昌胜', area: '会议演示监区' },
  { id: 'c6', name: '李伟', area: '三监区' },
  { id: 'c9', name: '乃很爱提', area: '三监区' },
  { id: 'c7', name: '张三丰', area: '三监区' },
  { id: 'c8', name: '张三', area: '三监区' },
  { id: 'c10', name: '乃很爱提', area: '三监区' },
  { id: 'c11', name: '乃很爱提', area: '三监区' },
]

/** 每名罪犯固定的模块集。「档案-资料库」是数据入口，不承载会话。 */
const SCENARIOS: readonly Scenario[] = [
  { name: '档案-资料库' },
  { name: '日常监管', preset: 'richang-jianguan' },
  { name: '心盾', preset: 'xindun' },
]

/** 解析一个（罪犯, 场景）组合对应的场景工作目录。 */
export interface ScenarioWorkspaceTarget {
  readonly criminalId: string
  readonly criminalName: string
  readonly scenario: string
}

/** 侧栏业务树注入的业务动作：Host 场景目录、Host 会话创建，以及会话切换。 */
export interface AcasxSidebarInjected {
  /** 解析场景工作目录的绝对路径。 */
  resolveScenarioWorkspace: (target: ScenarioWorkspaceTarget) => Promise<string>
  /** 复用同目录空白会话，或用 Host 会话接口新建并刷新列表，返回会话 id。 */
  createScenarioSession: (cwd: string, agentPreset: string) => Promise<SessionId>
  /** 打开一个会话。 */
  openScenarioSession: (sessionId: SessionId) => void
}

/** 完整组件 props：外壳 owner + 全局标准 props + 本包注入面。 */
export type AcasxSidebarTreeProps = PropsRuntime<'sidebar.workspaces'> & InjectFace<AcasxSidebarInjected>

/**
 * 渲染侧栏浏览区里的 ACAS.X 业务树。
 * @returns 罪犯名单、模块列表与会话行。
 */
export function AcasxSidebarTree({
  wide,
  useSessions,
  usePanelInfo,
  resolveScenarioWorkspace,
  createScenarioSession,
  openScenarioSession,
}: AcasxSidebarTreeProps): ReactNode {
  // 手风琴：同时只展开一个罪犯；该罪犯下同时只展开一个场景。
  const [expandedCriminal, setExpandedCriminal] = useState<string | null>(null)
  const [expandedScenario, setExpandedScenario] = useState<string | null>(null)
  const list = useSessions(state => state)
  const panelActive = usePanelInfo(info => info.activePanelId !== null && !isMainConversationPanel(info.activePanelId))
  const selectedId = panelActive ? undefined : Object.values(list.byId).find(summary => (summary.retainedBy.mainView ?? 0) > 0)?.id
  const revealScenario = useCallback((criminalId: string, scenarioName: string) => {
    setExpandedCriminal(current => (current === criminalId ? current : criminalId))
    setExpandedScenario(current => (current === scenarioName ? current : scenarioName))
  }, [])

  // 折叠成窄轨时整块隐藏：窄轨只有 56px，渲染完整树会出现文字竖排、头像被裁、
  // 滚动条叠压。展开入口由外壳的折叠按钮与快捷键提供，不依赖这块区域。
  if (!wide) return null

  return (
    <div
      style={{
        // 侧栏可用高度由外壳决定。头部固定，只有下面的列表滚动，这样
        // 「罪犯 (n)」不会随内容滚走，内容也不会顶到底部固定区下面。
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        padding: '4px 8px 12px',
        fontSize: '13px',
      }}
    >
      <div style={{ padding: '8px 8px 6px', fontSize: '12px', opacity: 0.55 }}>罪犯 ({CRIMINALS.length})</div>
      <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        {CRIMINALS.map((criminal) => {
          const criminalOpen = expandedCriminal === criminal.id
          return (
            <div key={criminal.id}>
              <button
                type="button"
                onClick={() => {
                  setExpandedCriminal(criminalOpen ? null : criminal.id)
                  setExpandedScenario(null)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '6px 8px',
                  border: 0,
                  borderRadius: '6px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  font: 'inherit',
                  color: 'inherit',
                  background: criminalOpen ? 'rgba(127,127,127,0.14)' : 'transparent',
                }}
              >
                <span
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    flex: '0 0 auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(127,127,127,0.18)',
                    fontSize: '11px',
                  }}
                >
                  {criminal.name.slice(0, 1)}
                </span>
                <span style={{ flex: '1 1 auto' }}>{criminal.name}</span>
                <span style={{ opacity: 0.5, fontSize: '11px' }}>{criminal.area}</span>
              </button>

              {criminalOpen && (
                <div style={{ paddingLeft: '28px' }}>
                  {SCENARIOS.map(scenario => (
                    <ScenarioNode
                      key={scenario.name}
                      criminal={criminal}
                      scenario={scenario}
                      open={expandedScenario === scenario.name}
                      selectedId={selectedId}
                      onReveal={revealScenario}
                      onToggle={() => {
                        setExpandedScenario(current => (current === scenario.name ? null : scenario.name))
                      }}
                      useSessions={useSessions}
                      resolveScenarioWorkspace={resolveScenarioWorkspace}
                      createScenarioSession={createScenarioSession}
                      openScenarioSession={openScenarioSession}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 场景行入参：所属罪犯、场景与从 apply 注入的业务动作。 */
interface ScenarioNodeProps {
  readonly criminal: Criminal
  readonly scenario: Scenario
  readonly open: boolean
  readonly selectedId: SessionId | undefined
  readonly onReveal: (criminalId: string, scenarioName: string) => void
  readonly onToggle: () => void
  readonly useSessions: AcasxSidebarTreeProps['useSessions']
  readonly resolveScenarioWorkspace: AcasxSidebarInjected['resolveScenarioWorkspace']
  readonly createScenarioSession: AcasxSidebarInjected['createScenarioSession']
  readonly openScenarioSession: AcasxSidebarInjected['openScenarioSession']
}

/**
 * 一个（罪犯, 场景）节点：解析该场景的工作目录，按 cwd 全等过滤会话列表，
 * 并承载「＋ 新建会话」。
 */
function ScenarioNode({
  criminal,
  scenario,
  open,
  selectedId,
  onReveal,
  onToggle,
  useSessions,
  resolveScenarioWorkspace,
  createScenarioSession,
  openScenarioSession,
}: ScenarioNodeProps): ReactNode {
  const [cwd, setCwd] = useState<string>()
  const [busy, setBusy] = useState(false)
  const creating = useRef(false)
  const list = useSessions(state => state)

  const target: ScenarioWorkspaceTarget = {
    criminalId: criminal.id,
    criminalName: criminal.name,
    scenario: scenario.name,
  }
  const preset = scenario.preset

  // 目录路径由 Host 决定，这里只在挂载时解析一次并缓存。
  useEffect(() => {
    if (preset === undefined) return
    let active = true
    resolveScenarioWorkspace({
      criminalId: criminal.id,
      criminalName: criminal.name,
      scenario: scenario.name,
    })
      .then((path) => {
        if (active) setCwd(path)
      })
      .catch((reason: unknown) => {
        console.warn('场景工作目录解析失败:', reason)
      })
    return () => {
      active = false
    }
  }, [criminal.id, criminal.name, scenario.name, preset, resolveScenarioWorkspace])

  // 会话归属只按 cwd 全等过滤：同一场景目录下的会话都属于这个节点。
  const sessions =
    cwd === undefined
      ? []
      : list.ids.flatMap((id) => {
        const summary = list.byId[id]
        return summary !== undefined && summary.cwd === cwd ? [summary] : []
      })
  const containsSelected = selectedId !== undefined && sessions.some(summary => summary.id === selectedId)

  useEffect(() => {
    if (containsSelected) onReveal(criminal.id, scenario.name)
  }, [criminal.id, containsSelected, onReveal, scenario.name])

  const create = async (): Promise<void> => {
    if (preset === undefined || creating.current) return
    creating.current = true
    setBusy(true)
    try {
      const path = cwd ?? (await resolveScenarioWorkspace(target))
      if (cwd === undefined) setCwd(path)
      const sessionId = await createScenarioSession(path, preset)
      openScenarioSession(sessionId)
      if (!open) onToggle()
    } catch (reason: unknown) {
      console.warn('新建场景会话失败:', reason)
    } finally {
      creating.current = false
      setBusy(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          type="button"
          onClick={onToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flex: '1 1 auto',
            padding: '6px 8px',
            border: 0,
            borderRadius: '6px',
            textAlign: 'left',
            cursor: 'pointer',
            font: 'inherit',
            color: 'inherit',
            background: open ? 'rgba(127,127,127,0.14)' : 'transparent',
          }}
        >
          <span style={{ flex: '1 1 auto' }}>{scenario.name}</span>
        </button>

        {preset !== undefined && (
          <button
            type="button"
            disabled={busy}
            aria-label="新建会话"
            onClick={() => {
              void create()
            }}
            style={{
              flex: '0 0 auto',
              padding: '6px 8px',
              border: 0,
              borderRadius: '6px',
              background: 'transparent',
              color: 'inherit',
              font: 'inherit',
              fontSize: '13px',
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.4 : 0.7,
            }}
          >
            ＋
          </button>
        )}
      </div>

      {open && preset !== undefined && (
        <div style={{ paddingLeft: '12px' }}>
          {sessions.length === 0 && <div style={{ padding: '6px 8px', fontSize: '12px', opacity: 0.5 }}>暂无对话</div>}
          {sessions.map((summary) => {
            const selected = summary.id === selectedId
            return (
              <button
                key={summary.id}
                type="button"
                aria-current={selected ? 'page' : undefined}
                onClick={() => {
                  openScenarioSession(summary.id)
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                  gap: '8px',
                  padding: '6px 8px',
                  border: 0,
                  borderRadius: '6px',
                  background: selected ? 'rgba(127,127,127,0.2)' : 'transparent',
                  color: 'inherit',
                  font: 'inherit',
                  fontWeight: selected ? 600 : undefined,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    flex: '1 1 auto',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {summary.displayTitle}
                </span>
                <span style={{ flex: '0 0 auto', fontSize: '11px', opacity: 0.6 }}>{new Date(summary.updatedAt).toLocaleDateString()}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
