import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-brand-foreground hover:bg-brand-hover disabled:hover:bg-brand',
  secondary:
    'bg-surface-raised text-text-primary ring-1 ring-inset ring-border-strong hover:bg-surface-sunken',
  ghost: 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
  danger: 'bg-danger text-white hover:opacity-90',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
};

const BASE_CLASSES =
  'inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(BASE_CLASSES, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}

interface LinkButtonProps {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}

/** A link styled as a button. Keeps navigation semantics intact. */
export function LinkButton({
  href,
  variant = 'secondary',
  size = 'md',
  className,
  children,
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={cn(BASE_CLASSES, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className)}
    >
      {children}
    </Link>
  );
}
