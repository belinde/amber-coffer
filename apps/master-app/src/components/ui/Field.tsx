import type { ReactElement, ReactNode } from 'react';

type Props = {
  label: ReactNode;
  htmlFor?: string;
  error?: string | undefined;
  children: ReactNode;
};

export function Field({ label, htmlFor, error, children }: Props): ReactElement {
  const invalid = Boolean(error);
  return (
    <div className={invalid ? 'field field--invalid' : 'field'}>
      <label htmlFor={htmlFor}>{label}</label>
      <div className={invalid ? 'field-control field-control--invalid' : 'field-control'}>
        {children}
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
