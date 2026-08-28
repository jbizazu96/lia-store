"use client";

/*
|--------------------------------------------------------------------------
| Account Deletion Review Workspace
|--------------------------------------------------------------------------
|
| Deletion records are read and decided through protected Admin callables.
| This page does not invoke the destructive deletion engine; an approved
| driver request waits for the existing scheduled backend workflow.
|
*/

import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileWarning,
  LoaderCircle,
  MessageSquareMore,
  RotateCcw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import {
  useRouter,
} from "next/navigation";
import {
  adminWorkspaceClientService,
} from "@/services/admin/adminWorkspaceClientService";
import type {
  AdminAccountDeletionRequestCounts,
  AdminAccountDeletionRequestDetail,
  AdminAccountDeletionRequestListItem,
  AdminAccountDeletionStatus,
} from "@/types/adminWorkspace";

const statuses: Array<{
  value: AdminAccountDeletionStatus;
  label: string;
}> = [
  {value: "pending_review", label: "Pending review"},
  {value: "more_information_required", label: "More information"},
  {value: "approved", label: "Approved"},
  {value: "rejected", label: "Rejected"},
  {value: "failed", label: "Failed"},
  {value: "completed", label: "Completed"},
];

const minimumDeletionDate = new Date(Date.now() + 86400000)
  .toISOString()
  .slice(0, 10);

function statusClass(status: string): string {
  if (status === "approved" || status === "completed") return "bg-green-100 text-green-700";
  if (status === "rejected" || status === "failed") return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-800";
}

function displayDate(value: string | null): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function defaultDeletionDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

export function AccountDeletionReviewWorkspace({
  requestId,
}: {
  requestId?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<AdminAccountDeletionStatus>("pending_review");
  const [requests, setRequests] = useState<AdminAccountDeletionRequestListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [counts, setCounts] = useState<AdminAccountDeletionRequestCounts>({
    pending_review: 0,
    more_information_required: 0,
    approved: 0,
    rejected: 0,
    failed: 0,
  });
  const [selected, setSelected] = useState<AdminAccountDeletionRequestDetail | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected" | "more_information_required" | null>(null);
  const [notes, setNotes] = useState("");
  const [scheduledDeletionDate, setScheduledDeletionDate] = useState(defaultDeletionDate);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const listLoadedRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const requestSequenceRef = useRef(0);

  const loadList = async (cursor?: string) => {
    if (requestId) return;
    const requestSequence = cursor ? requestSequenceRef.current : ++requestSequenceRef.current;
    if (cursor) {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
    } else if (!listLoadedRef.current) {
      setLoading(true);
    }
    setError("");
    try {
      const result = await adminWorkspaceClientService.getAccountDeletionRequests(status, cursor);
      if (!cursor && requestSequence !== requestSequenceRef.current) return;
      setRequests((current) => cursor ? [...current, ...result.requests] : result.requests);
      setCounts(result.counts);
      setNextCursor(result.nextCursor);
      listLoadedRef.current = true;
    } catch (reason) {
      if (requestSequence === requestSequenceRef.current) setError(reason instanceof Error ? reason.message : "Unable to load deletion requests.");
    } finally {
      setLoading(false);
      loadingMoreRef.current = false;
    }
  };

  const loadSelected = async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const result = await adminWorkspaceClientService.getAccountDeletionRequest(id);
      setSelected(result);
      setScheduledDeletionDate(result.scheduledDeletionAt
        ? result.scheduledDeletionAt.slice(0, 10)
        : defaultDeletionDate());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load this deletion request.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Reset selection state whenever the route or queue changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(null);
    setDecision(null);
    setNotes("");
    if (requestId) {
      void loadSelected(requestId);
      return;
    }
    void loadList();
    // The selected tab and route are intentional reload inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, status]);

  const submitDecision = async () => {
    if (!selected || !decision) return;
    setWorking(true);
    setError("");
    try {
      await adminWorkspaceClientService.decideAccountDeletionRequest({
        requestId: selected.id,
        decision,
        ...(notes.trim() ? {notes: notes.trim()} : {}),
        ...(decision === "approved" ? {scheduledDeletionDate} : {}),
      });
      setDecision(null);
      setNotes("");
      await loadSelected(selected.id);
      await loadList();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save this decision.");
    } finally {
      setWorking(false);
    }
  };

  const retryDeletion = async () => {
    if (!selected || selected.status !== "failed") return;
    setWorking(true);
    setError("");
    try {
      await adminWorkspaceClientService.retryAccountDeletionRequest(selected.id);
      await loadSelected(selected.id);
      await loadList();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to retry this deletion.");
    } finally {
      setWorking(false);
    }
  };

  const reinstateAccount = async () => {
    if (!selected) return;
    setWorking(true);
    setError("");
    try {
      await adminWorkspaceClientService.reinstateAccountDeletionRequest(selected.id);
      await loadSelected(selected.id);
      await loadList();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to reinstate this account.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <section>
      {requestId && <button data-admin-read-action type="button" onClick={() => router.push("/admin/deletion-requests")} className="mb-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"><ChevronRight className="h-4 w-4 rotate-180" />Back to deletion requests</button>}
      <p className="text-sm font-bold tracking-wide text-orange-600">ACCOUNT DELETION</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Deletion requests</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Review requests without directly deleting an account. Driver approvals are scheduled with a grace period and processed later by the protected deletion workflow.</p>

      {!requestId && <><div className="mt-6 flex flex-wrap gap-2">{statuses.map((item) => <button data-admin-read-action key={item.value} type="button" onClick={() => setStatus(item.value)} className={"rounded-full px-4 py-2 text-sm font-bold " + (status === item.value ? "bg-orange-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>{item.label}</button>)}</div><div className="mt-6 grid gap-3 sm:grid-cols-3"><CountCard label="Pending review" value={counts.pending_review} tone="bg-amber-50 text-amber-800" /><CountCard label="More information" value={counts.more_information_required} tone="bg-blue-50 text-blue-700" /><CountCard label="Approved / scheduled" value={counts.approved} tone="bg-green-50 text-green-700" /></div></>}

      {error && <p className="mt-5 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className={"mt-6 grid gap-6 " + (requestId ? "max-w-5xl" : "xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)]")}>
        {!requestId && <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold">{statuses.find((item) => item.value === status)?.label}</h2></div>{loading ? <div className="p-5 text-sm text-slate-500">Loading deletion requests...</div> : requests.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No requests in this queue.</div> : <div className="divide-y divide-slate-100">{requests.map((item) => <button key={item.id} type="button" onClick={() => router.push("/admin/deletion-requests/" + item.id)} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-orange-50/40"><div className="min-w-0 flex-1"><p className="font-bold capitalize text-slate-900">{item.ownerType} account</p><p className="mt-1 text-sm text-slate-500">{item.reasonCode.replace(/_/g, " ")}</p><p className="mt-1 text-xs text-slate-400">Requested {displayDate(item.requestedAt)}</p></div><ChevronRight className="h-5 w-5 shrink-0 text-slate-400" /></button>)}</div>}</section>}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:p-6">{!selected ? <div className="flex min-h-80 flex-col items-center justify-center text-center">{loading ? <><LoaderCircle className="h-8 w-8 animate-spin text-orange-600" /><p className="mt-3 text-sm text-slate-500">Loading deletion request...</p></> : <><ShieldAlert className="h-10 w-10 text-orange-500" /><h2 className="mt-4 text-lg font-bold">Select a request</h2><p className="mt-1 max-w-sm text-sm text-slate-500">The protected account deletion request will open here for a review decision.</p></>}</div> : <DeletionDetail detail={selected} decision={decision} notes={notes} scheduledDeletionDate={scheduledDeletionDate} working={working} onDecision={(value) => { setDecision(value); setNotes(""); }} onNotes={setNotes} onDate={setScheduledDeletionDate} onSubmit={() => void submitDecision()} onRetry={() => void retryDeletion()} onReinstate={() => void reinstateAccount()} onCancel={() => { setDecision(null); setNotes(""); }} />}</section>
      </div>
      {!requestId && nextCursor && (
        <button
          data-admin-read-action
          type="button"
          disabled={loading}
          onClick={() => void loadList(nextCursor)}
          className="mt-4 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-orange-700 ring-1 ring-orange-200 disabled:opacity-50"
        >
          Load more requests
        </button>
      )}
    </section>
  );
}

function DeletionDetail({detail, decision, notes, scheduledDeletionDate, working, onDecision, onNotes, onDate, onSubmit, onRetry, onReinstate, onCancel}: {detail: AdminAccountDeletionRequestDetail; decision: "approved" | "rejected" | "more_information_required" | null; notes: string; scheduledDeletionDate: string; working: boolean; onDecision: (value: "approved" | "rejected" | "more_information_required") => void; onNotes: (value: string) => void; onDate: (value: string) => void; onSubmit: () => void; onRetry: () => void; onReinstate: () => void; onCancel: () => void}) {
  const canReceiveDecision = detail.status === "pending_review" ||
    detail.status === "more_information_required";
  return <><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold capitalize">{detail.ownerType} account deletion</h2><p className="mt-1 text-sm text-slate-500">Requested {displayDate(detail.requestedAt)}</p></div><span className={"rounded-full px-3 py-1 text-sm font-bold capitalize " + statusClass(detail.status)}>{detail.status.replace(/_/g, " ")}</span></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Info title="Account" values={[detail.owner.name, detail.owner.email, "Account status: " + detail.owner.accountStatus.replace(/_/g, " ")]} /><Info title="Request" values={[detail.reasonCode.replace(/_/g, " "), detail.reasonDetails || "No additional details", "Scheduled deletion: " + displayDate(detail.scheduledDeletionAt)]} /><Info title="Administrative decision" values={[detail.adminDecision.decision ? detail.adminDecision.decision.replace(/_/g, " ") : "Not decided", detail.adminDecision.notes || "No notes", detail.adminDecision.decidedAt ? "Decided " + displayDate(detail.adminDecision.decidedAt) : "Not decided yet"]} /><Info title="Deletion workflow" values={["Step: " + detail.workflow.currentStep.replace(/_/g, " "), "Attempts: " + String(detail.workflow.attemptCount), detail.workflow.failedStep ? "Failed step: " + detail.workflow.failedStep.replace(/_/g, " ") : "", detail.workflow.lastError ? "Last error: " + detail.workflow.lastError : ""]} /></div>{!detail.engineSupported && <div className="mt-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><p>Deletion for this account type is not implemented by the protected deletion engine yet. You can reject the request or request more information, but approval is safely unavailable.</p></div>}{decision && <div className="mt-6 rounded-xl border border-orange-100 bg-orange-50 p-4"><p className="font-bold text-slate-900">{decision === "approved" ? "Approve and schedule deletion" : decision === "rejected" ? "Reject deletion request" : "Request more information"}</p>{decision === "approved" ? <label className="mt-3 block text-sm font-semibold text-slate-700">Scheduled deletion date<input type="date" min={minimumDeletionDate} value={scheduledDeletionDate} onChange={(event) => onDate(event.target.value)} className="mt-2 block w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-400" /></label> : <label className="mt-3 block text-sm font-semibold text-slate-700">Message to account holder<textarea value={notes} onChange={(event) => onNotes(event.target.value)} rows={3} className="mt-2 block w-full rounded-lg border border-orange-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-orange-400" placeholder={decision === "rejected" ? "Explain why deletion cannot proceed." : "Explain what information is needed."} /></label>}<div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={working || (decision !== "approved" && !notes.trim())} onClick={onSubmit} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-45">{decision === "approved" ? "Approve and schedule" : decision === "rejected" ? "Reject request" : "Send request"}</button><button type="button" disabled={working} onClick={onCancel} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-slate-600 ring-1 ring-slate-200">Cancel</button></div></div>}{canReceiveDecision && !decision && <div className="mt-7 flex flex-wrap gap-3 border-t border-slate-100 pt-5"><button type="button" disabled={working || !detail.engineSupported} onClick={() => onDecision("approved")} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-45"><CheckCircle2 className="h-4 w-4" />Approve</button><button type="button" disabled={working} onClick={() => onDecision("more_information_required")} className="inline-flex items-center gap-2 rounded-xl bg-orange-50 px-4 py-2.5 text-sm font-bold text-orange-700 ring-1 ring-orange-100"><MessageSquareMore className="h-4 w-4" />Request information</button><button type="button" disabled={working} onClick={() => onDecision("rejected")} className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 ring-1 ring-red-100"><XCircle className="h-4 w-4" />Reject</button></div>}{detail.status === "failed" && <div className="mt-7 flex flex-wrap gap-2 border-t border-slate-100 pt-5"><button type="button" disabled={working} onClick={onRetry} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-45"><RotateCcw className={"h-4 w-4 " + (working ? "animate-spin" : "")} />Retry deletion</button><button type="button" disabled={working} onClick={onReinstate} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-green-700 ring-1 ring-green-200 disabled:opacity-45">Reinstate account</button></div>}{detail.status === "approved" && <button type="button" disabled={working} onClick={onReinstate} className="mt-6 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-green-700 ring-1 ring-green-200 disabled:opacity-45">Reinstate account</button>}{!canReceiveDecision && detail.status !== "failed" && detail.status !== "approved" && <p className="mt-6 flex items-center gap-2 text-sm text-slate-500"><Clock3 className="h-4 w-4" />This request can no longer receive another Admin decision.</p>}</>;
}

function Info({title, values}: {title: string; values: string[]}) {
  return <article className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p><div className="mt-2 space-y-1 text-sm text-slate-700">{values.filter(Boolean).map((value) => <p key={value}>{value}</p>)}</div></article>;
}

function CountCard({label, value, tone}: {label: string; value: number; tone: string}) {
  return <article className={"rounded-xl p-4 " + tone}><p className="text-2xl font-bold">{value}</p><p className="mt-1 text-sm font-semibold">{label}</p></article>;
}
