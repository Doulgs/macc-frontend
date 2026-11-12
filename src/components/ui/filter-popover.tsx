"use client";

import { Popover } from "radix-ui";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "./button";

export function FilterPopover({ children, open, onOpenChange, count = 0 }: {
  children: React.ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void; count?: number;
}) {
  return <Popover.Root open={open} onOpenChange={onOpenChange}>
    <Popover.Trigger asChild><Button variant="outline"><SlidersHorizontal size={16} /> Filtros {count > 0 && <span className="filter-count">{count}</span>}</Button></Popover.Trigger>
    <Popover.Portal><Popover.Content className="filter-popover" align="end" sideOffset={9} collisionPadding={12} aria-label="Filtros">
      <div className="filter-popover-heading"><strong>Filtros</strong><Popover.Close asChild><Button variant="ghost" size="icon" aria-label="Fechar filtros"><X size={16} /></Button></Popover.Close></div>
      {children}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
