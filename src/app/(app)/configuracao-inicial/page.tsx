import type { Metadata } from "next";
import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";

export const metadata: Metadata = { title: "Configuração inicial" };

export default function OnboardingPage() { return <OnboardingScreen />; }
