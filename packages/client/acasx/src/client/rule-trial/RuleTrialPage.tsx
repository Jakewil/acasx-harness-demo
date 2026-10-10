/** 渲染在主区域的「规则试算」模块页。 */

/**
 * 规则试算的占位页面，等业务规则与档案数据源接入后替换。
 * @returns 「规则试算」页面内容。
 */
export function RuleTrialPage() {
  return (
    <div style={{ padding: '32px', fontSize: '14px', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: '20px', fontWeight: 600, margin: '0 0 12px' }}>规则试算</h1>
      <p style={{ margin: 0, opacity: 0.7 }}>演示占位页。后续在这里接入规则试算表单与业务后端。</p>
    </div>
  )
}
