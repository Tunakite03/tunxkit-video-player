import React from "react";
import { cn } from "@/lib/cn";

interface TunxkitLogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  size?: number | string;
  showText?: boolean;
}

export function TunxkitLogo({
  className,
  size = 32,
  showText = false,
  ...props
}: TunxkitLogoProps) {
  return (
    <div className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="shrink-0 drop-shadow-sm transition-transform hover:scale-105 active:scale-95"
        {...props}
      >
        <defs>
          <linearGradient id="tk-handdrawn-wash" x1="10%" y1="10%" x2="90%" y2="90%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>

        {/* Soft organic watercolor wash blob */}
        <path
          d="M 22,23 C 27,16 45,17 58,16 C 72,15 84,20 87,32 C 90,44 87,63 82,73 C 77,83 62,86 47,85 C 31,84 17,79 15,67 C 13,54 15,32 22,23 Z"
          fill="url(#tk-handdrawn-wash)"
          opacity="0.9"
        />

        {/* Hand-doodled TV Antenna */}
        <path
          d="M 38,18 C 44,14 48,10 52,7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          className="text-foreground"
        />
        <circle
          cx="52.5"
          cy="6.5"
          r="2.2"
          fill="#f59e0b"
          stroke="currentColor"
          strokeWidth="1.8"
          className="text-foreground"
        />
        <path
          d="M 62,18 C 58,13 54,9 50,6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeDasharray="0.5 3"
          opacity="0.75"
          className="text-foreground"
        />

        {/* Hand-drawn monitor frame: Primary ink contour */}
        <path
          d="M 22,22 C 34,20.8 66,21.2 78,22 C 84.5,22.5 87,25.4 87.2,31.5 C 87.6,43 87,61.5 87.2,70.2 C 87.4,76.5 84.2,79.2 78,79.6 C 64,80.2 34,79.8 22,79.2 C 16,78.6 13.3,75.8 13,69.8 C 12.6,58 12.8,34 13.2,29.2 C 13.6,24.2 16.4,22.4 22,22 Z"
          fill="currentColor"
          fillOpacity="0.25"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-foreground"
        />

        {/* Secondary sketchy reinforcement stroke (hand-sketched organic wobble) */}
        <path
          d="M 24,20.8 C 38,21.8 62,22.1 76,21.5 C 84.2,22.1 88.4,24.2 88.6,33.2 C 88.9,47 88.2,63 88.2,71.2 C 87.9,77.8 85.2,80.8 76,81.1 C 60,81.5 32,80.8 20,80.3 C 14.5,80.1 12,76.8 11.8,68.2 C 11.5,55 12,32 12.8,27 C 13.3,23.4 16,21 23,20.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.65"
          className="text-foreground"
        />

        {/* Film spool doodles */}
        <circle
          cx="28"
          cy="27"
          r="3.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-foreground"
        />
        <circle cx="28" cy="27" r="1" fill="currentColor" className="text-foreground" />
        <circle
          cx="72"
          cy="27"
          r="3.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-foreground"
        />
        <circle cx="72" cy="27" r="1" fill="currentColor" className="text-foreground" />

        {/* Hand-drawn central Play Triangle with sketch curve */}
        <path
          d="M 40,36 C 41.5,35.2 43.8,36.4 45.4,37.8 L 65.8,50.2 C 67.5,51.4 68.2,53 68.2,54.4 C 68.2,55.8 67.4,57.3 65.6,58.4 L 45.5,70.8 C 43.6,72 41.4,72.6 39.8,71.8 C 38,71 37.8,68.8 38,66.5 L 38.6,41 C 38.6,38.6 38.8,36.5 40,36 Z"
          fill="#ffffff"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-foreground"
        />

        {/* Play triangle secondary sketchy stroke */}
        <path
          d="M 39.2,34.8 L 67.2,52.5 C 69,53.8 68.8,56.2 67,57.5 L 39.8,73 C 37.8,74.2 36.6,72.8 36.8,69.8 L 37.4,37.8 C 37.5,35.2 38.5,34 39.2,34.8 Z"
          fill="none"
          stroke="#4338ca"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
        />

        {/* Sketchy hatch lines inside Play button */}
        <path
          d="M 43,45 L 49,49 M 43,53 L 55,60 M 43,61 L 52,66"
          fill="none"
          stroke="#f59e0b"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.9"
        />

        {/* Whimsical hand-drawn sparkles */}
        {/* Top right sparkle */}
        <path
          d="M 88,12 C 88,15.5 89.8,17.5 93,17.5 C 89.8,17.5 88,19.5 88,23 C 88,19.5 86.2,17.5 83,17.5 C 86.2,17.5 88,15.5 88,12 Z"
          fill="#f59e0b"
          stroke="currentColor"
          strokeWidth="1"
          className="text-foreground"
        />
        {/* Bottom left sparkle */}
        <path
          d="M 10,83 C 10,85 11.2,86.2 13,86.2 C 11.2,86.2 10,87.4 10,89.5 C 10,87.4 8.8,86.2 7,86.2 C 8.8,86.2 10,85 10,83 Z"
          fill="#06b6d4"
          stroke="currentColor"
          strokeWidth="0.8"
          className="text-foreground"
        />
      </svg>

      {showText && (
        <div className="flex flex-col">
          <span className="font-bold tracking-tight text-sm leading-tight text-foreground">
            Tunxkit
          </span>
          <span className="text-[10px] uppercase font-medium tracking-wider text-muted-foreground">
            Player
          </span>
        </div>
      )}
    </div>
  );
}
