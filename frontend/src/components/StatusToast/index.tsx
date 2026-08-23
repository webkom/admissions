import React from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";

export interface StatusToastState {
  id: number;
  message: string;
  tone: "success" | "error";
}

interface StatusToastProps {
  toast: StatusToastState | null;
  onDismiss?: () => void;
}

const StatusToast: React.FC<StatusToastProps> = ({ toast, onDismiss }) => {
  if (!toast) return null;
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      aria-live={toast.tone === "error" ? "assertive" : "polite"}
      className="pointer-events-none fixed inset-x-0 top-4 z-toast flex justify-center"
    >
      <div
        className={cn(
          "pointer-events-auto flex max-w-lg items-center gap-2 rounded-lg border px-4 py-2.5 text-ui font-semibold shadow-lg animate-fade-in",
          toast.tone === "error"
            ? "border-danger-border bg-danger-bg text-danger"
            : "border-success-border bg-success-bg text-success",
        )}
      >
        {toast.tone === "error" ? (
          <AlertTriangle
            size={iconSizes.control}
            aria-hidden="true"
            className="flex-none"
          />
        ) : (
          <Check
            size={iconSizes.control}
            aria-hidden="true"
            className="flex-none"
          />
        )}
        <span>{toast.message}</span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Lukk melding"
            className="inline-flex h-5 w-5 flex-none cursor-pointer items-center justify-center rounded-full text-current opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
          >
            <X size={iconSizes.detail} />
          </button>
        )}
      </div>
    </div>
  );
};

export default StatusToast;
