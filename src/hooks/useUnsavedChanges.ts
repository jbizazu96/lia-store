"use client";

import { useEffect } from "react";
import { useConfirmation } from "@/context/ConfirmationContext";

/** Warn before leaving when an edit has not been saved. */
export function useUnsavedChanges(
  hasUnsavedChanges: boolean,
  message = "You have unsaved changes. Leave without saving them?"
): void {
  const { confirm } = useConfirmation();

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleDocumentClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest("a[href]");
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        event.defaultPrevented
      ) return;

      event.preventDefault();
      event.stopPropagation();

      void confirm({
        title: "Unsaved changes",
        message,
        confirmLabel: "Leave without saving",
        cancelLabel: "Keep editing",
        destructive: true,
      }).then((confirmed) => {
        if (confirmed) window.location.assign(link.href);
      });
    };

    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [hasUnsavedChanges, message, confirm]);
}
