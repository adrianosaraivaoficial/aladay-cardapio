import { useId, useRef, useState } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen, X, type LucideIcon } from 'lucide-react';

interface NavigationItem<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
  count?: number;
}

export function ResponsiveSidebar<T extends string>({ groups, active, onSelect }: {
  groups: { label: string; items: NavigationItem<T>[] }[];
  active: T;
  onSelect: (id: T) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const activeLabel = groups.flatMap(group => group.items).find(item => item.id === active)?.label;

  function navigation(compact: boolean) {
    return (
      <nav aria-label="Seções do painel" className="space-y-4">
        {groups.map(group => (
          <div key={group.label}>
            <p className={compact ? 'sr-only' : 'mb-1 px-2 text-xs font-semibold text-slate-600'}>{group.label}</p>
            <ul className="space-y-1">
              {group.items.map(({ id, label, icon: Icon, count }) => (
                <li key={id}>
                  <button
                    type="button"
                    aria-label={label}
                    aria-current={id === active ? 'page' : undefined}
                    title={compact ? label : undefined}
                    className={`aladay-action w-full text-left ${compact ? '!px-0' : '!justify-start !px-2'} ${id === active ? 'bg-aladay-brand-soft text-aladay-ink' : 'text-slate-700 hover:bg-slate-100'}`}
                    onClick={() => { onSelect(id); drawer.current?.close(); }}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    {!compact && <span className="min-w-0 flex-1 break-words">{label}</span>}
                    {!compact && count != null && <span aria-hidden="true" className="rounded-full bg-slate-100 px-2 text-xs">{count}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    );
  }

  return (
    <>
      <aside className={`hidden shrink-0 border-r border-aladay-line bg-white p-2 lg:block ${collapsed ? 'w-16' : 'w-56 xl:w-64'}`}>
        <div className="mb-4 flex items-center justify-between px-1 text-aladay-ink">
          {!collapsed && <span className="ml-2 font-extrabold">Aladay</span>}
          <button type="button" aria-label={collapsed ? 'Expandir navegação' : 'Recolher navegação'} onClick={() => setCollapsed(value => !value)} className="aladay-action !px-2 hover:bg-slate-100">
            {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          </button>
        </div>
        {navigation(collapsed)}
      </aside>
      <div className="flex items-center gap-2 border-b border-aladay-line bg-white p-2 lg:hidden">
        <button type="button" aria-haspopup="dialog" onClick={() => drawer.current?.showModal()} className="aladay-action shrink-0 text-aladay-ink hover:bg-aladay-brand-soft">
          <Menu size={18} aria-hidden="true" /> Seções
        </button>
        <span className="min-w-0 truncate text-sm font-semibold text-slate-700">{activeLabel}</span>
      </div>
      <dialog ref={drawer} aria-labelledby={titleId} className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(86vw,21rem)] max-w-none border-r border-aladay-line bg-white p-4 backdrop:bg-slate-950/60">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={titleId} className="font-extrabold text-aladay-ink">Aladay</h2>
          <button type="button" aria-label="Fechar navegação" onClick={() => drawer.current?.close()} className="aladay-action !px-3 hover:bg-slate-100">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {navigation(false)}
      </dialog>
    </>
  );
}
