"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ToastProvider, useToast } from "@/components/common/ToastProvider";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { PasswordField } from "@/components/auth/PasswordField";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";

type Doc = {
  id: string;
  name: string;
  kind: "upload" | "digital_signature";
  is_mandatory: boolean;
  content_text?: string | null;
};

type Submission = {
  id: string;
  document_id: string;
  status: string;
  file_url?: string | null;
  signature_name?: string | null;
};

function InvitePageInner() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<any>(null);
  const hasPopulatedFromUserRef = useRef(false);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  const [password, setPassword] = useState("");
  const [authProvider, setAuthProvider] = useState<"password" | "google">("password");
  const [showSetPassword, setShowSetPassword] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [countryOpen, setCountryOpen] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [currentAddressLine1, setCurrentAddressLine1] = useState("");
  const [currentAddressLine2, setCurrentAddressLine2] = useState("");
  const [currentCity, setCurrentCity] = useState("");
  const [currentState, setCurrentState] = useState("");
  const [currentCountry, setCurrentCountry] = useState("");
  const [currentPostalCode, setCurrentPostalCode] = useState("");
  const [postalError, setPostalError] = useState<string | null>(null);
  const [permanentAddressLine1, setPermanentAddressLine1] = useState("");
  const [permanentAddressLine2, setPermanentAddressLine2] = useState("");
  const [permanentCity, setPermanentCity] = useState("");
  const [permanentState, setPermanentState] = useState("");
  const [permanentCountry, setPermanentCountry] = useState("");
  const [permanentPostalCode, setPermanentPostalCode] = useState("");
  const [permanentSameAsCurrent, setPermanentSameAsCurrent] = useState(false);
  const [aadhaar, setAadhaar] = useState("");
  const [pan, setPan] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");

  const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "photomedia";
  const countryOptions = [
    { iso: "in", alpha2: "IN", code: "+91" },
    { iso: "us", alpha2: "US", code: "+1" },
    { iso: "gb", alpha2: "UK", code: "+44" },
    { iso: "au", alpha2: "AU", code: "+61" },
    { iso: "ae", alpha2: "AE", code: "+971" },
  ] as const;
  const selectedCountry = countryOptions.find((c) => c.code === countryCode) ?? countryOptions[0];

  function normalizeDigits(s: string): string {
    return (s || "").replace(/\D+/g, "");
  }

  function validatePhoneDigits(v: string): string | null {
    const digits = normalizeDigits(v);
    if (!digits) return "Phone is required";
    if (digits.length !== 10) return "Phone must be exactly 10 digits";
    return null;
  }

  function validatePostal(v: string): string | null {
    const digits = normalizeDigits(v);
    if (!digits) return "Postal code is required";
    if (digits !== v.trim()) return "Postal code must contain numbers only";
    return null;
  }

  function sanitizeSegment(s: string): string {
    return (s || "")
      .trim()
      .replace(/[\/\\]+/g, "-")
      .replace(/[^\w\s.\-]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\s/g, "_")
      .slice(0, 64);
  }

  const byDocId = useMemo(() => {
    const m = new Map<string, Submission>();
    for (const s of submissions) m.set(s.document_id, s);
    return m;
  }, [submissions]);

  const mandatoryMissing = useMemo(() => {
    const missing: { id: string; name: string }[] = [];
    for (const d of documents) {
      if (!d.is_mandatory) continue;
      const s = byDocId.get(d.id);
      const done = s && (s.status === "submitted" || s.status === "signed" || s.status === "approved");
      if (!done) missing.push({ id: d.id, name: d.name });
    }
    return missing;
  }, [documents, byDocId]);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invites/${token}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load invite");
      setInvite(data.invite);
      setDocuments(data.documents || []);
      setSubmissions(data.submissions || []);

      // Pre-populate form with admin-filled user details (only on first load, not on refresh)
      const u = data.user;
      if (u && !hasPopulatedFromUserRef.current) {
        hasPopulatedFromUserRef.current = true;
        const ap = (String((u as any).authProvider || "password") as any) === "google" ? "google" : "password";
        setAuthProvider(ap);
        setShowSetPassword(ap !== "google");
        setName(String(u.name ?? "").trim());
        const rawPhone = String(u.phone ?? "").trim();
        const digits = rawPhone.replace(/\D+/g, "");
        if (digits.length >= 10) {
          const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.slice(-10);
          setPhone(local);
          if (digits.startsWith("91") && digits.length === 12) setCountryCode("+91");
          else if (digits.startsWith("1") && digits.length === 11) setCountryCode("+1");
          else if (digits.startsWith("44") && digits.length >= 12) setCountryCode("+44");
          else if (digits.startsWith("61") && digits.length >= 11) setCountryCode("+61");
          else if (digits.startsWith("971") && digits.length >= 12) setCountryCode("+971");
        }
        setDateOfBirth(String(u.dateOfBirth ?? "").trim());
        setCurrentAddressLine1(String(u.currentAddressLine1 ?? "").trim());
        setCurrentAddressLine2(String(u.currentAddressLine2 ?? "").trim());
        setCurrentCity(String(u.currentCity ?? "").trim());
        setCurrentState(String(u.currentState ?? "").trim());
        setCurrentCountry(String(u.currentCountry ?? "").trim());
        setCurrentPostalCode(String(u.currentPostalCode ?? "").replace(/\D+/g, ""));
        setPermanentAddressLine1(String(u.permanentAddressLine1 ?? "").trim());
        setPermanentAddressLine2(String(u.permanentAddressLine2 ?? "").trim());
        setPermanentCity(String(u.permanentCity ?? "").trim());
        setPermanentState(String(u.permanentState ?? "").trim());
        setPermanentCountry(String(u.permanentCountry ?? "").trim());
        setPermanentPostalCode(String(u.permanentPostalCode ?? "").replace(/\D+/g, ""));
        setAadhaar(String(u.aadhaar ?? "").trim());
        setPan(String(u.pan ?? "").trim());
        setBankName(String(u.bankName ?? "").trim());
        setBankAccountNumber(String(u.bankAccountNumber ?? "").trim());
        setBankIfsc(String(u.bankIfsc ?? "").trim());
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load invite");
      showToast("error", e?.message || "Failed to load invite");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!permanentSameAsCurrent) return;
    setPermanentAddressLine1(currentAddressLine1);
    setPermanentAddressLine2(currentAddressLine2);
    setPermanentCity(currentCity);
    setPermanentState(currentState);
    setPermanentCountry(currentCountry);
    setPermanentPostalCode(currentPostalCode);
  }, [
    permanentSameAsCurrent,
    currentAddressLine1,
    currentAddressLine2,
    currentCity,
    currentState,
    currentCountry,
    currentPostalCode,
  ]);

  async function submitUpload(documentId: string, fileUrl: string) {
    setError(null);
    const res = await fetch(`/api/invites/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit_document", documentId, fileUrl }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error || "Failed to submit document");
      showToast("error", data?.error || "Failed to submit document");
      return;
    }
    showToast("success", "Document submitted");
    await refresh();
  }

  function extractStoragePathFromPublicUrl(publicUrl: string): string | null {
    if (!publicUrl) return null;
    const marker = `/object/public/${bucket}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx !== -1) return publicUrl.slice(idx + marker.length);
    // Fallback for some Supabase URL shapes
    const alt = `/${bucket}/`;
    const idx2 = publicUrl.indexOf(alt);
    if (idx2 !== -1) return publicUrl.slice(idx2 + alt.length);
    return null;
  }

  async function uploadToStorage(document: Doc, file: File): Promise<string> {
    const userId = String(invite?.user_id || "unknown");
    const employeeName = sanitizeSegment(name) || "Employee";
    const employeeFolder = `${employeeName}${userId}`;
    const category = document.kind === "upload" ? "upload" : "esign";
    const docFolder = sanitizeSegment(document.name) || "Document";
    const ext = (file.name.split(".").pop() || "").slice(0, 10);
    const safeBase = docFolder;
    const finalFileName = ext ? `${safeBase}.${ext}` : safeBase;
    // Deterministic path so re-uploads overwrite the previous file for this doc.
    const path = `HRMS/${employeeFolder}/${category}/${docFolder}/${finalFileName}`;
    const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (upErr) throw new Error(upErr.message);
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("Failed to get public URL");
    return data.publicUrl;
  }

  async function uploadSignatureReceipt(document: Doc, signatureName: string): Promise<string> {
    const userId = String(invite?.user_id || "unknown");
    const employeeName = sanitizeSegment(name) || "Employee";
    const employeeFolder = `${employeeName}${userId}`;
    const docFolder = sanitizeSegment(document.name) || "Document";
    const receiptText = `Document: ${document.name}\nSigned by: ${signatureName}\nSigned at: ${new Date().toISOString()}\nEmail: ${invite?.email || ""}\n`;
    const blob = new Blob([receiptText], { type: "text/plain" });
    const receiptName = `${docFolder}_SIGNATURE_RECEIPT.txt`;
    const path = `HRMS/${employeeFolder}/esign/${docFolder}/${Date.now()}_${receiptName}`;
    const { error: upErr } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true });
    if (upErr) throw new Error(upErr.message);
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("Failed to get public URL");
    return data.publicUrl;
  }

  async function submitSignature(documentId: string, signatureName: string) {
    setError(null);
    const doc = documents.find((d) => d.id === documentId);
    let receiptUrl = "";
    try {
      if (doc) receiptUrl = await uploadSignatureReceipt(doc, signatureName);
    } catch {
      // best-effort; still store signature metadata in DB
    }
    const res = await fetch(`/api/invites/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit_document", documentId, signatureName, fileUrl: receiptUrl || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error || "Failed to sign document");
      showToast("error", data?.error || "Failed to sign document");
      return;
    }
    showToast("success", "Document signed");
    await refresh();
  }

  async function complete() {
    setCompleting(true);
    setError(null);
    try {
      const requiredMissing: string[] = [];
      if (!name.trim()) requiredMissing.push("Full name");
      const pErr = validatePhoneDigits(phone);
      setPhoneError(pErr);
      if (pErr) requiredMissing.push("Phone");
      if (!dateOfBirth.trim()) requiredMissing.push("Date of birth");
      if (!currentAddressLine1.trim()) requiredMissing.push("Current address");
      if (!currentCity.trim()) requiredMissing.push("City");
      if (!currentState.trim()) requiredMissing.push("State");
      if (!currentCountry.trim()) requiredMissing.push("Country");
      const pcErr = validatePostal(currentPostalCode);
      setPostalError(pcErr);
      if (pcErr) requiredMissing.push("Postal code");
      if (!bankName.trim()) requiredMissing.push("Bank name");
      if (!bankAccountNumber.trim()) requiredMissing.push("Bank account number");
      if (!bankIfsc.trim()) requiredMissing.push("IFSC");
      if (requiredMissing.length) throw new Error(`Please fill all required fields: ${requiredMissing.join(", ")}`);
      if (mandatoryMissing.length) {
        throw new Error(`Please complete mandatory documents first: ${mandatoryMissing.map((m) => m.name).join(", ")}`);
      }

      const res = await fetch(`/api/invites/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          password,
          profile: {
            name,
            phone: `${countryCode}${normalizeDigits(phone)}`,
            dateOfBirth,
            currentAddressLine1,
            currentAddressLine2,
            currentCity,
            currentState,
            currentCountry,
            currentPostalCode: normalizeDigits(currentPostalCode),
            permanentAddressLine1,
            permanentAddressLine2,
            permanentCity,
            permanentState,
            permanentCountry,
            permanentPostalCode: normalizeDigits(permanentPostalCode),
            aadhaar,
            pan,
            bankName,
            bankAccountNumber,
            bankIfsc,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to complete onboarding");
      showToast("success", "Onboarding completed. An admin will activate your account.");
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to complete onboarding");
      showToast("error", e?.message || "Failed to complete onboarding");
    } finally {
      setCompleting(false);
    }
  }

  if (invite?.status === "completed") {
    return (
      <section className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
        <div className="card text-center py-12">
          <h1 className="page-title">Thank you!</h1>
          <p className="mt-3 text-slate-600">Your onboarding is complete. An admin will activate your account shortly.</p>
          <p className="mt-2 text-sm text-slate-500">You can log in with your email and password (or Google sign-in if enabled for your account).</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
      <div>
        <h1 className="page-title">Employee onboarding</h1>
        <p className="muted">Complete the mandatory documents to activate your account.</p>
      </div>

      {loading && (
        <div className="card">
          <p className="muted">Loading...</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Invite</h2>
            <p className="text-sm text-slate-500">{invite?.email || "-"}</p>
          </div>
          <span className="text-sm text-slate-600">Status: {invite?.status || "-"}</span>
        </div>
      </div>

      <div className="card">
        <h2 className="text-base font-semibold text-slate-900">Mandatory documents</h2>
        {documents.length === 0 ? (
          <p className="muted mt-2">No documents configured for this company.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {documents
              .filter((d) => d.is_mandatory)
              .map((d) => {
                const s = byDocId.get(d.id);
                const done = s && (s.status === "submitted" || s.status === "signed" || s.status === "approved");
                return (
                  <div key={d.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">{d.name}</div>
                        <div className="text-sm text-slate-500">Type: {d.kind}</div>
                      </div>
                      <div className={`text-sm ${done ? "text-emerald-700" : "text-slate-600"}`}>{done ? "Completed" : "Pending"}</div>
                    </div>

                    {d.kind === "upload" ? (
                      <UploadBox
                        disabled={!!done}
                        existingUrl={s?.file_url ?? ""}
                        documentName={d.name}
                        onUpload={async (file) => {
                          if (!invite?.id) throw new Error("Invite not loaded");
                          // Remove previous file from storage (if any), then upload and submit.
                          const prevUrl = s?.file_url ?? "";
                          const prevPath = extractStoragePathFromPublicUrl(prevUrl);
                          if (prevPath) {
                            await supabase.storage.from(bucket).remove([prevPath]);
                          }
                          const publicUrl = await uploadToStorage(d, file);
                          await submitUpload(d.id, publicUrl);
                          return publicUrl;
                        }}
                      />
                    ) : (
                      <SignatureBox
                        disabled={!!done}
                        contentText={d.content_text ?? ""}
                        initialValue={s?.signature_name ?? ""}
                        onSubmit={(name) => submitSignature(d.id, name)}
                      />
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-base font-semibold text-slate-900">Your details</h2>
        <p className="text-sm text-slate-500 mt-1">Complete your information (visible to HR/Admin). Pre-filled fields were entered by your admin.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              readOnly
              value={invite?.email ?? ""}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
            />
            <p className="mt-0.5 text-xs text-slate-500">Pre-filled by admin</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Full name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
            <div className="grid grid-cols-[120px_1fr] gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCountryOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <span className="flex items-center gap-2">
                    {/* flagcdn uses lowercase iso */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://flagcdn.com/w20/${selectedCountry.iso}.png`}
                      alt={selectedCountry.alpha2}
                      className="h-4 w-5 rounded-sm border border-slate-200"
                    />
                    <span className="font-medium">{selectedCountry.alpha2}</span>
                    <span className="text-slate-600">{selectedCountry.code}</span>
                  </span>
                  <span className="text-slate-500">▾</span>
                </button>
                {countryOpen && (
                  <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                    {countryOptions.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={() => {
                          setCountryCode(c.code);
                          setCountryOpen(false);
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`https://flagcdn.com/w20/${c.iso}.png`} alt={c.alpha2} className="h-4 w-5 rounded-sm border border-slate-200" />
                        <span className="flex-1 font-medium">{c.alpha2}</span>
                        <span className="text-slate-600">{c.code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="tel"
                inputMode="numeric"
                required
                value={phone}
                onChange={(e) => {
                  const v = e.target.value;
                  const digits = normalizeDigits(v).slice(0, 10);
                  setPhone(digits);
                  setPhoneError(validatePhoneDigits(digits));
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="10-digit number"
              />
            </div>
            {phoneError && <p className="mt-1 text-xs text-red-600">{phoneError}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Date of birth</label>
            <DatePickerField value={dateOfBirth} onChange={setDateOfBirth} required className="w-full" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Aadhaar</label>
            <input
              type="text"
              inputMode="numeric"
              value={aadhaar}
              onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, "").slice(0, 12))}
              placeholder="12 digits"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <p className="mt-0.5 text-xs text-slate-500">Check and update if needed</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">PAN</label>
            <input
              type="text"
              value={pan}
              onChange={(e) => setPan(e.target.value.toUpperCase().slice(0, 10))}
              placeholder="e.g. ABCD1234E"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <p className="mt-0.5 text-xs text-slate-500">Check and update if needed</p>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">Current address</label>
            <input
              type="text"
              required
              value={currentAddressLine1}
              onChange={(e) => setCurrentAddressLine1(e.target.value)}
              placeholder="Address line 1"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">Current address (line 2)</label>
            <input
              type="text"
              value={currentAddressLine2}
              onChange={(e) => setCurrentAddressLine2(e.target.value)}
              placeholder="Address line 2 (optional)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">City</label>
            <input
              type="text"
              required
              value={currentCity}
              onChange={(e) => setCurrentCity(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">State</label>
            <input
              type="text"
              required
              value={currentState}
              onChange={(e) => setCurrentState(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Country</label>
            <input
              type="text"
              required
              value={currentCountry}
              onChange={(e) => setCurrentCountry(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Postal code</label>
            <input
              type="text"
              required
              value={currentPostalCode}
              inputMode="numeric"
              onChange={(e) => {
                const raw = e.target.value;
                const digits = normalizeDigits(raw);
                setCurrentPostalCode(digits);
                setPostalError(validatePostal(digits));
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {postalError && <p className="mt-1 text-xs text-red-600">{postalError}</p>}
          </div>

          <div className="sm:col-span-2 lg:col-span-4">
            <h3 className="text-sm font-semibold text-slate-800 mt-4 mb-2">Permanent address</h3>
            <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={permanentSameAsCurrent}
                onChange={(e) => setPermanentSameAsCurrent(e.target.checked)}
              />
              Same as Current Address
            </label>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Permanent address line 1</label>
            <input
              type="text"
              value={permanentAddressLine1}
              onChange={(e) => setPermanentAddressLine1(e.target.value)}
              disabled={permanentSameAsCurrent}
              placeholder="Address line 1"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Permanent address line 2</label>
            <input
              type="text"
              value={permanentAddressLine2}
              onChange={(e) => setPermanentAddressLine2(e.target.value)}
              disabled={permanentSameAsCurrent}
              placeholder="Address line 2 (optional)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Permanent city</label>
            <input
              type="text"
              value={permanentCity}
              onChange={(e) => setPermanentCity(e.target.value)}
              disabled={permanentSameAsCurrent}
              placeholder="City"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Permanent state</label>
            <input
              type="text"
              value={permanentState}
              onChange={(e) => setPermanentState(e.target.value)}
              disabled={permanentSameAsCurrent}
              placeholder="State"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Permanent country</label>
            <input
              type="text"
              value={permanentCountry}
              onChange={(e) => setPermanentCountry(e.target.value)}
              disabled={permanentSameAsCurrent}
              placeholder="Country"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Permanent postal code</label>
            <input
              type="text"
              inputMode="numeric"
              value={permanentPostalCode}
              onChange={(e) => setPermanentPostalCode(e.target.value.replace(/\D/g, ""))}
              disabled={permanentSameAsCurrent}
              placeholder="Postal code"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Bank name</label>
            <input
              type="text"
              required
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Bank account number</label>
            <input
              type="text"
              required
              value={bankAccountNumber}
              onChange={(e) => setBankAccountNumber(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">IFSC</label>
            <input
              type="text"
              required
              value={bankIfsc}
              onChange={(e) => setBankIfsc(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

          <div className="card">
            <h2 className="text-base font-semibold text-slate-900">Activate account</h2>
            {authProvider === "google" ? (
              <p className="text-sm text-slate-500 mt-1">
                You can complete onboarding using Google sign-in. Setting a password is optional.
              </p>
            ) : (
              <p className="text-sm text-slate-500 mt-1">Set your password and complete onboarding.</p>
            )}

            {authProvider === "google" && (
              <div className="mt-3">
                <GoogleAuthButton mode="login" onSuccessRedirect={`/invite/${token}`} />
              </div>
            )}

            {authProvider === "google" && (
              <div className="mt-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={showSetPassword}
                    onChange={(e) => setShowSetPassword(e.target.checked)}
                  />
                  Also set a password (optional)
                </label>
              </div>
            )}

            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
              <div className="flex-1">
                {(authProvider !== "google" || showSetPassword) && (
                  <PasswordField
                    label="Password"
                    required={authProvider !== "google"}
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={setPassword}
                    placeholder="Minimum 8 characters"
                  />
                )}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={complete}
                disabled={completing || mandatoryMissing.length > 0}
                title={mandatoryMissing.length ? "Complete mandatory documents first" : undefined}
              >
                {completing ? "Activating..." : "Complete onboarding"}
              </button>
            </div>
            {mandatoryMissing.length > 0 && (
              <p className="mt-2 text-sm text-amber-700">
                Complete mandatory documents first: {mandatoryMissing.map((m) => m.name).join(", ")}
              </p>
            )}
          </div>
    </section>
  );
}

export default function InvitePage() {
  return (
    <ToastProvider>
      <InvitePageInner />
    </ToastProvider>
  );
}

function UploadBox({
  disabled,
  existingUrl,
  documentName,
  onUpload,
}: {
  disabled: boolean;
  existingUrl: string;
  documentName: string;
  onUpload: (file: File) => Promise<string>;
}) {
  const [url, setUrl] = useState(existingUrl);
  const [uploading, setUploading] = useState(false);
  const isImage = /\.(png|jpe?g|gif|webp)$/i.test(url || "");
  return (
    <div className="mt-3 space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Upload file</label>
        <input
          type="file"
          disabled={disabled || uploading}
          className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            try {
              const publicUrl = await onUpload(file);
              setUrl(publicUrl);
            } finally {
              setUploading(false);
            }
          }}
        />
      </div>

      {uploading ? (
        <p className="text-sm text-slate-600">Uploading…</p>
      ) : url ? (
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="text-sm font-medium text-slate-900">{documentName}</div>
          <div className="mt-2">
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={documentName} className="max-h-64 w-auto rounded-lg border border-slate-200" />
            ) : (
              <a className="text-emerald-700 underline" href={url} target="_blank" rel="noreferrer">
                View document
              </a>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-600">No file uploaded yet.</p>
      )}
    </div>
  );
}

function SignatureBox({
  disabled,
  contentText,
  initialValue,
  onSubmit,
}: {
  disabled: boolean;
  contentText: string;
  initialValue: string;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initialValue);
  return (
    <div className="mt-3 space-y-2">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
        {contentText || "Document text not provided by company."}
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Type your full name to sign</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={disabled}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100"
            placeholder="Full name"
          />
        </div>
        <button type="button" className="btn btn-outline" disabled={disabled || !name.trim()} onClick={() => onSubmit(name.trim())}>
          Sign
        </button>
      </div>
    </div>
  );
}

