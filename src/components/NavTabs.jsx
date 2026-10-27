import { MealsIcon, PricesIcon, SummaryIcon } from './Icons'

const TABS = [
  { key: 'today', label: 'Meals', Icon: MealsIcon },
  { key: 'prices', label: 'Prices', Icon: PricesIcon },
  { key: 'summary', label: 'Summary', Icon: SummaryIcon }
]

export default function NavTabs({ active, onChange, activeTab, onSelectTab }) {
  const currentTab = activeTab ?? active
  const handleTabChange = onSelectTab ?? onChange

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-lg flex pb-[env(safe-area-inset-bottom,0px)] z-40 transition-all">
      {TABS.map((t) => {
        const isActive = currentTab === t.key
        const IconComponent = t.Icon
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => handleTabChange?.(t.key)}
            className={`flex-1 py-2 flex flex-col items-center justify-center gap-0.5 text-xs font-label cursor-pointer transition-all active:scale-95 ${
              isActive
                ? 'text-primary font-semibold'
                : 'text-slate-500 hover:text-slate-900 font-medium'
            }`}
          >
            <div className={`p-1 rounded-xl transition-colors ${isActive ? 'bg-primary/10' : ''}`}>
              <IconComponent className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-slate-400'}`} />
            </div>
            <span className="leading-tight">{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
