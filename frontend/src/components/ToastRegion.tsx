import {
  CircleCheck,
  CircleX,
  Info,
  X,
} from "lucide-react";
import { useCommitPass } from "../state/CommitPassProvider";

const icons = {
  success: CircleCheck,
  error: CircleX,
  info: Info,
};

export function ToastRegion() {
  const { toasts, dismissToast } = useCommitPass();

  return (
    <aside className="toast-region" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => {
        const Icon = icons[toast.tone];
        return (
          <div
            className={`toast toast--${toast.tone}`}
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
          >
            <Icon className="toast__icon" size={21} />
            <div>
              <strong>{toast.title}</strong>
              <p>{toast.message}</p>
            </div>
            <button
              className="icon-button toast__close"
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(toast.id)}
            >
              <X size={17} />
            </button>
          </div>
        );
      })}
    </aside>
  );
}

