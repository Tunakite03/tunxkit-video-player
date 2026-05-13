import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/cn'

interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
    /** Optional buffered fraction (0..1) to draw behind the range, useful for video progress. */
    buffered?: number
    /** Visual size of the slider. */
    size?: 'sm' | 'md' | 'lg'
    /** Extra class names applied to the Thumb element. */
    thumbClassName?: string
}

export const Slider = React.forwardRef<
    React.ElementRef<typeof SliderPrimitive.Root>,
    SliderProps
>(({ className, buffered, size = 'md', thumbClassName, ...props }, ref) => {
    const trackHeight = size === 'sm' ? 'h-1' : size === 'lg' ? 'h-2' : 'h-1.5'
    const thumbSize = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'
    return (
        <SliderPrimitive.Root
            ref={ref}
            className={cn(
                'relative flex w-full touch-none select-none items-center no-drag',
                className,
            )}
            {...props}
        >
            <SliderPrimitive.Track
                className={cn(
                    'relative w-full grow overflow-hidden rounded-full bg-foreground/15',
                    trackHeight,
                )}
            >
                {buffered !== undefined && (
                    <div
                        className="absolute inset-y-0 left-0 bg-foreground/25"
                        style={{ width: `${Math.max(0, Math.min(1, buffered)) * 100}%` }}
                    />
                )}
                <SliderPrimitive.Range className="absolute h-full bg-primary" />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb
                className={cn(
                    'block rounded-full border-2 border-primary bg-background shadow ring-offset-background transition-[transform,opacity] hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50',
                    thumbSize,
                    thumbClassName,
                )}
            />
        </SliderPrimitive.Root>
    )
})
Slider.displayName = 'Slider'
