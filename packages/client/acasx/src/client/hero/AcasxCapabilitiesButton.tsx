/** ACAS.X hero 能力按钮：antd Modal 展示当前对话的 MCP 与 Skills。 */

import { useState } from 'react'
import { ConfigProvider, Empty, List, Modal, Spin, Tabs, Tag } from 'antd'
import enUS from 'antd/locale/en_US'
import zhCN from 'antd/locale/zh_CN'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// 类型-only：引入 ui-conversation 的 slot 声明。
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { AcasxCapabilitiesView } from './capabilities.ts'
import css from './AcasxCapabilitiesButton.module.css'

/** 能力弹窗注册侧的注入面。 */
export interface AcasxCapabilitiesInjected {
  /** 读取当前会话的 MCP 与 Skills。 */
  load: () => Promise<AcasxCapabilitiesView>
}

/** 能力按钮 occupant 的完整 props。 */
export type AcasxCapabilitiesButtonProps = PropsRuntime<'conversation.hero.preview'>
  & PropsLocale<'acasx'>
  & InjectFace<AcasxCapabilitiesInjected>

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly view: AcasxCapabilitiesView }
  | { readonly status: 'error' }

/**
 * 渲染“预览版”按钮与能力弹窗。
 * @param props - session-maybe 标准 props、ACAS.X locale seat 与读取回调。
 * @returns 按钮和 antd Modal。
 */
export function AcasxCapabilitiesButton({ load, t }: AcasxCapabilitiesButtonProps) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const openModal = (): void => {
    setOpen(true)
    setState({ status: 'loading' })
    void load().then(
      (view) => {
        setState({ status: 'ready', view })
      },
      () => {
        setState({ status: 'error' })
      },
    )
  }
  const locale = typeof document !== 'undefined' && document.documentElement.lang.startsWith('en') ? enUS : zhCN
  const view = state.status === 'ready' ? state.view : { mcpServers: [], skills: [] }
  return (
    <ConfigProvider locale={locale}>
      <button type="button" className={css.trigger} onClick={openModal}>
        {t('hero.preview')}
      </button>
      <Modal
        open={open}
        title={t('capabilities.title')}
        footer={null}
        onCancel={() => {
          setOpen(false)
        }}
      >
        {state.status === 'loading' && <Spin />}
        {state.status === 'error' && <Empty description={t('capabilities.error')} />}
        {state.status === 'ready' && (
          <div className="flex flex-col gap-3 pt-2">
            <Tabs
              items={[
                {
                  key: 'mcp',
                  label: t('capabilities.mcp'),
                  children:
                    view.mcpServers.length === 0 ? (
                      <Empty description={t('capabilities.mcp.empty')} />
                    ) : (
                      <List dataSource={[...view.mcpServers]} renderItem={server => <List.Item>{server.name}</List.Item>} />
                    ),
                },
                {
                  key: 'skills',
                  label: t('capabilities.skills'),
                  children:
                    view.skills.length === 0 ? (
                      <Empty description={t('capabilities.skills.empty')} />
                    ) : (
                      <List
                        dataSource={[...view.skills]}
                        renderItem={skill => (
                          <List.Item>
                            <div className="flex w-full flex-col gap-1">
                              <span className="font-medium">{skill.name}</span>
                              <span className="text-sm text-gray-500">{skill.description}</span>
                              <Tag color={skill.modelInvocable ? 'blue' : 'default'}>
                                {skill.modelInvocable ? t('capabilities.skill.modelInvocable') : t('capabilities.skill.userOnly')}
                              </Tag>
                            </div>
                          </List.Item>
                        )}
                      />
                    ),
                },
              ]}
            />
          </div>
        )}
      </Modal>
    </ConfigProvider>
  )
}
