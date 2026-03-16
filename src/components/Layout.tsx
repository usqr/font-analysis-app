import { NavLink, Outlet } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Library' },
  { to: '/analyze', label: 'Analyze' },
  { to: '/compare', label: 'Compare' },
] as const;

export function Layout() {
  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-200">
      <nav className="flex items-center gap-1 border-b border-neutral-800 px-4 py-2">
        <span className="mr-4 text-sm font-bold tracking-tight text-white">
          Font Analyzer
        </span>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `rounded-md px-3 py-1.5 text-sm transition-colors ${
                isActive
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
