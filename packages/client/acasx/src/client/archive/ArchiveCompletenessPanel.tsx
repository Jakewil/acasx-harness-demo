/** 右栏「档案完整度」面板：档案字段的完成情况。 */

/** 一个字段分组的 mock 数据。 */
interface FieldGroup {
  readonly name: string
  readonly filled: number
  readonly total: number
  readonly fields: readonly { readonly label: string; readonly value: string }[]
}

/** 档案完整度的 mock 数据，等业务后端接入后替换。 */
const GROUPS: readonly FieldGroup[] = [
  {
    name: '基本概况',
    filled: 8,
    total: 9,
    fields: [
      { label: '姓名', value: '张三丰' },
      { label: '犯罪时年龄', value: '34' },
      { label: '身高', value: '173' },
      { label: '民族', value: '汉族' },
      { label: '出生日期', value: '1969-09-10' },
      { label: '罪名', value: '抢劫' },
      { label: '文化程度', value: '—' },
      { label: '入监日期', value: '2024-01-13' },
      { label: '刑期', value: '3 年' },
    ],
  },
  {
    name: '案件信息',
    filled: 1,
    total: 10,
    fields: [
      { label: '性别', value: '男' },
      { label: '政治面貌', value: '—' },
      { label: '婚姻状况', value: '—' },
      { label: '子女情况概要', value: '—' },
      { label: '成年人子女数', value: '—' },
    ],
  },
]

/**
 * 渲染档案完整度：总进度、分组进度与字段明细。
 * @returns 档案完整度面板内容。
 */
export function ArchiveCompletenessPanel() {
  const filled = GROUPS.reduce((sum, group) => sum + group.filled, 0)
  const total = GROUPS.reduce((sum, group) => sum + group.total, 0)
  const percent = Math.round((filled / total) * 100)

  return (
    <div
      style={{
        // 档案字段会超出面板高度，必须由面板自己滚动，否则底部内容被裁掉。
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        boxSizing: 'border-box',
        padding: '14px 16px',
        fontSize: '13px',
      }}
    >
      <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>档案完整度</div>

      <div style={{ fontWeight: 600, marginBottom: '4px' }}>张三丰</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
        <span style={{ opacity: 0.6, fontSize: '12px' }}>档案完整度</span>
        <span style={{ color: '#d3453b', fontWeight: 700 }}>{percent}%</span>
        <span style={{ opacity: 0.6, fontSize: '12px' }}>
          ({filled}/{total})
        </span>
      </div>
      <div
        style={{
          height: '3px',
          background: 'rgba(127,127,127,0.2)',
          borderRadius: '2px',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            background: '#d3453b',
            borderRadius: '2px',
          }}
        />
      </div>

      {GROUPS.map(group => (
        <section
          key={group.name}
          style={{
            border: '1px solid rgba(127,127,127,0.18)',
            borderRadius: '8px',
            marginBottom: '12px',
            overflow: 'hidden',
          }}
        >
          <header
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 10px',
              fontWeight: 600,
            }}
          >
            <span>{group.name}</span>
            <span
              style={{
                color: group.filled === group.total ? '#2fa36b' : '#d3453b',
                fontSize: '12px',
              }}
            >
              {group.filled}/{group.total}
            </span>
          </header>
          <div
            style={{
              height: '3px',
              background: 'rgba(127,127,127,0.15)',
            }}
          >
            <div
              style={{
                width: `${String(Math.round((group.filled / group.total) * 100))}%`,
                height: '100%',
                background: group.filled === group.total ? '#2fa36b' : '#d3453b',
              }}
            />
          </div>
          <div style={{ padding: '4px 0' }}>
            {group.fields.map(field => (
              <div key={field.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px' }}>
                <span style={{ opacity: 0.6, fontSize: '12px' }}>{field.label}</span>
                <span>{field.value}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
