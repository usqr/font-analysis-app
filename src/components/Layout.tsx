import { NavLink, Outlet } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Library' },
  { to: '/analyze', label: 'Analyze' },
  { to: '/compare', label: 'Compare' },
] as const;

export function Layout() {
  return (
    <div className="app">
      <header className="topnav">
        <span className="brand">Font Analyzer</span>
        <nav className="tabs" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className="tab">
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <div className="app-main">
        <Outlet />
      </div>
    </div>
  );
}
