import * as React from "react";
import { Button, type ButtonProps } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";
import { cn } from "@/lib/cn";

interface IconButtonProps extends ButtonProps {
  /** Visible tooltip + accessible label. */
  label: string;
  /** Optional keyboard shortcut display (e.g. "Space"). */
  shortcut?: string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, shortcut, className, variant = "ghost", size = "icon", children, ...props }, ref) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={ref}
          aria-label={label}
          variant={variant}
          size={size}
          className={cn("text-foreground/85 hover:text-foreground", className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <span>{label}</span>
        {shortcut && (
          <kbd className="ml-2 rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[10px]">
            {shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  ),
);
IconButton.displayName = "IconButton";
