"use client";
import { Dialog as Primitive } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "./button";

export function Dialog({ open, onOpenChange, title, description, children, busy = false }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: React.ReactNode; busy?: boolean }) {
  return <Primitive.Root open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
    <Primitive.Portal>
      <Primitive.Overlay className="dialog-overlay" />
      <Primitive.Content className="dialog-content" {...(!description ? { "aria-describedby": undefined } : {})} onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onPointerDownOutside={e => e.preventDefault()}>
        <Primitive.Title>{title}</Primitive.Title>
        {description && <Primitive.Description className="muted">{description}</Primitive.Description>}
        <Primitive.Close asChild><Button variant="ghost" size="icon" className="dialog-close" aria-label="Fechar" disabled={busy}><X size={19} /></Button></Primitive.Close>
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  </Primitive.Root>;
}
