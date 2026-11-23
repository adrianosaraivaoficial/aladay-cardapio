import type { ReactNode } from 'react';

const styles = {
  error: 'bg-rose-50 text-aladay-danger',
  success: 'bg-emerald-50 text-aladay-success',
  warning: 'bg-amber-50 text-amber-900',
  progress: 'bg-slate-100 text-slate-700',
};

export function StatusNotice({ tone, children }: { tone: keyof typeof styles; children: ReactNode }) {
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 break-words rounded-aladay-control px-3 py-2 text-sm [&>svg]:shrink-0 ${styles[tone]}`}>
      {children}
    </p>
  );
}
