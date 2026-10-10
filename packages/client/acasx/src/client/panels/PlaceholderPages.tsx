/** 尚未接入业务的模块占位页：档案-资料库、技能-连接器、更多。 */

/** 「档案-资料库」占位页。 */
export function ArchiveLibraryPage() {
  return <Placeholder title="档案-资料库" hint="后续在这里接入档案与资料检索。" />
}

/** 「技能-连接器」占位页。 */
export function SkillConnectorPage() {
  return <Placeholder title="技能-连接器" hint="后续在这里管理技能与外部连接器。" />
}

/** 「更多」占位页。 */
export function MorePage() {
  return <Placeholder title="更多" hint="其他业务模块的入口。" />
}

/**
 * 渲染统一的占位版式。
 * @param props - 页面标题与说明文案。
 * @returns 占位页内容。
 */
function Placeholder({ title, hint }: { readonly title: string; readonly hint: string }) {
  return (
    <div style={{ padding: '32px', fontSize: '14px', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: '20px', fontWeight: 600, margin: '0 0 12px' }}>{title}</h1>
      <p style={{ margin: 0, opacity: 0.7 }}>{hint}</p>
    </div>
  )
}
