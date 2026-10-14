'use client';

import { useId, type ReactNode } from 'react';

export function RecordField({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: (id: string, helpId: string | undefined) => ReactNode;
}) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  return (
    <div className="journal-field">
      <label htmlFor={id}>{label}</label>
      {children(id, helpId)}
      {help && <small id={helpId}>{help}</small>}
    </div>
  );
}

export function RecordInput({
  label,
  value,
  onChange,
  help,
  required = false,
  decimal = false,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  help?: string;
  required?: boolean;
  decimal?: boolean;
  type?: 'text' | 'datetime-local';
}) {
  return (
    <RecordField label={label} {...(help ? { help } : {})}>
      {(id, helpId) => (
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={type}
          inputMode={decimal ? 'decimal' : undefined}
          required={required}
          aria-describedby={helpId}
          autoComplete="off"
          maxLength={512}
        />
      )}
    </RecordField>
  );
}
