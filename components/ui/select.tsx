import { forwardRef, SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn("ims-select", className)} {...props} />
  ),
);

Select.displayName = "Select";
