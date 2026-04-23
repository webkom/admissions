import React from "react";
import cn from "src/utils/cn";

export interface StatusToastState {
  id: number;
  message: string;
  tone: "success" | "error";
}

interface StatusToastProps {
  toast: StatusToastState | null;
}

const StatusToast: React.FC<StatusToastProps> = ({ toast }) => {
  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center"
    >
      <div
        className={cn(
          "pointer-events-auto max-w-lg rounded-lg border px-4 py-2.5 text-ui font-semibold shadow",
          toast.tone === "error"
            ? "border-brand-border bg-brand-subtle text-brand"
            : "border-success-border bg-success-bg text-success",
        )}
      >
        {toast.message}
      </div>
    </div>
  );
};

export default StatusToast;
