import { cn } from '../lib/utils';

type Props = {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label?: string;
  description?: string;
  className?: string;
};

export default function AutomationToggle({
  enabled,
  onChange,
  label = 'Automação',
  description,
  className,
}: Props) {
  return (
    <label
      className={cn(
        'flex items-center gap-3 px-3 py-2 border border-brand-border bg-brand-sidebar/20 shadow-[2px_2px_0_0_#141414] cursor-pointer',
        className,
      )}
    >
      <span className="relative inline-block w-11 h-6 shrink-0">
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-0 border-2 border-brand-border transition-colors pointer-events-none',
            'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-border',
            enabled ? 'bg-emerald-700' : 'bg-brand-sidebar/60',
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-0.5 left-0.5 w-4 h-4 bg-white border border-brand-border transition-transform pointer-events-none',
            enabled && 'translate-x-5',
          )}
        />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest leading-none">
          {label} {enabled ? 'ligada' : 'desligada'}
        </p>
        {description ? (
          <p className="text-[8px] font-bold uppercase opacity-50 mt-1 leading-snug max-w-md">
            {description}
          </p>
        ) : null}
      </div>
    </label>
  );
}
