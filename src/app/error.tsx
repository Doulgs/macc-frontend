"use client";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return <main className="center-screen"><h1>Não foi possível abrir esta página</h1><Button onClick={reset}>Tentar novamente</Button></main>;
}
