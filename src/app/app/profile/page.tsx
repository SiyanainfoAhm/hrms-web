"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/layout/AppShell";
import { TopbarTemplate } from "../../../components/layout/TopbarTemplate";
import { AvatarMenu, type AvatarMenuUser } from "../../../components/layout/AvatarMenu";
import { NotificationMenuTemplate, type NotificationItem } from "../../../components/layout/NotificationMenuTemplate";
import { ProfileTemplate, type ProfileUser } from "../../../components/profile/ProfileTemplate";
import type { Actor } from "../../../lib/permissions";
import type { EntityField } from "../../../types/crud";

type ProfileValues = {
  fullName: string;
  email: string;
  phone?: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const actor: Actor = useMemo(() => {
    if (typeof window === "undefined") return { role: "viewer" as never };
    try {
      const u = JSON.parse(localStorage.getItem("demoUser") || "null") as { role?: string } | null;
      return { role: (u?.role ?? "viewer") as Actor["role"] };
    } catch {
      return { role: "viewer" as never };
    }
  }, []);

  const base = useMemo(() => {
    if (typeof window === "undefined") return { fullName: "User", email: "" };
    const raw = localStorage.getItem("demoUser");
    if (!raw) return { fullName: "User", email: "" };
    const u = JSON.parse(raw) as { fullName?: string; email?: string; role?: string };
    return { fullName: u.fullName ?? "User", email: u.email ?? "" };
  }, []);

  const [notifLoading, setNotifLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const unreadCount = notifications.filter((n) => n.unread).length;

  const user: ProfileUser = {
    id: "u1",
    fullName: base.fullName,
    email: base.email,
    roleLabel: String(actor.role ?? "")
  };

  const avatarUser: AvatarMenuUser = { id: "u1", fullName: base.fullName, roleLabel: String(actor.role ?? "") };

  const editFields: EntityField<ProfileValues>[] = [
    { key: "fullName", label: "Full name", type: "text", required: true, placeholder: "Your name" },
    { key: "email", label: "Email", type: "email", required: true, placeholder: "email@example.com" },
    { key: "phone", label: "Phone", type: "text", placeholder: "+1 555 000 0000" }
  ];

  return (
    <AppShell actor={actor}>
      <TopbarTemplate
        title="Profile"
        description="Reusable profile screen + edit dialog pattern."
        right={
          <>
            <NotificationMenuTemplate
              count={unreadCount}
              loading={notifLoading}
              items={notifications}
              onOpen={async () => {
                setNotifLoading(true);
                await new Promise((r) => setTimeout(r, 200));
                setNotifLoading(false);
              }}
              onMarkAllRead={() => setNotifications((p) => p.map((n) => ({ ...n, unread: false })))}
            />
            <AvatarMenu
              user={avatarUser}
              onOpenProfile={() => router.push("/app/profile")}
              onLogout={() => {
                localStorage.removeItem("demoUser");
                router.push("/auth/login");
              }}
            />
          </>
        }
      />

      <ProfileTemplate<ProfileValues>
        actor={actor}
        user={user}
        sections={[
          {
            key: "account",
            title: "Account",
            description: "Common fields shown in most admin portals.",
            rows: [
              { label: "Name", value: user.fullName },
              { label: "Email", value: user.email || <span className="text-gray-400">Not set</span> },
              { label: "Role", value: user.roleLabel }
            ]
          },
          {
            key: "security",
            title: "Security",
            description: "Placeholder actions (wire to your auth later).",
            rows: [
              { label: "Password", value: <span className="text-gray-500">••••••••</span> }
            ]
          }
        ]}
        editFields={editFields}
        editInitialValues={{ fullName: base.fullName, email: base.email, phone: "" }}
        onSave={async (values) => {
          localStorage.setItem("demoUser", JSON.stringify({ id: "u1", fullName: values.fullName, email: values.email, role: actor.role }));
        }}
      />
    </AppShell>
  );
}

