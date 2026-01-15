import * as React from "react"
import { Check, ChevronDown, X } from "lucide-react"
import { cn } from "@/utils/cn"

export interface MultiSelectOption {
    label: string
    value: string | number
    icon?: React.ReactNode
}

interface MultiSelectProps {
    options: MultiSelectOption[]
    value: (string | number)[]
    onChange: (value: (string | number)[]) => void
    placeholder?: string
    className?: string
}

export function MultiSelect({ options, value, onChange, placeholder = "Select...", className }: MultiSelectProps) {
    const [open, setOpen] = React.useState(false)

    // Close on click outside
    const ref = React.useRef<HTMLDivElement>(null)
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])
    
    const handleToggle = (val: string | number) => {
        if (value.includes(val)) {
            onChange(value.filter(v => v !== val))
        } else {
            onChange([...value, val])
        }
    }
    
    // Derived display
    const selectedOptions = options.filter(o => value.includes(o.value))
    
    return (
        <div className={cn("relative", className)} ref={ref}>
            <div
                className="flex min-h-10 w-full cursor-pointer flex-wrap items-center gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent/10 focus:outline-none focus:ring-1 focus:ring-ring"
                onClick={() => setOpen(!open)}
            >
                {selectedOptions.length === 0 && (
                    <span className="text-muted-foreground">{placeholder}</span>
                )}
                {selectedOptions.map(opt => (
                    <span key={opt.value} className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground border border-secondary-foreground/20">
                        {opt.icon && <span className="mr-1 flex items-center">{opt.icon}</span>}
                        {opt.label}
                        <span 
                            role="button" 
                            className="ml-1 cursor-pointer rounded-full hover:bg-destructive/20 hover:text-destructive transition-colors p-0.5"
                            onClick={(e) => {
                                e.stopPropagation()
                                handleToggle(opt.value)
                            }}
                        >
                            <X className="h-3 w-3" />
                        </span>
                    </span>
                ))}
                <ChevronDown className="ml-auto h-4 w-4 opacity-50 shrink-0" />
            </div>

            {open && (
                <div className="absolute z-60 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-md animate-in fade-in-80">
                    {options.length === 0 ? (
                        <div className="px-2 py-2 text-sm text-muted-foreground text-center">
                            无可用选项
                        </div>
                    ) : (
                        options.map((option) => {
                            const isSelected = value.includes(option.value)
                            return (
                                <div
                                    key={option.value}
                                    className={cn(
                                        "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                                        isSelected && "bg-accent/20"
                                    )}
                                    onClick={() => handleToggle(option.value)}
                                >
                                    <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                        isSelected ? "bg-primary text-primary-foreground" : "opacity-50"
                                    )}>
                                        {isSelected && <Check className="h-3 w-3" />}
                                    </div>
                                    {option.icon && <span className="mr-2 flex items-center text-muted-foreground">{option.icon}</span>}
                                    <span>{option.label}</span>
                                </div>
                            )
                        })
                    )}
                </div>
            )}
        </div>
    )
}
