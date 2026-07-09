import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import {
  formatLocaleNumberForInput,
  parseLocaleNumber,
  sanitizeNumericDraft,
} from '../../lib/localeNumber';
import { cn } from '../lib/utils';

type FreeNumericInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'inputMode'
> & {
  value: number;
  onChange: (value: number) => void;
  inputMode?: 'decimal' | 'numeric';
  /** Quando true (padrão), exibe vazio se o valor armazenado for 0. */
  hideZeroWhenBlurred?: boolean;
  /** Casas decimais na exibição após blur (padrão 6). */
  displayDecimals?: number;
};

/**
 * Campo numérico livre: aceita vírgula decimal e ponto de milhar (ex.: 6.268,75).
 * Confirma o valor só no blur — não interfere enquanto digita.
 */
export function FreeNumericInput({
  value,
  onChange,
  className,
  inputMode = 'decimal',
  hideZeroWhenBlurred = true,
  displayDecimals = 6,
  onFocus,
  onBlur,
  ...rest
}: FreeNumericInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const focused = useRef(false);

  const formatStored = (n: number) => {
    if (hideZeroWhenBlurred && n === 0) return '';
    return formatLocaleNumberForInput(n, displayDecimals);
  };

  useEffect(() => {
    if (!focused.current) setDraft(null);
  }, [value]);

  const display = draft !== null ? draft : formatStored(value);

  return (
    <input
      {...rest}
      type="text"
      inputMode={inputMode}
      autoComplete="off"
      spellCheck={false}
      className={cn(className)}
      value={display}
      onFocus={(e) => {
        focused.current = true;
        setDraft(formatStored(value));
        onFocus?.(e);
      }}
      onBlur={(e) => {
        focused.current = false;
        const parsed = parseLocaleNumber(draft ?? display, value);
        onChange(parsed);
        setDraft(null);
        onBlur?.(e);
      }}
      onChange={(e) => {
        setDraft(sanitizeNumericDraft(e.target.value));
      }}
    />
  );
}
