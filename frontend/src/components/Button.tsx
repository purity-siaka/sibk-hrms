import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "gold" | "ghost" | "danger" | "quiet";
type Size = "md" | "sm";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-navy text-white hover:bg-blue",
  gold: "bg-gold text-navy-dark hover:bg-[#D8B25E]",
  ghost: "bg-white text-navy border border-[#C5CEEA] hover:bg-[#EEF1FB]",
  danger: "bg-white text-danger border border-[#E7B7AF] hover:bg-danger-soft",
  quiet: "bg-transparent text-navy hover:bg-[#EEF1FB]",
};
const SIZES: Record<Size, string> = {
  md: "min-h-[40px] px-4 py-2 text-sm",
  sm: "min-h-[34px] px-3 py-1.5 text-[13px]",
};

export function Button({ variant = "primary", size = "md", loading, icon, children, className = "", disabled, type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

interface IconProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

export function IconButton({ label, children, className = "", type = "button", ...rest }: IconProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-navy transition-colors hover:bg-[#EEF1FB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
