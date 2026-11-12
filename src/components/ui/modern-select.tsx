"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import { Select } from "radix-ui";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type Option = { value: string; children: ReactNode; disabled?: boolean };
type Props = {
  children: ReactNode;
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  onValueChange?: (value: string) => void;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

export function ModernSelect({ children, name, value, defaultValue, className, disabled, required, onValueChange, ...trigger }: Props) {
  const [internalValue, setInternalValue] = useState<string>();
  const options = Children.toArray(children).filter(isValidElement<Option>).map(child => child.props);
  // Radix reserves the empty string for its placeholder. Prefix values so
  // selecting “Todas” or clearing an optional field remains an explicit choice.
  const encode = (input: string) => "option:" + input;
  const selected = value ?? internalValue ?? defaultValue ?? options[0]?.value ?? "";
  return <Select.Root disabled={disabled} required={required} value={encode(selected)}
    onValueChange={next => {
      const decoded = next.slice(7);
      if (value === undefined) setInternalValue(decoded);
      onValueChange?.(decoded);
    }}>
    {name && !disabled && <input type="hidden" name={name} value={selected} />}
    <Select.Trigger {...trigger} className={cn("input modern-select-trigger", className)}>
      <Select.Value placeholder="Selecione" /><Select.Icon asChild><ChevronDown size={16} aria-hidden /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content className="modern-select-content" position="popper" sideOffset={6} collisionPadding={12}>
        <Select.ScrollUpButton className="modern-select-scroll"><ChevronUp size={16} /></Select.ScrollUpButton>
        <Select.Viewport>
          {options.map(option => <Select.Item className="modern-select-item" key={option.value} value={encode(option.value)} disabled={option.disabled}>
            <Select.ItemText>{option.children}</Select.ItemText>
            <Select.ItemIndicator><Check size={16} aria-hidden /></Select.ItemIndicator>
          </Select.Item>)}
        </Select.Viewport>
        <Select.ScrollDownButton className="modern-select-scroll"><ChevronDown size={16} /></Select.ScrollDownButton>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}

