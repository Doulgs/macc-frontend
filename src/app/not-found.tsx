import Link from "next/link";

export default function NotFound() {
  return <main className="center-screen"><h1>Página não encontrada</h1><Link href="/dashboard">Voltar ao painel</Link></main>;
}
