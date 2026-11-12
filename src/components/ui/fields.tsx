"use client";
import { useId } from "react";

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode; className?: string }) {
  const id = useId();
  return <div className={className ? "field " + className : "field"}>
    <label htmlFor={id}>{label}</label>
    {children({ id, "aria-invalid": !!error, "aria-describedby": error || hint ? id + "-hint" : undefined })}
    {error || hint ? <small id={id + "-hint"} className={error ? "field-error" : "muted"}>{error ?? hint}</small> : null}
  </div>;
}
