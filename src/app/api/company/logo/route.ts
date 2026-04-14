import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);
const MAX_BYTES = 2 * 1024 * 1024;

/** Supabase Storage path: `HRMS/company logos/{company_id}/{file}` */
const COMPANY_LOGOS_ROOT = "HRMS/company logos";

function companyLogoFolder(companyId: string): string {
  return `${COMPANY_LOGOS_ROOT}/${companyId}`;
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Logo too large (max 2 MB)" }, { status: 400 });
  const ct = (file.type || "").toLowerCase();
  if (!ALLOWED_TYPES.has(ct)) {
    return NextResponse.json({ error: "Use PNG, JPEG, WebP, GIF, or SVG" }, { status: 400 });
  }

  const ext =
    ct === "image/png"
      ? "png"
      : ct === "image/jpeg"
        ? "jpg"
        : ct === "image/webp"
          ? "webp"
          : ct === "image/gif"
            ? "gif"
            : "svg";
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "photomedia";
  const folder = companyLogoFolder(me.company_id);
  const objectPath = `${folder}/logo_${crypto.randomUUID()}.${ext}`;

  const { data: existing, error: listErr } = await supabaseAdmin.storage.from(bucket).list(folder, { limit: 100 });
  if (!listErr && existing?.length) {
    await supabaseAdmin.storage.from(bucket).remove(existing.map((f) => `${folder}/${f.name}`));
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabaseAdmin.storage.from(bucket).upload(objectPath, buf, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(objectPath);
  const logoUrl = pub?.publicUrl ?? "";

  const { data: company, error: updErr } = await supabase
    .from("HRMS_companies")
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
    .eq("id", me.company_id)
    .select("*")
    .single();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  return NextResponse.json({ logoUrl, company });
}

export async function DELETE() {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "photomedia";
  const folder = companyLogoFolder(me.company_id);
  const { data: listed, error: listErr } = await supabaseAdmin.storage.from(bucket).list(folder, { limit: 100 });
  if (!listErr && listed?.length) {
    const paths = listed.map((f) => `${folder}/${f.name}`);
    await supabaseAdmin.storage.from(bucket).remove(paths);
  }

  const { data: company, error: updErr } = await supabase
    .from("HRMS_companies")
    .update({ logo_url: null, updated_at: new Date().toISOString() })
    .eq("id", me.company_id)
    .select("*")
    .single();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  return NextResponse.json({ company });
}
