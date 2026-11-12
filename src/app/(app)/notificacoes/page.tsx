import type { Metadata } from "next";
import { NotificationsScreen } from "@/features/workflows/notifications-screen";

export const metadata: Metadata = { title: "Notificações" };

export default function NotificationsPage() {
  return <NotificationsScreen />;
}
