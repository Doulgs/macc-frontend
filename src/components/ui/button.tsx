import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("button", {
  variants: { variant: { primary: "button-primary", outline: "button-outline", ghost: "button-ghost", danger: "button-danger" }, size: { default: "", small: "button-small", icon: "button-icon" } },
  defaultVariants: { variant: "primary", size: "default" },
});

export function Button({ asChild, className, variant, size, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : "button";
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
