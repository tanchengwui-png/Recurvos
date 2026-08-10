import type { CurrencyDefinition } from "../../types";
import { normaliseCurrencyCode } from "../../lib/currency";

type CurrencySelectProps = {
  id: string;
  value: string;
  currencies: readonly CurrencyDefinition[];
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
};

export function CurrencySelect({ id, value, currencies, onChange, error, disabled }: CurrencySelectProps) {
  return <>
    <select id={id} value={normaliseCurrencyCode(value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} disabled={disabled} onChange={(event) => onChange(normaliseCurrencyCode(event.target.value))}>
      <option value="">Select currency</option>
      {currencies.filter((currency) => currency.isActive).map((currency) => {
        const code = normaliseCurrencyCode(currency.code);
        return <option key={currency.id} value={code}>{`${code} — ${currency.name}`}</option>;
      })}
    </select>
    {error ? <span id={`${id}-error`} className="form-field-error" role="alert">{error}</span> : null}
  </>;
}
