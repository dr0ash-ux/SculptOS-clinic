import { ReactNode, useEffect, useRef } from "react";
import "./ClinicControls.css";
export function ControlDialog({
  children,
  label,
  busy,
  onClose,
}: {
  children: ReactNode;
  label: string;
  busy: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="control-dialog clinic-controls"
      aria-label={label}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      {children}
    </dialog>
  );
}
