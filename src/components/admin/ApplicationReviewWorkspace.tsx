"use client";
/* eslint-disable @next/next/no-img-element -- protected application documents use short-lived signed URLs */
/* eslint-disable react-hooks/set-state-in-effect -- route selection intentionally resets and reloads the protected review state */

/*
|--------------------------------------------------------------------------
| Application Review Workspace
|--------------------------------------------------------------------------
|
| Reuses the protected Admin callable service for store and driver reviews.
| It never reads application records or document URLs from Firestore in the
| browser. Required documents must be approved before an approval action can
| succeed on the server.
|
*/

import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  useRouter,
} from "next/navigation";
import {
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileWarning,
  LoaderCircle,
  ShieldCheck,
  ShieldAlert,
  XCircle,
  ImagePlus,
} from "lucide-react";
import {
  adminWorkspaceClientService,
} from "@/services/admin/adminWorkspaceClientService";
import {StoreContractSection} from "@/components/admin/StoreContractSection";
import {AdminZoneAssignmentEditor} from "@/components/admin/AdminZoneAssignmentEditor";
import type {
  AdminApplicationListItem,
  AdminApplicationCounts,
  AdminApplicationStatus,
  AdminDriverApplicationDetail,
  AdminReviewDocument,
  AdminStoreApplicationDetail,
} from "@/types/adminWorkspace";

type ApplicationType = "store" | "driver";
type Detail = AdminStoreApplicationDetail | AdminDriverApplicationDetail;

const statuses: Array<{value: AdminApplicationStatus; label: string}> = [
  {value: "pending_review", label: "Pending review"},
  {value: "rejected", label: "Rejected"},
  {value: "approved", label: "Approved"},
  {value: "suspended", label: "Suspended"},
];

function displayDate(value: string | null): string {
  if (!value) return "Not submitted";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusClass(status: string): string {
  if (status === "approved") return "bg-green-100 text-green-700";
  if (status === "rejected" || status === "expired" || status === "suspended") return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-800";
}

function getName(type: ApplicationType, detail: Detail): string {
  return type === "store"
    ? (detail as AdminStoreApplicationDetail).store.name
    : (detail as AdminDriverApplicationDetail).profile.name;
}

export function ApplicationReviewWorkspace({
  type,
  applicationId,
  initialStatus = "pending_review",
}: {
  type: ApplicationType;
  applicationId?: string;
  initialStatus?: AdminApplicationStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<AdminApplicationStatus>(initialStatus);
  const [applications, setApplications] = useState<AdminApplicationListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [counts, setCounts] = useState<AdminApplicationCounts>({
    pending_review: 0,
    approved: 0,
    rejected: 0,
  });
  const [selected, setSelected] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [rejectionTarget, setRejectionTarget] = useState<{
    kind: "document" | "application";
    key?: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [suspensionTarget, setSuspensionTarget] = useState(false);
  const [approvedRadius, setApprovedRadius] = useState("");
  const listLoadedRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const requestSequenceRef = useRef(0);

  const loadApplications = async (cursor?: string) => {
    if (applicationId) return;
    const requestSequence = cursor ? requestSequenceRef.current : ++requestSequenceRef.current;
    if (cursor) {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
    } else if (!listLoadedRef.current) {
      setLoading(true);
    }
    setError("");
    try {
      const result = type === "store"
        ? await adminWorkspaceClientService.getStoreApplications(status, cursor)
        : await adminWorkspaceClientService.getDriverApplications(status, cursor);
      if (!cursor && requestSequence !== requestSequenceRef.current) return;
      setApplications((current) => cursor ? [...current, ...result.applications] : result.applications);
      setNextCursor(result.nextCursor);
      setCounts(result.counts);
      listLoadedRef.current = true;
    } catch (loadError) {
      if (requestSequence === requestSequenceRef.current) setError(loadError instanceof Error ? loadError.message : "Unable to load applications.");
    } finally {
      setLoading(false);
      loadingMoreRef.current = false;
    }
  };

  useEffect(() => {
    setSelected(null);

    if (applicationId) {
      setLoading(true);
      setError("");
      void (type === "store"
        ? adminWorkspaceClientService.getStoreApplication(applicationId)
        : adminWorkspaceClientService.getDriverApplication(applicationId)
      ).then((result) => {
        setSelected(result);
        if (type === "driver") {
          const driver = result as AdminDriverApplicationDetail;
          setApprovedRadius(driver.serviceArea.approvedRadiusMiles
            ? String(driver.serviceArea.approvedRadiusMiles)
            : "");
        }
      }).catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Unable to load this application.");
      }).finally(() => setLoading(false));
      return;
    }

    void loadApplications();
    // The selected review tab is the only intended reload trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId, status, type]);

  const openApplication = (application: AdminApplicationListItem) => {
    router.push(
      `/admin/${type === "store" ? "store-applications" : "driver-applications"}/${application.id}?from=${status}`
    );
  };

  const selectStatus = (nextStatus: AdminApplicationStatus) => {
    setStatus(nextStatus);
    const base = `/admin/${type === "store" ? "store-applications" : "driver-applications"}`;
    window.history.replaceState(window.history.state, "", `${base}?status=${nextStatus}`);
  };

  const backToApplications = () => {
    router.push(`/admin/${type === "store" ? "store-applications" : "driver-applications"}?status=${initialStatus}`);
  };

  const refreshSelected = async () => {
    if (!selected) return;
    const detail = type === "store"
      ? await adminWorkspaceClientService.getStoreApplication(selected.id)
      : await adminWorkspaceClientService.getDriverApplication(selected.id);
    setSelected(detail);
  };

  const decideDocument = async (
    document: AdminReviewDocument,
    decision: "approved" | "rejected",
    rejectionReason?: string,
  ) => {
    if (!selected) return;
    setWorking(true);
    setError("");
    try {
      await adminWorkspaceClientService.decideDocument({
        type,
        applicationId: selected.id,
        documentKey: document.key,
        decision,
        reason: rejectionReason,
      });
      await refreshSelected();
      setRejectionTarget(null);
      setReason("");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to save the document review.");
    } finally {
      setWorking(false);
    }
  };

  const decideApplication = async (
    decision: "approved" | "rejected",
    rejectionReason?: string,
  ) => {
    if (!selected) return;
    setWorking(true);
    setError("");
    try {
      await adminWorkspaceClientService.decideApplication({
        type,
        applicationId: selected.id,
        decision,
        reason: rejectionReason,
      });
      await refreshSelected();
      await loadApplications();
      setRejectionTarget(null);
      setReason("");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to save the application decision.");
    } finally {
      setWorking(false);
    }
  };

  const activateStore = async () => {
    if (!selected || type !== "store") return;
    setWorking(true);
    setError("");
    try {
      await adminWorkspaceClientService.activateStore(
        selected.id,
        !(selected as AdminStoreApplicationDetail).isActive
      );
      await refreshSelected();
      await loadApplications();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to activate this store.");
    } finally {
      setWorking(false);
    }
  };

  const setStoreApproval = async () => {
    if (!selected || type !== "store") return;
    setWorking(true);
    setError("");
    try {
      await adminWorkspaceClientService.setStoreApproval(
        selected.id,
        !selected.isApproved
      );
      await refreshSelected();
      await loadApplications();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update store approval.");
    } finally {
      setWorking(false);
    }
  };

  const setDriverApproval = async () => {
    if (!selected || type !== "driver") return;
    setWorking(true);
    setError("");
    try {
      await adminWorkspaceClientService.setDriverApproval(
        selected.id,
        !selected.isApproved
      );
      await refreshSelected();
      await loadApplications();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update driver approval.");
    } finally {
      setWorking(false);
    }
  };

  const setSuspension = async (isSuspended: boolean, suspensionReason?: string) => {
    if (!selected) return;
    setWorking(true);
    setError("");
    try {
      if (type === "store") {
        await adminWorkspaceClientService.setStoreSuspension(
          selected.id,
          isSuspended,
          suspensionReason,
        );
      } else {
        await adminWorkspaceClientService.setDriverSuspension(
          selected.id,
          isSuspended,
          suspensionReason,
        );
      }
      await refreshSelected();
      await loadApplications();
      setSuspensionTarget(false);
      setReason("");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update suspension.");
    } finally {
      setWorking(false);
    }
  };

  const saveApprovedRadius = async () => {
    if (!selected || type !== "driver") return;
    const radius = Number(approvedRadius);
    if (!Number.isInteger(radius) || radius <= 0) {
      setError("Enter a whole-number approved radius.");
      return;
    }

    setWorking(true);
    setError("");
    try {
      await adminWorkspaceClientService.setDriverApprovedRadius(selected.id, radius);
      await refreshSelected();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to save the approved radius.");
    } finally {
      setWorking(false);
    }
  };

  const documents = selected?.documents ?? [];
  const allRequiredApproved = documents
    .filter((document) => document.required)
    .every((document) => document.review.reviewStatus === "approved");

  return (
    <section>
      {applicationId && <button data-admin-read-action type="button" onClick={backToApplications} className="mb-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"><ChevronRight className="h-4 w-4 rotate-180" />Back to applications</button>}
      <p className="text-sm font-bold tracking-wide text-orange-600">
        {type === "store" ? "STORE APPLICATIONS" : "DRIVER APPLICATIONS"}
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Review applications</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">Review protected application data and documents. Every decision is recorded in the admin audit log.</p>

      {!applicationId && <div className="mt-6 flex flex-wrap gap-2">
        {statuses.map((item) => (
          <button data-admin-read-action key={item.value} type="button" onClick={() => selectStatus(item.value)} className={`rounded-full px-4 py-2 text-sm font-bold ${status === item.value ? "bg-orange-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
            {item.label}
          </button>
        ))}
      </div>}

      {!applicationId && <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <ReviewCountCard label="Pending review" value={counts.pending_review} tone="bg-amber-50 text-amber-800" />
        <ReviewCountCard label="Approved" value={counts.approved} tone="bg-green-50 text-green-700" />
        <ReviewCountCard label="Rejected" value={counts.rejected} tone="bg-red-50 text-red-700" />
      </div>}

      {error && <p className="mt-5 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className={`mt-6 grid gap-6 ${applicationId ? "max-w-5xl" : "xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]"}`}>
        {!applicationId && <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold">{statuses.find((item) => item.value === status)?.label}</h2></div>
          {loading ? <div className="p-5 text-sm text-slate-500">Loading applications…</div> : applications.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No applications in this review queue.</div> : <><div className="divide-y divide-slate-100">{applications.map((application) => <button data-admin-read-action key={application.id} type="button" onClick={() => openApplication(application)} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-orange-50/40"><div className="min-w-0 flex-1"><p className="truncate font-bold text-slate-900">{application.name}</p><p className="mt-1 truncate text-sm text-slate-500">{type === "store" ? application.ownerName : "Applicant"} · {[application.city, application.state].filter(Boolean).join(", ") || "Location pending"}</p><p className="mt-1 text-xs text-slate-400">Submitted {displayDate(application.submittedAt)}</p></div><ChevronRight className="h-5 w-5 shrink-0 text-slate-400" /></button>)}</div>{nextCursor && <div className="border-t border-slate-100 p-4"><button data-admin-read-action type="button" onClick={() => void loadApplications(nextCursor)} className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Load more</button></div>}</>}
        </section>}

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:p-6">
          {!selected ? <div className="flex min-h-80 flex-col items-center justify-center text-center">{loading ? <><LoaderCircle className="h-8 w-8 animate-spin text-orange-600" /><p className="mt-3 text-sm text-slate-500">Loading application…</p></> : <><ShieldCheck className="h-10 w-10 text-orange-500" /><h2 className="mt-4 text-lg font-bold">Select an application</h2><p className="mt-1 max-w-sm text-sm text-slate-500">The private application detail and uploaded documents open here only after an administrator selects a queue item.</p></>}</div> : <>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{getName(type, selected)}</h2><p className="mt-1 text-sm text-slate-500">Submitted {displayDate(selected.submittedAt)}</p></div><span className={`rounded-full px-3 py-1 text-sm font-bold capitalize ${statusClass(selected.status)}`}>{selected.status.replaceAll("_", " ")}</span></div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">{type === "store" ? <StoreSummary detail={selected as AdminStoreApplicationDetail} /> : <DriverSummary detail={selected as AdminDriverApplicationDetail} />}</div>

            {type === "store" && <StoreBrandingEditor detail={selected as AdminStoreApplicationDetail} disabled={working} onProcessed={refreshSelected} />}

            {type === "driver" && <article className="mt-5 rounded-xl border border-green-100 bg-green-50 p-4"><p className="font-bold text-green-950">Approved delivery radius</p><p className="mt-1 text-sm text-green-900">Set the final radius up to the driver&apos;s requested radius. This setting cannot be changed by the driver.</p><div className="mt-3 flex max-w-sm gap-2"><input type="number" min="1" value={approvedRadius} onChange={(event) => setApprovedRadius(event.target.value)} disabled={working || selected.status === "suspended"} className="min-w-0 flex-1 rounded-lg border border-green-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50" placeholder="Miles" /><button type="button" disabled={working || selected.status === "suspended" || !approvedRadius} onClick={() => void saveApprovedRadius()} className="rounded-lg bg-green-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-45">Save</button></div></article>}

            <div className="mt-7"><h3 className="font-bold">Document review</h3><div className="mt-3 space-y-3">{documents.map((document) => <DocumentCard key={document.key} document={document} working={working} onApprove={() => void decideDocument(document, "approved")} onReject={() => { setRejectionTarget({kind: "document", key: document.key}); setReason(""); }} />)}</div></div>

            {rejectionTarget && <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4"><label className="text-sm font-bold text-red-900">Rejection reason</label><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-red-200 bg-white p-2 text-sm outline-none ring-orange-300 focus:ring" placeholder="Explain what needs to be corrected." /><div className="mt-3 flex gap-2"><button type="button" disabled={working || !reason.trim()} onClick={() => { if (rejectionTarget.kind === "document") { const document = documents.find((item) => item.key === rejectionTarget.key); if (document) void decideDocument(document, "rejected", reason.trim()); } else void decideApplication("rejected", reason.trim()); }} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Reject</button><button type="button" disabled={working} onClick={() => setRejectionTarget(null)} className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-600 ring-1 ring-slate-200">Cancel</button></div></div>}

            {suspensionTarget && <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4"><label className="text-sm font-bold text-red-900">Suspension reason</label><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-red-200 bg-white p-2 text-sm outline-none ring-red-300 focus:ring" placeholder="Explain why this account is being suspended." /><div className="mt-3 flex gap-2"><button type="button" disabled={working || !reason.trim()} onClick={() => void setSuspension(true, reason.trim())} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Suspend</button><button type="button" disabled={working} onClick={() => { setSuspensionTarget(false); setReason(""); }} className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-600 ring-1 ring-slate-200">Cancel</button></div></div>}

            <AdminZoneAssignmentEditor
              key={selected.id}
              accountType={type}
              accountId={selected.id}
              homeZoneId={selected.zoneAssignment.homeZoneId}
              serviceZoneIds={selected.zoneAssignment.serviceZoneIds}
              disabled={working}
              onSaved={refreshSelected}
            />

            {type === "store" && <StoreContractSection storeId={selected.id} disabled={working} />}

            <div className="mt-7 flex flex-wrap gap-3 border-t border-slate-100 pt-5">
              <button type="button" disabled={working || (type === "driver" && !selected.isApproved && !allRequiredApproved)} onClick={() => type === "store" ? void setStoreApproval() : void setDriverApproval()} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">
                <CheckCircle2 className="h-4 w-4" />
                {type === "store" ? selected.isApproved ? "Unapprove store" : "Approve store" : selected.isApproved ? "Unapprove driver" : "Approve driver"}
              </button>
              {type === "store" && <button type="button" disabled={working || !selected.isApproved} onClick={() => void activateStore()} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">
                <CheckCircle2 className="h-4 w-4" />
                {(selected as AdminStoreApplicationDetail).isActive ? "Deactivate store" : "Activate store"}
              </button>}
              <button type="button" disabled={working} onClick={() => selected.status === "suspended" ? void setSuspension(false) : (setSuspensionTarget(true), setReason(""))} className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 ring-1 ring-red-100 disabled:opacity-45">
                <ShieldAlert className="h-4 w-4" />
                {selected.status === "suspended" ? "Remove suspension" : "Suspend " + (type === "store" ? "store" : "driver")}
              </button>
              <button type="button" disabled={working || selected.status === "rejected"} onClick={() => { setRejectionTarget({kind: "application"}); setReason(""); }} className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 ring-1 ring-red-100 disabled:opacity-45">
                <XCircle className="h-4 w-4" />Reject application
              </button>
              {working && <LoaderCircle className="h-5 w-5 animate-spin text-orange-600" />}
            </div>
            {!allRequiredApproved && <p className="mt-3 text-xs text-slate-500">{type === "store" ? "This store remains in Pending review until every required document is approved. You may still approve owner access and activate or deactivate the store while review continues." : "Every required document must be individually approved before this driver application can be approved."}</p>}
          </>}
        </section>
      </div>
    </section>
  );
}

function DocumentCard({document, working, onApprove, onReject}: {document: AdminReviewDocument; working: boolean; onApprove: () => void; onReject: () => void}) {
  const urls = document.urls ?? (document.url ? [document.url] : []);
  return <article className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{document.label}{document.required && <span className="ml-1 text-red-600">*</span>}</p><p className="mt-1 text-xs text-slate-500">{document.expirationDate ? `Expires ${new Date(`${document.expirationDate}T00:00:00`).toLocaleDateString()}` : document.required ? "Required for approval" : "Optional"}</p>{document.review.rejectionReason && <p className="mt-2 text-xs text-red-700">Reason: {document.review.rejectionReason}</p>}</div><span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusClass(document.review.reviewStatus)}`}>{document.review.reviewStatus}</span></div><div className="mt-3 flex flex-wrap gap-2">{urls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">View {urls.length > 1 ? index === 0 ? "front" : "back" : "document"}<ExternalLink className="h-3.5 w-3.5" /></a>)}{urls.length === 0 && <span className="inline-flex items-center gap-1 text-xs text-red-600"><FileWarning className="h-4 w-4" />No processed upload</span>}<button type="button" disabled={working || urls.length === 0} onClick={onApprove} className="rounded-lg bg-green-50 px-3 py-2 text-xs font-bold text-green-700 ring-1 ring-green-100 disabled:opacity-40">Approve</button><button type="button" disabled={working || urls.length === 0} onClick={onReject} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700 ring-1 ring-red-100 disabled:opacity-40">Reject</button></div></article>;
}

function StoreSummary({detail}: {detail: AdminStoreApplicationDetail}) {
  return <><Info title="Owner" values={[detail.owner.name, detail.owner.email, detail.owner.phone, detail.owner.address]} /><Info title="Store" values={[detail.store.name, detail.store.email, detail.store.phone, detail.store.address, detail.store.businessType, detail.store.registeredName, detail.store.businessStructure]} /><Info title="Merchant agreement" values={[detail.merchantAgreement.accepted ? "Electronically accepted" : "Not accepted", detail.merchantAgreement.representativeName ?? "", detail.merchantAgreement.acceptedByEmail ?? "", detail.merchantAgreement.acceptedAt ? `Accepted ${displayDate(detail.merchantAgreement.acceptedAt)}` : "", detail.merchantAgreement.manualSignatureRequired ? "Paper signature still required" : ""]} /><Info title="Stripe" values={[detail.stripe.accountStatus.replaceAll("_", " "), detail.stripe.transfersEnabled ? "Transfers enabled" : "Transfers not enabled", detail.stripe.payoutsEnabled ? "Payouts enabled" : "Payouts not enabled"]} /><Info title="Schedule" values={detail.store.schedule.map((day) => `${day.day}: ${day.isClosed ? "Closed" : `${day.open}–${day.close}`}`)} /></>;
}

function StoreBrandingEditor({detail, disabled, onProcessed}: {detail: AdminStoreApplicationDetail; disabled: boolean; onProcessed: () => Promise<void>}) {
  const [uploading, setUploading] = useState<"logo" | "banner" | null>(null);
  const [message, setMessage] = useState("");
  const logo = detail.documents.find((document) => document.key === "logo")?.url ?? null;
  const banner = detail.documents.find((document) => document.key === "banner")?.url ?? null;
  const upload = async (field: "logo" | "banner", file: File | null) => {
    if (!file) return;
    setUploading(field);
    setMessage("");
    try {
      await adminWorkspaceClientService
        .uploadStoreBrandingImage({
          storeId: detail.id,
          field,
          file,
        });
      setMessage(`${field === "logo" ? "Logo" : "Banner"} upload accepted. The optimized image will appear after processing.`);
      window.setTimeout(() => { void onProcessed(); }, 2_500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to upload store branding.");
    } finally {
      setUploading(null);
    }
  };
  return <section className="mt-5 rounded-xl border border-orange-100 bg-orange-50/50 p-4"><div className="flex items-start gap-3"><ImagePlus className="mt-0.5 h-5 w-5 text-orange-600"/><div><h3 className="font-bold text-slate-900">Store branding</h3><p className="mt-1 text-sm text-slate-600">Replace the public logo or banner with professionally prepared artwork. LIA resizes the original before it becomes customer-visible.</p></div></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><BrandingUpload label="Store logo" imageUrl={logo} disabled={disabled || uploading !== null} busy={uploading === "logo"} onSelect={(file) => void upload("logo", file)}/><BrandingUpload label="Store banner" imageUrl={banner} disabled={disabled || uploading !== null} busy={uploading === "banner"} onSelect={(file) => void upload("banner", file)}/></div>{message && <p className={`mt-3 text-sm ${message.startsWith("Unable") || message.startsWith("Please") ? "text-red-700" : "text-green-800"}`}>{message}</p>}</section>;
}

function BrandingUpload({label, imageUrl, disabled, busy, onSelect}: {label: string; imageUrl: string | null; disabled: boolean; busy: boolean; onSelect: (file: File | null) => void}) {
  return <label className="block overflow-hidden rounded-xl bg-white ring-1 ring-orange-100"><div className="relative flex h-28 items-center justify-center bg-slate-100">{imageUrl ? <img src={imageUrl} alt={label} className="h-full w-full object-cover"/> : <span className="text-sm text-slate-500">No image yet</span>}</div><span className="flex cursor-pointer items-center justify-between gap-2 px-3 py-3 text-sm font-bold text-orange-700">{label}<span>{busy ? "Uploading…" : "Replace"}</span></span><input type="file" accept="image/*" disabled={disabled} onChange={(event) => onSelect(event.target.files?.[0] ?? null)} className="sr-only"/></label>;
}

function DriverSummary({detail}: {detail: AdminDriverApplicationDetail}) {
  return <><Info title="Driver" values={[detail.profile.name, detail.profile.email, detail.profile.phone, detail.profile.dateOfBirth ? `Born ${detail.profile.dateOfBirth}` : "", detail.profile.address]} /><Info title="Service area" values={[`${detail.serviceArea.city}, ${detail.serviceArea.state}`, detail.serviceArea.preferredRadiusMiles ? `Requested radius: ${detail.serviceArea.preferredRadiusMiles} mi` : "No radius requested"]} /><Info title="Vehicle" values={[detail.vehicle.deliveryMethod, [detail.vehicle.year, detail.vehicle.make, detail.vehicle.model].filter(Boolean).join(" "), detail.vehicle.color, detail.vehicle.licensePlate, detail.vehicle.registrationState]} /><Info title="Stripe" values={[detail.stripe.accountStatus.replaceAll("_", " "), detail.stripe.transfersEnabled ? "Transfers enabled" : "Transfers not enabled", detail.stripe.payoutsEnabled ? "Payouts enabled" : "Payouts not enabled"]} /></>;
}

function Info({title, values}: {title: string; values: string[]}) {
  return <article className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p><div className="mt-2 space-y-1 text-sm text-slate-700">{values.filter(Boolean).map((value) => <p key={value}>{value}</p>)}</div></article>;
}

function ReviewCountCard({label, value, tone}: {label: string; value: number; tone: string}) {
  return <article className={`rounded-xl p-4 ${tone}`}><p className="text-2xl font-bold">{value}</p><p className="mt-1 text-sm font-semibold">{label}</p></article>;
}
