import type { ReactNode } from "react";
import { FormLabel } from "./FormLabel";
import { TextInput } from "./TextInput";
import { SearchableSelect } from "./SearchableSelect";
import { getPhoneCountryCodeOptions } from "../../lib/phoneNumbers";

type PhoneNumberFieldProps = {
  countryCodeId: string;
  phoneNumberId: string;
  countryCodeValue: string;
  phoneNumberValue: string;
  onCountryCodeChange: (value: string) => void;
  onPhoneNumberChange: (value: string) => void;
  countryCodeLabel?: ReactNode;
  phoneNumberLabel?: ReactNode;
  phoneNumberPlaceholder?: string;
  note?: string;
};

export function PhoneNumberField({
  countryCodeId,
  phoneNumberId,
  countryCodeValue,
  phoneNumberValue,
  onCountryCodeChange,
  onPhoneNumberChange,
  countryCodeLabel = "Country code",
  phoneNumberLabel = "Phone number",
  phoneNumberPlaceholder = "123456789",
  note,
}: PhoneNumberFieldProps) {
  return (
    <div className="form-stack">
      <div className="phone-number-field">
        <FormLabel htmlFor={countryCodeId}>
          {countryCodeLabel}
          <SearchableSelect
            id={countryCodeId}
            value={countryCodeValue}
            onChange={onCountryCodeChange}
            options={getPhoneCountryCodeOptions(countryCodeValue)}
            placeholder="Select country code"
            searchPlaceholder="Search country or code"
            ariaLabel={typeof countryCodeLabel === "string" ? countryCodeLabel : "Country code"}
          />
        </FormLabel>
        <FormLabel htmlFor={phoneNumberId}>
          {phoneNumberLabel}
          <TextInput
            id={phoneNumberId}
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder={phoneNumberPlaceholder}
            value={phoneNumberValue}
            onChange={(event) => onPhoneNumberChange(event.target.value)}
          />
        </FormLabel>
      </div>
      {note ? <small className="muted onboarding-field-note">{note}</small> : null}
    </div>
  );
}
