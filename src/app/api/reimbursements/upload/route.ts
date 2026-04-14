import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const maxBytes = 8 * 1024 * 1024;
  if (file.size > maxBytes) return NextResponse.json({ error: "File too large (max 8 MB)" }, { status: 400 });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "attachment";
  const objectPath = `HRMS/${me.company_id}/reimbursements/${crypto.randomUUID()}_${safeName}`;
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "photomedia";

  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabaseAdmin.storage.from(bucket).upload(objectPath, buf, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(objectPath);
  const url = pub?.publicUrl ?? objectPath;
  return NextResponse.json({ url, path: objectPath });
}
