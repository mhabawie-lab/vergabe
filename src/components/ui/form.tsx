import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils/cn';

const FIELD_CLASSES =
  'w-full rounded-lg border border-border-strong bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:opacity-60';

export function Label({
  htmlFor,
  children,
  className,
}: {
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        'mb-1.5 block text-xs font-medium text-text-secondary',
        className,
      )}
    >
      {children}
    </label>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD_CLASSES, 'h-9', className)} {...props} />;
}

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly SelectOption[];
  /** Rendered as the empty value at the top of the list. */
  placeholder?: string;
}

export function Select({
  options,
  placeholder,
  className,
  ...props
}: SelectProps) {
  return (
    <select className={cn(FIELD_CLASSES, 'h-9 pr-8', className)} {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** A labelled field wrapper keeping vertical rhythm consistent. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint !== undefined && (
        <p className="mt-1 text-[11px] text-text-muted">{hint}</p>
      )}
    </div>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2 text-sm text-text-secondary',
        className,
      )}
    >
      <input
        type="checkbox"
        className="size-4 rounded border-border-strong text-brand accent-[var(--brand)]"
        {...props}
      />
      {label}
    </label>
  );
}
