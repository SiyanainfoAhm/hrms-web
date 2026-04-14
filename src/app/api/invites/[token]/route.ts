import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import bcrypt from "bcryptjs";

function isExpired(invite: any): boolean {
  if (!invite?.expires_at) return false;
  return new Date(invite.expires_at).getTime() < Date.now();
}

function getBucketName(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "photomedia";
}

function extractStoragePathFromPublicUrl(bucket: string, publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null;
  const marker = `/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx !== -1) return publicUrl.slice(idx + marker.length);
  const alt = `/${bucket}/`;
  const idx2 = publicUrl.indexOf(alt);
  if (idx2 !== -1) return publicUrl.slice(idx2 + alt.length);
  return null;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const { data: invite, error } = await supabase
    .from("HRMS_employee_invites")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  // Allow viewing completed invites (so the invite page doesn't show a false error toast after completion).
  if (invite.status === "pending" && isExpired(invite)) {
    return NextResponse.json({ error: "Invite expired" }, { status: 400 });
  }
  if (invite.status !== "pending" && invite.status !== "completed") {
    return NextResponse.json({ error: `Invite is ${invite.status}` }, { status: 400 });
  }

  let docQuery = supabase
    .from("HRMS_company_documents")
    .select("*")
    .eq("company_id", invite.company_id)
    .order("created_at", { ascending: true });

  const requestedIds = Array.isArray(invite.requested_document_ids)
    ? (invite.requested_document_ids as any[]).filter((x) => typeof x === "string")
    : null;
  if (requestedIds && requestedIds.length) {
    docQuery = docQuery.in("id", requestedIds);
  }

  const { data: docs, error: docErr } = await docQuery;
  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 400 });

  // Submissions are unique per (user_id, document_id), so read by user_id (works across re-invites).
  let subQuery = supabase.from("HRMS_employee_document_submissions").select("*");
  if (invite.user_id) subQuery = subQuery.eq("user_id", invite.user_id);
  else subQuery = subQuery.eq("invite_id", invite.id);
  const { data: subs, error: subErr } = await subQuery;
  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 400 });

  // Fetch user details (admin-filled when adding employee) for pre-populating the form
  let user: Record<string, unknown> | null = null;
  if (invite.user_id) {
    const { data: userRow } = await supabase
      .from("HRMS_users")
      .select("name, email, phone, auth_provider, date_of_birth, date_of_joining, designation, current_address_line1, current_address_line2, current_city, current_state, current_country, current_postal_code, permanent_address_line1, permanent_address_line2, permanent_city, permanent_state, permanent_country, permanent_postal_code, bank_account_number, bank_ifsc, aadhaar, pan")
      .eq("id", invite.user_id)
      .maybeSingle();
    if (userRow) {
      user = {
        name: userRow.name ?? "",
        email: userRow.email ?? invite.email ?? "",
        phone: userRow.phone ?? "",
        authProvider: userRow.auth_provider ?? "password",
        dateOfBirth: userRow.date_of_birth ? String(userRow.date_of_birth) : "",
        dateOfJoining: userRow.date_of_joining ? String(userRow.date_of_joining) : "",
        designation: userRow.designation ?? "",
        currentAddressLine1: userRow.current_address_line1 ?? "",
        currentAddressLine2: userRow.current_address_line2 ?? "",
        currentCity: userRow.current_city ?? "",
        currentState: userRow.current_state ?? "",
        currentCountry: userRow.current_country ?? "",
        currentPostalCode: userRow.current_postal_code ?? "",
        permanentAddressLine1: userRow.permanent_address_line1 ?? "",
        permanentAddressLine2: userRow.permanent_address_line2 ?? "",
        permanentCity: userRow.permanent_city ?? "",
        permanentState: userRow.permanent_state ?? "",
        permanentCountry: userRow.permanent_country ?? "",
        permanentPostalCode: userRow.permanent_postal_code ?? "",
        bankAccountNumber: userRow.bank_account_number ?? "",
        bankIfsc: userRow.bank_ifsc ?? "",
        aadhaar: userRow.aadhaar ?? "",
        pan: userRow.pan ?? "",
      };
    }
  }

  return NextResponse.json({ invite, user, documents: docs ?? [], submissions: subs ?? [] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const { data: invite, error } = await supabase
    .from("HRMS_employee_invites")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (invite.status !== "pending") return NextResponse.json({ error: `Invite is ${invite.status}` }, { status: 400 });
  if (isExpired(invite)) return NextResponse.json({ error: "Invite expired" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "submit_document") {
    const documentId = typeof body?.documentId === "string" ? body.documentId : "";
    const fileUrl = typeof body?.fileUrl === "string" ? body.fileUrl.trim() : "";
    const signatureName = typeof body?.signatureName === "string" ? body.signatureName.trim() : "";

    if (!documentId) return NextResponse.json({ error: "documentId is required" }, { status: 400 });
    if (!invite.user_id) return NextResponse.json({ error: "Invite is not linked to a user" }, { status: 400 });

    const { data: doc, error: docErr } = await supabase
      .from("HRMS_company_documents")
      .select("*")
      .eq("company_id", invite.company_id)
      .eq("id", documentId)
      .maybeSingle();
    if (docErr) return NextResponse.json({ error: docErr.message }, { status: 400 });
    if (!doc) return NextResponse.json({ error: "Invalid document" }, { status: 400 });

    if (doc.kind === "upload") {
      if (!fileUrl) return NextResponse.json({ error: "fileUrl is required for upload documents" }, { status: 400 });

      // Delete previously uploaded file for this user+document (best-effort).
      try {
        const { data: existing } = await supabase
          .from("HRMS_employee_document_submissions")
          .select("file_url")
          .eq("user_id", invite.user_id)
          .eq("document_id", documentId)
          .maybeSingle();
        const bucket = getBucketName();
        const oldPath = extractStoragePathFromPublicUrl(bucket, existing?.file_url);
        const newPath = extractStoragePathFromPublicUrl(bucket, fileUrl);
        if (oldPath && newPath && oldPath !== newPath) {
          await supabaseAdmin.storage.from(bucket).remove([oldPath]);
        }
      } catch {
        // ignore cleanup errors (policy/service key may be missing)
      }

      const { data, error: upErr } = await supabase
        .from("HRMS_employee_document_submissions")
        .upsert(
          [
            {
              company_id: invite.company_id,
              invite_id: invite.id,
              user_id: invite.user_id,
              document_id: documentId,
              status: "submitted",
              file_url: fileUrl,
              submitted_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
          // One submission per employee per document, even across re-invites.
          { onConflict: "user_id,document_id" }
        )
        .select("*")
        .single();
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
      return NextResponse.json({ submission: data });
    }

    // digital signature
    if (!signatureName) return NextResponse.json({ error: "signatureName is required" }, { status: 400 });

    // Delete previously stored signature receipt file (best-effort).
    try {
      const { data: existing } = await supabase
        .from("HRMS_employee_document_submissions")
        .select("file_url")
        .eq("user_id", invite.user_id)
        .eq("document_id", documentId)
        .maybeSingle();
      const bucket = getBucketName();
      const oldPath = extractStoragePathFromPublicUrl(bucket, existing?.file_url);
      const newPath = extractStoragePathFromPublicUrl(bucket, fileUrl);
      if (oldPath && newPath && oldPath !== newPath) {
        await supabaseAdmin.storage.from(bucket).remove([oldPath]);
      }
    } catch {
      // ignore cleanup errors
    }

    const { data, error: sigErr } = await supabase
      .from("HRMS_employee_document_submissions")
      .upsert(
        [
          {
            company_id: invite.company_id,
            invite_id: invite.id,
            user_id: invite.user_id,
            document_id: documentId,
            status: "signed",
            file_url: fileUrl || null,
            signature_name: signatureName,
            signed_at: new Date().toISOString(),
            submitted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        // One signature per employee per document, even across re-invites.
        { onConflict: "user_id,document_id" }
      )
      .select("*")
      .single();
    if (sigErr) return NextResponse.json({ error: sigErr.message }, { status: 400 });
    return NextResponse.json({ submission: data });
  }

  if (action === "complete") {
    const password = typeof body?.password === "string" ? body.password.trim() : "";
    const profile = typeof body?.profile === "object" && body.profile ? body.profile : {};
    if (!invite.user_id) return NextResponse.json({ error: "Invite is not linked to a user" }, { status: 400 });

    const { data: authRow, error: authErr } = await supabase
      .from("HRMS_users")
      .select("auth_provider, auth_session_version")
      .eq("id", invite.user_id)
      .maybeSingle();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
    const authProvider = (authRow?.auth_provider ?? "password") as string;
    const needsPassword = authProvider !== "google";

    if (needsPassword) {
      if (!password || password.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
      }
    } else if (password && password.length > 0 && password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const requiredFields: { key: string; label: string }[] = [
      { key: "name", label: "Full name" },
      { key: "phone", label: "Phone" },
      { key: "dateOfBirth", label: "Date of birth" },
      { key: "currentAddressLine1", label: "Current address" },
      { key: "currentCity", label: "City" },
      { key: "currentState", label: "State" },
      { key: "currentCountry", label: "Country" },
      { key: "currentPostalCode", label: "Postal code" },
      { key: "bankAccountNumber", label: "Bank account number" },
      { key: "bankIfsc", label: "IFSC" },
    ];
    const missingProfile = requiredFields
      .filter(({ key }) => typeof (profile as any)?.[key] !== "string" || String((profile as any)[key]).trim() === "")
      .map(({ label }) => label);
    if (missingProfile.length) {
      return NextResponse.json({ error: `Missing required fields: ${missingProfile.join(", ")}` }, { status: 400 });
    }

    // Ensure all mandatory documents are completed (submitted or signed).
    const { data: docs, error: docErr } = await supabase
      .from("HRMS_company_documents")
      .select("id, is_mandatory")
      .eq("company_id", invite.company_id);
    if (docErr) return NextResponse.json({ error: docErr.message }, { status: 400 });

    const mandatoryIds = (docs ?? []).filter((d: any) => d.is_mandatory).map((d: any) => d.id as string);
    if (mandatoryIds.length) {
      const { data: subs, error: subErr } = await supabase
        .from("HRMS_employee_document_submissions")
        .select("document_id, status")
        .eq("invite_id", invite.id);
      if (subErr) return NextResponse.json({ error: subErr.message }, { status: 400 });
      const done = new Set((subs ?? []).filter((s: any) => s.status === "submitted" || s.status === "signed" || s.status === "approved").map((s: any) => s.document_id));
      const missing = mandatoryIds.filter((id) => !done.has(id));
      if (missing.length) return NextResponse.json({ error: "Please complete all mandatory documents first." }, { status: 400 });
    }

    const shouldSetPassword = Boolean(password) && password.length >= 8;
    const password_hash = shouldSetPassword ? await bcrypt.hash(password, 10) : null;
    const nextSv =
      shouldSetPassword
        ? (typeof authRow?.auth_session_version === "number" ? authRow.auth_session_version : 0) + 1
        : undefined;

    {
      const updatePayload: any = {
          name: typeof profile?.name === "string" ? profile.name.trim() || null : undefined,
          phone: typeof profile?.phone === "string" ? profile.phone.trim() || null : undefined,
          date_of_birth: typeof profile?.dateOfBirth === "string" ? profile.dateOfBirth || null : undefined,
          current_address_line1: typeof profile?.currentAddressLine1 === "string" ? profile.currentAddressLine1.trim() || null : undefined,
          current_address_line2: typeof profile?.currentAddressLine2 === "string" ? profile.currentAddressLine2.trim() || null : undefined,
          current_city: typeof profile?.currentCity === "string" ? profile.currentCity.trim() || null : undefined,
          current_state: typeof profile?.currentState === "string" ? profile.currentState.trim() || null : undefined,
          current_country: typeof profile?.currentCountry === "string" ? profile.currentCountry.trim() || null : undefined,
          current_postal_code: typeof profile?.currentPostalCode === "string" ? profile.currentPostalCode.trim() || null : undefined,
          permanent_address_line1: typeof profile?.permanentAddressLine1 === "string" ? profile.permanentAddressLine1.trim() || null : undefined,
          permanent_address_line2: typeof profile?.permanentAddressLine2 === "string" ? profile.permanentAddressLine2.trim() || null : undefined,
          permanent_city: typeof profile?.permanentCity === "string" ? profile.permanentCity.trim() || null : undefined,
          permanent_state: typeof profile?.permanentState === "string" ? profile.permanentState.trim() || null : undefined,
          permanent_country: typeof profile?.permanentCountry === "string" ? profile.permanentCountry.trim() || null : undefined,
          permanent_postal_code: typeof profile?.permanentPostalCode === "string" ? profile.permanentPostalCode.trim() || null : undefined,
          bank_account_number: typeof profile?.bankAccountNumber === "string" ? profile.bankAccountNumber.trim() || null : undefined,
          bank_ifsc: typeof profile?.bankIfsc === "string" ? profile.bankIfsc.trim() || null : undefined,
          aadhaar: typeof profile?.aadhaar === "string" ? profile.aadhaar.trim() || null : undefined,
          pan: typeof profile?.pan === "string" ? profile.pan.trim() || null : undefined,
          updated_at: new Date().toISOString(),
      };
      if (shouldSetPassword) {
        updatePayload.password_hash = password_hash;
        updatePayload.auth_provider = "password";
        updatePayload.auth_session_version = nextSv;
      }

      const { error: updErr } = await supabase
        .from("HRMS_users")
        .update(updatePayload)
        .eq("id", invite.user_id);
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });
    }

    const { error: invErr } = await supabase
      .from("HRMS_employee_invites")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", invite.id);
    if (invErr) return NextResponse.json({ error: invErr.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

