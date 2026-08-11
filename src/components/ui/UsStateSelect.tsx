import {US_STATES} from "@/constants/usStates";

interface UsStateSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function UsStateSelect({
  value,
  onChange,
  placeholder = "Select a state",
  ...props
}: UsStateSelectProps) {
  return (
    <select {...props} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {US_STATES.map((state) => (
        <option key={state.code} value={state.code}>
          {state.name} ({state.code})
        </option>
      ))}
    </select>
  );
}
