import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// `twMerge` resolves the conflicts `clsx` produces — `cn("p-2", cond && "p-4")` is `p-4`, not
// both — which is what lets a caller override a class the callee set.
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
