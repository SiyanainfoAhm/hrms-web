import { redirect } from "next/navigation";

/** Legacy starter URL — HRMS UI lives on real module routes (e.g. `/app/dashboard`). */
export default function DemoRedirectPage() {
  redirect("/app/dashboard");
}
