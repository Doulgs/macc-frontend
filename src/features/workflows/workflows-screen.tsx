"use client";

import { useMemo, useState } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, addEdge, useEdgesState, useNodesState,
  type Connection, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { BellRing, ChevronRight, CircleStop, GitBranch, Plus, Zap } from "lucide-react";
import { toast } from "sonner";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { Field } from "@/components/ui/fields";
import { api, companyHeaders, errorMessage } from "@/lib/api";
import { useRefreshWorkspace, useScopedQuery, useWorkspace } from "@/lib/workspace";
import "@xyflow/react/dist/style.css";
import styles from "./workflows.module.css";

const kinds = {
  trigger: { PAYABLE_DUE: "Conta a pagar perto do vencimento", BUDGET_SUBMITTED: "Orçamento enviado para aprovação", EXPENSE_CONFIRMED: "Despesa confirmada" },
  condition: { IS_OPEN: "Ainda em aberto", AMOUNT_AT_LEAST: "Valor mínimo" },
  action: { NOTIFY_FINANCE: "Notificar equipe financeira", REQUEST_APPROVAL: "Solicitar aprovação" },
  end: { END: "Encerrar" },
} as const;
type NodeType = keyof typeof kinds;
type Branch = "YES" | "NO";
type Rule = { id: string; type: NodeType; kind: string; days?: number | null; amount?: string | null; x?: number | null; y?: number | null };
type Link = { source: string; target: string; branch?: Branch | null };
type Definition = { nodes: Rule[]; edges: Link[] };
type Workflow = { id: string; name: string; status: string; publishedVersion?: number; definition: Definition; revision: number };
type Run = { id: string; version: number; status: string; triggerKind: string; sourceId: string; startedAt: string; errorCode?: string; attempts: number };
type GraphNode = Node<Rule, "rule">;
const typeLabel: Record<NodeType, string> = { trigger: "Gatilho", condition: "Condição", action: "Ação", end: "Fim" };
const workflowStatus: Record<string, string> = { DRAFT: "Rascunho", PUBLISHED: "Publicado", PAUSED: "Pausado" };
const runStatus: Record<string, string> = { PENDING: "Aguardando nova tentativa", COMPLETED: "Concluído", SKIPPED: "Sem ação", FAILED: "Falhou" };
const typeIcon = { trigger: Zap, condition: GitBranch, action: BellRing, end: CircleStop };
const template: Definition = {
  nodes: [
    { id: "inicio", type: "trigger", kind: "PAYABLE_DUE", days: 3, x: 0, y: 65 },
    { id: "aviso", type: "action", kind: "NOTIFY_FINANCE", x: 264, y: 65 },
    { id: "fim", type: "end", kind: "END", x: 528, y: 65 },
  ],
  edges: [{ source: "inicio", target: "aviso" }, { source: "aviso", target: "fim" }],
};

function label(rule: Rule) {
  return (kinds[rule.type] as Record<string, string>)[rule.kind] ?? rule.kind;
}

function RuleNode({ data, selected }: NodeProps<GraphNode>) {
  const Icon = typeIcon[data.type];
  return <div className={styles.node} data-type={data.type} data-selected={selected}>
    {data.type !== "trigger" && <Handle type="target" position={Position.Left} />}
    <span><Icon size={15} aria-hidden /> {typeLabel[data.type]}</span>
    <strong>{label(data)}</strong>
    {data.kind === "PAYABLE_DUE" && <small>{data.days ?? 0} dia(s) antes</small>}
    {data.kind === "AMOUNT_AT_LEAST" && <small>R$ {data.amount ?? "0"}</small>}
    {data.type === "condition" ? <>
      <Handle type="source" position={Position.Right} id="YES" style={{ top: "34%" }} />
      <Handle type="source" position={Position.Right} id="NO" style={{ top: "69%" }} />
    </> : data.type !== "end" && <Handle type="source" position={Position.Right} />}
  </div>;
}

const nodeTypes = { rule: RuleNode };
const edgeStyle = { markerEnd: { type: MarkerType.ArrowClosed }, type: "smoothstep" } as const;

export function WorkflowsScreen() {
  const workspace = useWorkspace();
  const allowed = workspace.can("workflows.read") && workspace.feature("WORKFLOWS");
  const workflows = useScopedQuery<Workflow[]>("/workflows", undefined, { enabled: allowed });
  const [selection, setSelection] = useState<{ company: string; id: string }>();
  if (!allowed) return <EmptyState title="Automações indisponíveis" detail="Seu perfil não pode acessar automações nesta empresa." />;
  if (workflows.isPending) return <LoadingState />;
  if (workflows.isError) return <ErrorState error={workflows.error} retry={() => void workflows.refetch()} />;
  const selected = selection?.company === workspace.company.id ? selection.id : workflows.data[0]?.id;
  const initial = workflows.data.find(flow => flow.id === selected);
  const creating = selected === "new";
  return <>
    <PageHeading eyebrow="Inteligência" title="Automações" subtitle="Configure avisos de vencimento e encaminhe solicitações para aprovação."
      actions={workspace.can("workflows.write") && <Button onClick={() => setSelection({ company: workspace.company.id, id: "new" })}><Plus size={17} /> Novo fluxo</Button>} />
    {workflows.data.length > 0 && <nav className={styles.flowList} aria-label="Fluxos de automação">
      {workflows.data.map(flow => <Button key={flow.id} variant={flow.id === selected ? "primary" : "outline"}
        aria-current={flow.id === selected ? "page" : undefined}
        onClick={() => setSelection({ company: workspace.company.id, id: flow.id })}>{flow.name} <ChevronRight size={14} /></Button>)}
    </nav>}
    {creating || initial ? <Editor key={workspace.company.id + ":" + selected} initial={initial}
      onCreated={id => setSelection({ company: workspace.company.id, id })} /> :
      <EmptyState title="Nenhum fluxo cadastrado" detail="Crie um fluxo para avisar sua equipe antes do vencimento de uma conta." />}
  </>;
}

function Editor({ initial, onCreated }: { initial?: Workflow; onCreated: (id: string) => void }) {
  const { company, can } = useWorkspace();
  const refresh = useRefreshWorkspace();
  const editable = can("workflows.write");
  const publishable = can("workflows.publish");
  const [current, setCurrent] = useState(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [dirty, setDirty] = useState(!initial);
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState<string>();
  const [addType, setAddType] = useState<NodeType>("condition");
  const [target, setTarget] = useState("");
  const [branch, setBranch] = useState<Branch>("YES");
  const [nodes, setNodes, changeNodes] = useNodesState<GraphNode>((initial?.definition ?? template).nodes.map((node, index) => ({
    id: node.id, type: "rule", data: node, position: { x: node.x ?? index * 244, y: node.y ?? 65 },
  })));
  const [edges, setEdges, changeEdges] = useEdgesState<Edge>((initial?.definition ?? template).edges.map(edge => ({
    ...edgeStyle, id: [edge.source, edge.branch ?? "", edge.target].join(":"), source: edge.source, target: edge.target,
    sourceHandle: edge.branch ?? null, label: edge.branch === "YES" ? "Sim" : edge.branch === "NO" ? "Não" : undefined,
  })));
  const chosen = nodes.find(node => node.id === focus);
  const destinations = useMemo(() => nodes.filter(node => node.id !== focus && node.data.type !== "trigger"), [nodes, focus]);
  const runs = useScopedQuery<Run[]>(`/workflows/${current?.id ?? ""}/runs`, undefined, { enabled: !!current?.id });

  function connect(connection: Connection) {
    const source = nodes.find(node => node.id === connection.source);
    const destination = nodes.find(node => node.id === connection.target);
    if (!editable || !source || !destination || source.id === destination.id || source.data.type === "end" || destination.data.type === "trigger") return;
    if (edges.some(edge => edge.source === source.id && (edge.sourceHandle ?? null) === (connection.sourceHandle ?? null))) {
      toast.error("Remova a conexão existente para usar essa saída.");
      return;
    }
    const visited = new Set<string>();
    function reachesSource(id: string): boolean {
      if (id === source?.id) return true;
      if (visited.has(id)) return false;
      visited.add(id);
      return edges.some(edge => edge.source === id && reachesSource(edge.target));
    }
    if (reachesSource(destination.id)) { toast.error("Fluxos não podem conter ciclos."); return; }
    setDirty(true);
    setEdges(old => addEdge({ ...connection, ...edgeStyle,
      label: connection.sourceHandle === "YES" ? "Sim" : connection.sourceHandle === "NO" ? "Não" : undefined }, old));
  }

  function add() {
    if (nodes.length >= 32) { toast.error("O fluxo comporta até 32 etapas."); return; }
    const id = crypto.randomUUID();
    const kind = Object.keys(kinds[addType])[0];
    const data: Rule = { id, type: addType, kind, ...(kind === "PAYABLE_DUE" ? { days: 3 } : {}) };
    setNodes(old => [...old, { id, type: "rule", data, position: { x: (old.length % 3) * 264, y: Math.floor(old.length / 3) * 144 + 65 } }]);
    setFocus(id);
    setDirty(true);
  }

  function edit(data: Partial<Rule>) {
    setNodes(old => old.map(node => node.id === focus ? { ...node, data: { ...node.data, ...data } } : node));
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    try {
      const definition: Definition = {
        nodes: nodes.map(node => ({ ...node.data, x: node.position.x, y: node.position.y })),
        edges: edges.map(edge => ({ source: edge.source, target: edge.target, branch: (edge.sourceHandle ?? undefined) as Branch | undefined })),
      };
      const config = { headers: companyHeaders(company.id) };
      const payload = { name: name.trim(), definition, revision: current?.revision };
      const response = current ? await api.patch<Workflow>(`/workflows/${current.id}`, payload, config) : await api.post<Workflow>("/workflows", payload, config);
      setCurrent(response.data);
      setDirty(false);
      await refresh();
      if (!current) onCreated(response.data.id);
      toast.success("Fluxo salvo.");
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function changePublication(action: "publish" | "pause") {
    if (!current || dirty) return;
    setBusy(true);
    try {
      const { data } = await api.post<Workflow>(`/workflows/${current.id}/${action}`, {}, { headers: companyHeaders(company.id) });
      setCurrent(data);
      await refresh();
      toast.success(action === "publish" ? "Versão publicada." : "Fluxo pausado.");
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setBusy(false); }
  }

  return <div className={styles.stack}>
    <section className={styles.editor} aria-label="Editor de fluxo">
      <div className={styles.toolbar}>
        <Field label="Nome do fluxo">{props => <input className="input" {...props} value={name} maxLength={120} disabled={!editable || busy}
          placeholder="Ex.: Avisar sobre contas a vencer" onChange={event => { setName(event.target.value); setDirty(true); }} />}</Field>
        <div className={styles.actions}>
          <span className={styles.badge}>{workflowStatus[current?.status ?? "DRAFT"]}{current?.publishedVersion ? ` · v${current.publishedVersion}` : ""}</span>
          {editable && <Button variant="outline" disabled={!name.trim() || !dirty || busy} onClick={() => void save()}>Salvar rascunho</Button>}
          {publishable && current && <>
            {current.status === "PUBLISHED" && <Button variant="ghost" disabled={dirty || busy} onClick={() => void changePublication("pause")}>Pausar</Button>}
            <Button disabled={dirty || busy} onClick={() => void changePublication("publish")}>Publicar versão</Button>
          </>}
        </div>
      </div>
      <div className={styles.workspace}>
        <div className={styles.canvas} aria-label="Diagrama de automação">
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onConnect={connect}
            onNodesChange={changes => { changeNodes(changes); if (changes.some(change => change.type === "remove" || change.type === "position" && change.dragging === false)) setDirty(true); }}
            onEdgesChange={changes => { changeEdges(changes); if (changes.some(change => change.type === "remove")) setDirty(true); }}
            nodesDraggable={editable && !busy} nodesConnectable={editable && !busy} deleteKeyCode={editable && !busy ? "Delete" : null}
            onNodeClick={(_, node) => { setFocus(node.id); setTarget(""); }} fitView minZoom={0.2} fitViewOptions={{ padding: 0.18 }}
            ariaLabelConfig={{ "node.a11yDescription.default": "Use Tab para navegar pelas etapas do fluxo.", "controls.ariaLabel": "Controles do diagrama" }}>
            <Background color="#4c7196" gap={21} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <aside className={styles.inspector}>
          <h2>Etapas do fluxo</h2>
          {editable && <div className={styles.inline}>
            <Field label="Nova etapa">{props => <select className="input" {...props} value={addType} onChange={event => setAddType(event.target.value as NodeType)}>
              {Object.entries(typeLabel).map(([id, text]) => <option key={id} value={id}>{text}</option>)}
            </select>}</Field>
            <Button size="icon" variant="outline" aria-label="Adicionar etapa" onClick={add} disabled={busy}><Plus size={17} /></Button>
          </div>}
          <Field label="Etapa selecionada">{props => <select className="input" {...props} value={focus ?? ""} onChange={event => { setFocus(event.target.value); setTarget(""); }}>
            <option value="">Selecione uma etapa</option>
            {nodes.map(node => <option key={node.id} value={node.id}>{typeLabel[node.data.type]}: {label(node.data)}</option>)}
          </select>}</Field>
          {chosen && <>
            <Field label="Regra">{props => <select className="input" {...props} disabled={!editable || busy} value={chosen.data.kind}
              onChange={event => edit({ kind: event.target.value, days: event.target.value === "PAYABLE_DUE" ? 3 : undefined, amount: undefined })}>
              {Object.entries(kinds[chosen.data.type]).map(([id, text]) => <option key={id} value={id}>{text}</option>)}
            </select>}</Field>
            {chosen.data.kind === "PAYABLE_DUE" && <Field label="Dias antes do vencimento">{props =>
              <input className="input" {...props} disabled={!editable || busy} type="number" min={0} max={90} value={chosen.data.days ?? ""}
                onChange={event => edit({ days: event.target.value ? Number(event.target.value) : null })} />}</Field>}
            {chosen.data.kind === "AMOUNT_AT_LEAST" && <Field label="Valor mínimo em reais">{props =>
              <input className="input" {...props} disabled={!editable || busy} type="number" min={0} step="0.01" value={chosen.data.amount ?? ""}
                onChange={event => edit({ amount: event.target.value || null })} />}</Field>}
            {editable && chosen.data.type !== "end" && <>
              {chosen.data.type === "condition" && <Field label="Saída">{props => <select className="input" {...props} value={branch}
                onChange={event => setBranch(event.target.value as Branch)}><option value="YES">Sim</option><option value="NO">Não</option></select>}</Field>}
              <Field label="Conectar à etapa">{props => <select className="input" {...props} value={target} onChange={event => setTarget(event.target.value)}>
                <option value="">Selecione o destino</option>{destinations.map(node => <option key={node.id} value={node.id}>{label(node.data)}</option>)}
              </select>}</Field>
              <Button variant="outline" size="small" disabled={!target || busy}
                onClick={() => connect({ source: chosen.id, target, sourceHandle: chosen.data.type === "condition" ? branch : null, targetHandle: null })}>Conectar</Button>
            </>}
            {editable && edges.filter(edge => edge.source === chosen.id).map(edge => <Button key={edge.id} variant="ghost" size="small" disabled={busy}
              onClick={() => { setEdges(old => old.filter(link => link.id !== edge.id)); setDirty(true); }}>Remover conexão {edge.label ? String(edge.label).toLowerCase() : ""}</Button>)}
            {editable && <Button variant="danger" size="small" disabled={busy} onClick={() => {
              setNodes(old => old.filter(node => node.id !== chosen.id));
              setEdges(old => old.filter(edge => edge.source !== chosen.id && edge.target !== chosen.id)); setFocus(undefined); setDirty(true);
            }}>Remover etapa</Button>}
          </>}
        </aside>
      </div>
    </section>
    {current && <section className={styles.history}>
      <div className={styles.toolbar}><h2>Histórico de execução</h2>
        <Button variant="outline" size="small" onClick={() => void runs.refetch()}>Atualizar</Button></div>
      {runs.isPending ? <LoadingState rows={2} /> : runs.isError ? <ErrorState error={runs.error} retry={() => void runs.refetch()} /> : !runs.data.length ?
        <EmptyState title="Nenhuma execução" detail="O histórico aparece depois que um evento aciona uma versão publicada." /> :
        <div className={styles.scroll}><table><thead><tr><th>Versão</th><th>Resultado</th><th>Início</th><th>Tentativas</th></tr></thead>
          <tbody>{runs.data.map(run => <tr key={run.id}><td>v{run.version}</td>
            <td>{runStatus[run.status] ?? run.status}{run.errorCode === "NO_ACTIVE_RECIPIENT" && <small>Nenhum destinatário ativo</small>}</td>
            <td>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: company.timezone }).format(new Date(run.startedAt))}</td><td>{run.attempts}</td></tr>)}</tbody></table></div>}
    </section>}
  </div>;
}
