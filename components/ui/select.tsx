import * as React from "react";
import { cn } from "@/lib/utils";

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 min-w-0 w-full rounded-[10px] border border-input bg-muted px-4 text-sm font-semibold text-foreground outline-none transition-colors focus-visible:border-foreground focus-visible:bg-white focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
