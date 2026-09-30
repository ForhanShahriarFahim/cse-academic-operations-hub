"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export interface ConfirmRequest {
  /** Names the item, e.g. "Delete CSE-2101 on Saturday?" */
  title: string;
  /** States the consequence in one or two sentences. */
  body: ReactNode;
  confirmLabel: string;
  /** "danger" for removals and irreversible changes; "primary" for approvals such as publishing. */
  tone?: "danger" | "primary";
}

/**
 * Accessible replacement for window.confirm(). Returns `ask`, which resolves
 * true only when the person confirms, and the dialog element to render.
 * Cancel has initial focus; Esc and Cancel resolve false.
 */
export function useConfirm(): [(request: ConfirmRequest) => Promise<boolean>, ReactNode] {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setRequest(null);
    dialog.current?.close();
    const target = returnFocus.current;
    returnFocus.current = null;
    if (target?.isConnected) target.focus();
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (request && element && !element.open) element.showModal();
  }, [request]);

  const ask = useCallback((next: ConfirmRequest) => {
    resolver.current?.(false);
    returnFocus.current = document.activeElement as HTMLElement | null;
    setRequest(next);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const element = (
    <dialog
      ref={dialog}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      onCancel={(event) => { event.preventDefault(); settle(false); }}
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-xl border border-[var(--color-line)] bg-sheet p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-[rgba(16,29,22,0.45)]"
    >
      {request ? (
        <div className="p-5">
          <h2 id="confirm-title" className="font-display text-[18px] font-semibold leading-snug">{request.title}</h2>
          <div id="confirm-body" className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{request.body}</div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" autoFocus onClick={() => settle(false)} className="min-h-9 rounded-md border border-[var(--color-line)] bg-sheet px-4 text-[13.5px] font-medium">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => settle(true)}
              className={`min-h-9 rounded-md px-4 text-[13.5px] font-semibold text-white ${request.tone === "primary" ? "bg-[var(--color-pine)]" : "bg-[var(--color-clay)]"}`}
            >
              {request.confirmLabel}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );

  return [ask, element];
}
