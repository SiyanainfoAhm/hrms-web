import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getStorageBucket,
  isOwnedProfilePicturePath,
  profilePictureFolder,
  publicUrlForStoragePath,
} from "@/lib/profilePictureStorage";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

function extensionForType(ct: string): string {
  if (ct === "image/png") return "png";
  if (ct === "image/webp") return "webp";
  return "jpg";
}

async function getCurrentProfilePath(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("HRMS_users")
    .select("profile_image_path")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const raw = data?.profile_image_path;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "Please select a JPG, PNG or WebP image." }, { status: 400 });
  }

  const ct = (file.type || "").toLowerCase();
  if (!ALLOWED_TYPES.has(ct)) {
    return NextResponse.json({ error: "Please select a JPG, PNG or WebP image." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Profile picture must be smaller than 5 MB." }, { status: 400 });
  }

  let previousPath: string | null = null;
  try {
    previousPath = await getCurrentProfilePath(session.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load profile";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const bucket = getStorageBucket();
  const folder = profilePictureFolder(session.id);
  const objectPath = `${folder}/avatar-${Date.now()}.${extensionForType(ct)}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabaseAdmin.storage.from(bucket).upload(objectPath, buf, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const { data: updated, error: updErr } = await supabase
    .from("HRMS_users")
    .update({ profile_image_path: objectPath, updated_at: new Date().toISOString() })
    .eq("id", session.id)
    .select("id, profile_image_path")
    .single();

  if (updErr || !updated) {
    await supabaseAdmin.storage.from(bucket).remove([objectPath]);
    return NextResponse.json({ error: updErr?.message || "Failed to save profile picture" }, { status: 400 });
  }

  if (previousPath && previousPath !== objectPath && isOwnedProfilePicturePath(previousPath, session.id)) {
    await supabaseAdmin.storage.from(bucket).remove([previousPath]);
  }

  const profileImagePath = String(updated.profile_image_path);
  const profileImageUrl = publicUrlForStoragePath(profileImagePath);

  return NextResponse.json({
    profileImagePath,
    profileImageUrl,
  });
}

export async function DELETE() {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let previousPath: string | null = null;
  try {
    previousPath = await getCurrentProfilePath(session.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load profile";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (!previousPath) {
    return NextResponse.json({ profileImagePath: null, profileImageUrl: null });
  }

  if (!isOwnedProfilePicturePath(previousPath, session.id)) {
    return NextResponse.json({ error: "Invalid profile image path" }, { status: 400 });
  }

  const { error: updErr } = await supabase
    .from("HRMS_users")
    .update({ profile_image_path: null, updated_at: new Date().toISOString() })
    .eq("id", session.id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  const bucket = getStorageBucket();
  await supabaseAdmin.storage.from(bucket).remove([previousPath]);

  return NextResponse.json({ profileImagePath: null, profileImageUrl: null });
}
