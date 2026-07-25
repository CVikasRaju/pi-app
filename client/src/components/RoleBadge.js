'use client';

import { getRoleMeta } from '../lib/catalystAuth';

/**
 * RoleBadge — Color-coded pill showing the user's role
 *
 * @param {{ role: string, size?: 'sm' | 'md' | 'lg', showIcon?: boolean, showDescription?: boolean }} props
 */
export default function RoleBadge({ role, size = 'md', showIcon = true, showDescription = false }) {
  if (!role) return null;

  const meta = getRoleMeta(role);

  const sizes = {
    sm: { pill: 'px-2 py-0.5 text-xs gap-1',   icon: 'text-sm' },
    md: { pill: 'px-3 py-1 text-sm gap-1.5',   icon: 'text-base' },
    lg: { pill: 'px-4 py-1.5 text-base gap-2', icon: 'text-lg' },
  };

  const s = sizes[size] || sizes.md;

  return (
    <div className="flex flex-col gap-1">
      <span
        className={`inline-flex items-center rounded-full font-semibold ${s.pill}`}
        style={{
          color:           meta.color,
          backgroundColor: meta.bgColor,
          border:          `1px solid ${meta.color}40`,
        }}
      >
        {showIcon && <span className={s.icon}>{meta.icon}</span>}
        {meta.label}
      </span>
      {showDescription && (
        <span className="text-xs text-slate-400 pl-1">{meta.description}</span>
      )}
    </div>
  );
}
