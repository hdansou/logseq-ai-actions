import type { FunctionComponent } from "preact";

interface PillRadioProps {
  readonly name: string;
  readonly value: string;
  readonly options: ReadonlyArray<{ value: string; label: string }>;
  readonly onChange?: (v: string) => void;
  readonly disabled?: boolean;
}

export const PillRadio: FunctionComponent<PillRadioProps> = ({
  name,
  value,
  options,
  onChange,
  disabled,
}) => (
  <div class="manage-radio-group" role="radiogroup" aria-label={name}>
    {options.map((opt) => {
      const checked = opt.value === value;
      const cls = `manage-radio${checked ? " checked" : ""}${disabled ? " disabled" : ""}`;
      return (
        <label key={opt.value} class={cls}>
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={checked}
            disabled={disabled}
            onChange={() => {
              if (!disabled && onChange) onChange(opt.value);
            }}
            // Visually hidden — the parent <label> carries the pill style.
            style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0"
          />
          {checked ? "●" : "○"} {opt.label}
        </label>
      );
    })}
  </div>
);
