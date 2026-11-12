import { Search } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function SearchInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  return <div className="modern-search">
    <Search size={16} aria-hidden="true" />
    <input {...props} className={cn("input", className)} type="search" />
  </div>;
}
