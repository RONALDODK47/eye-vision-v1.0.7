import { BookMarked } from 'lucide-react';
import { cn } from '../lib/utils';

type Props = {
  onClick: () => void;
  disabled?: boolean;
  count?: number;
  className?: string;
  title?: string;
  /** full = largura total (sidebar); inline = botão compacto na toolbar */
  variant?: 'inline' | 'full';
};

/** Botão padrão «MANDAR PARA O BALANCETE» — mesmo visual do Extrato. */
export default function MandarParaBalanceteButton({
  onClick,
  disabled = false,
  count,
  className,
  title = 'Envia os lançamentos para o balancete/razão',
  variant = 'inline',
}: Props) {
  const label =
    count != null && count > 0 ? (
      <>
        MANDAR PARA O BALANCETE
        <span className="text-[8px] opacity-80">({count})</span>
      </>
    ) : (
      'MANDAR PARA O BALANCETE'
    );

  if (variant === 'full') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={cn(
          'w-full py-2.5 bg-brand-border text-brand-bg text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-40',
          className,
        )}
      >
        <BookMarked size={14} aria-hidden />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'technical-button-primary text-[9px] py-1 px-2 inline-flex items-center gap-1 disabled:opacity-40',
        className,
      )}
    >
      <BookMarked size={11} aria-hidden />
      {label}
    </button>
  );
}
