import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider delayDuration={250} skipDelayDuration={150}>
        {children}
        <Toaster position="bottom-right" theme="system" richColors closeButton />
      </TooltipProvider>
    </ThemeProvider>
  );
}
