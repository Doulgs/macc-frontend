import type { Metadata } from "next";
import { WorkflowsScreen } from "@/features/workflows/workflows-screen";

export const metadata: Metadata = { title: "Automações" };

export default function WorkflowsPage() {
  return <WorkflowsScreen />;
}
