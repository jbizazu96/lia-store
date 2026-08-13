"use client";

import {useEffect} from "react";
import {reportClientIssue} from "@/services/monitoring/clientErrorReporter";

export function GlobalClientErrorReporter() {
  useEffect(() => {
    const reportError = (event: ErrorEvent) => {
      reportClientIssue({
        area: "browser.unhandled_error",
        message: event.message || "Unhandled browser error",
        severity: "fatal",
        error: event.error,
        metadata: {filename: event.filename, line: event.lineno, column: event.colno},
      });
    };
    const reportResourceFailure = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLScriptElement) &&
          !(target instanceof HTMLLinkElement) &&
          !(target instanceof HTMLImageElement)) return;
      reportClientIssue({
        area: "hosted.resource_load",
        message: "Hosted application resource failed to load",
        severity: target instanceof HTMLImageElement ? "warning" : "fatal",
        metadata: {resourceType: target.tagName.toLowerCase()},
      });
    };
    const reportRejection = (event: PromiseRejectionEvent) => {
      reportClientIssue({
        area: "browser.unhandled_rejection",
        message: "Unhandled promise rejection",
        severity: "fatal",
        error: event.reason,
      });
    };
    const blankScreenTimer = window.setTimeout(() => {
      if (document.body.innerText.trim().length === 0) {
        reportClientIssue({
          area: "hosted.blank_screen",
          message: "The hosted application rendered a blank screen",
          severity: "fatal",
        });
      }
    }, 10_000);
    window.addEventListener("error", reportError);
    window.addEventListener("error", reportResourceFailure, true);
    window.addEventListener("unhandledrejection", reportRejection);
    return () => {
      window.clearTimeout(blankScreenTimer);
      window.removeEventListener("error", reportError);
      window.removeEventListener("error", reportResourceFailure, true);
      window.removeEventListener("unhandledrejection", reportRejection);
    };
  }, []);

  return null;
}
