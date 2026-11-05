import AppIcon from './AppIcon'

const items = [
  { path: '/', label: '雑誌', icon: 'book' },
  { path: '/completed', label: '完結', icon: 'stack' },
  { path: '/timeline', label: '年表', icon: 'calendar' }
]

export default function PrimaryNav({ current, navigate }) {
  return (
    <nav className="bottom-nav primary-nav" aria-label="メインナビゲーション">
      {items.map((item) => (
        <button key={item.path} type="button"
          className={current === item.path ? 'active' : ''}
          aria-current={current === item.path ? 'page' : undefined}
          onClick={() => navigate(item.path)}>
          <AppIcon name={item.icon} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
