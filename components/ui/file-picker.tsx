"use client";

import {
  ForwardedRef,
  InputHTMLAttributes,
  forwardRef,
  useId,
  useRef,
} from "react";

import { cn } from "@/lib/utils/cn";

type FilePickerProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & {
  fileName?: string | null;
  buttonLabel?: string;
  emptyLabel?: string;
};

function assignRef(
  ref: ForwardedRef<HTMLInputElement>,
  node: HTMLInputElement | null,
) {
  if (typeof ref === "function") {
    ref(node);
    return;
  }

  if (ref) {
    ref.current = node;
  }
}

export const FilePicker = forwardRef<HTMLInputElement, FilePickerProps>(
  (
    {
      className,
      fileName,
      buttonLabel = "Choose File",
      emptyLabel = "No file chosen",
      disabled = false,
      onChange,
      id,
      ...props
    },
    ref,
  ) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const visibleLabel = fileName?.trim() || emptyLabel;

    return (
      <div className="relative">
        <input
          {...props}
          id={inputId}
          ref={(node) => {
            inputRef.current = node;
            assignRef(ref, node);
          }}
          type="file"
          disabled={disabled}
          onChange={onChange}
          className="sr-only"
          tabIndex={-1}
        />

        <button
          type="button"
          className={cn("ims-file-picker", className)}
          disabled={disabled}
          aria-controls={inputId}
          aria-label={buttonLabel}
          onClick={() => inputRef.current?.click()}
        >
          <span className="ims-file-picker-trigger">{buttonLabel}</span>
          <span
            className="ims-file-picker-name"
            data-empty={fileName ? "false" : "true"}
            title={visibleLabel}
          >
            {visibleLabel}
          </span>
        </button>
      </div>
    );
  },
);

FilePicker.displayName = "FilePicker";
