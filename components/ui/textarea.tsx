import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 min-w-0 w-full resize-y rounded-[10px] border border-input bg-muted px-4 py-3 text-sm font-semibold text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:bg-white focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
