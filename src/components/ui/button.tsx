import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-base font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-card hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground shadow-soft hover:bg-secondary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-safety hover:bg-destructive/90",
        outline:
          "border-2 border-primary bg-transparent text-primary hover:bg-primary hover:text-primary-foreground",
        ghost:
          "text-foreground hover:bg-accent hover:text-accent-foreground",
        link:
          "text-primary underline-offset-4 hover:underline",
        // Large touch-friendly variants
        touch:
          "min-h-[56px] min-w-[56px] bg-primary text-primary-foreground shadow-card hover:bg-primary/90 text-lg",
        touchSecondary:
          "min-h-[56px] min-w-[56px] bg-card text-foreground shadow-card border border-border hover:bg-accent text-lg",
        touchOutline:
          "min-h-[56px] min-w-[56px] border-2 border-primary bg-transparent text-primary hover:bg-primary hover:text-primary-foreground text-lg",
        // Safety/Emergency button
        safety:
          "min-h-[64px] min-w-[64px] bg-destructive text-destructive-foreground shadow-safety hover:bg-destructive/90 text-lg font-bold rounded-full",
        // Success variant
        success:
          "bg-success text-success-foreground shadow-soft hover:bg-success/90",
        // Icon-only button
        icon:
          "min-h-[48px] min-w-[48px] bg-card text-foreground shadow-soft hover:bg-accent rounded-full p-0",
      },
      size: {
        default: "h-12 px-6 py-3",
        sm: "h-10 rounded-lg px-4 text-sm",
        lg: "h-14 rounded-xl px-8 text-lg",
        xl: "h-16 rounded-2xl px-10 text-xl",
        icon: "h-12 w-12",
        iconLg: "h-14 w-14",
        iconXl: "h-16 w-16",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
