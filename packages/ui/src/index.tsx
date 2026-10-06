import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

function classNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function Button({
  className,
  variant = 'primary',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet';
}) {
  return (
    <button
      type={type}
      className={classNames('button', `button-${variant}`, className)}
      {...props}
    />
  );
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classNames('panel', className)} {...props} />;
}

export function Badge({
  children,
  variant = 'neutral',
}: {
  children: ReactNode;
  variant?: 'neutral' | 'success';
}) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M6 17V7h12M6 12h8M14 7v10M10 17h8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!compact && <span>Trading Journal</span>}
    </span>
  );
}
