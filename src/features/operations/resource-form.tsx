"use client";
import { useState } from "react";
import Decimal from "decimal.js";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/fields";
import { api, companyHeaders, errorFields, errorMessage, normalizePage, type ApiPage, type ApiRow } from "@/lib/api";
import { civilDate, currentMonth, decimalInput, money } from "@/lib/utils";
import { useRefreshWorkspace, useScopedQuery, useWorkspace } from "@/lib/workspace";
import { budgetLineFields, rowName, saleItemFields, type FieldSpec } from "./definitions";

type InputValue = string | number;
type Payload = Record<string, unknown>;

export function ResourceField({ spec, prefix = "", value, error, onChange }: {
  spec: FieldSpec; prefix?: string; value?: string; error?: string; onChange: (value: string) => void;
}) {
  const [lookupPage, setLookupPage] = useState(0);
  const name = prefix + spec.key;
  const lookup = useScopedQuery<ApiPage<ApiRow> | ApiRow[]>(
    spec.resource ?? "/unused", { page: lookupPage, size: 50, ...spec.params }, { enabled: !!spec.resource },
  );
  const page = lookup.data ? normalizePage(lookup.data) : undefined;
  const selectOptions = spec.options ?? page?.items.map(row => ({ value: row.id, label: rowName(row) })) ?? [];
  const renderedOptions = value && !selectOptions.some(option => option.value === value)
    ? [{ value, label: "Seleção atual" }, ...selectOptions] : selectOptions;
  return <Field label={spec.label + (!spec.required ? " (opcional)" : "")} error={error}
    hint={spec.type === "amount" ? "Ex.: 1250,50" : lookup.isError && spec.resource ? "Falha ao buscar opções." : undefined}
    className={spec.full ? "span-full" : undefined}>
    {props => {
      const common = { ...props, className: "input", name, value: value ?? "", required: spec.required, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange(event.target.value) };
      if (spec.type === "select") return <>
        <select {...common}><option value="">{lookup.isPending && spec.resource ? "Carregando…" : "Selecione"}</option>
          {renderedOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select>
        {spec.resource && (lookupPage > 0 || (page?.totalPages ?? 0) > 1) && <div className="table-actions">
          <Button type="button" variant="ghost" size="small" disabled={lookupPage === 0} onClick={() => setLookupPage(lookupPage - 1)}>Opções anteriores</Button>
          <Button type="button" variant="ghost" size="small" disabled={!page || lookupPage + 1 >= page.totalPages} onClick={() => setLookupPage(lookupPage + 1)}>Mais opções</Button>
        </div>}
      </>;
      if (spec.type === "textarea") return <textarea {...common} rows={3} maxLength={spec.max ?? 500} />;
      return <input {...common} type={spec.type === "amount" ? "text" : spec.type ?? "text"}
        min={spec.type === "number" ? spec.min : undefined} max={spec.type === "number" ? spec.max : undefined}
        maxLength={spec.type === "amount" ? 22 : spec.type === "text" || spec.type === "email" || !spec.type ? spec.max ?? 254 : undefined}
        inputMode={spec.type === "amount" ? "decimal" : undefined} />;
    }}
  </Field>;
}

function parseFields(fields: FieldSpec[], values: Record<string, string>, prefix: string, errors: Record<string, string>) {
  const payload: Record<string, InputValue> = {};
  for (const field of fields) {
    const name = prefix + field.key;
    const value = (values[name] ?? "").trim();
    if (!value) {
      if (field.required) errors[name] = "Preencha este campo.";
      continue;
    }
    if (field.type === "amount") {
      const amount = decimalInput(value);
      if (!amount || !/^-?\d{1,16}(?:\.\d{1,4})?$/.test(amount)) errors[name] = "Informe um valor decimal válido.";
      else if (new Decimal(amount).isNegative() && field.key !== "initialBalance") errors[name] = "Informe um valor positivo.";
      else if (new Decimal(amount).isZero() && !field.zero) errors[name] = "Informe um valor maior que zero.";
      else if (field.max !== undefined && new Decimal(amount).greaterThan(field.max)) errors[name] = "Valor máximo: " + field.max;
      else payload[field.key] = amount;
      continue;
    }
    if (field.type === "number") {
      const number = Number(value);
      if (!Number.isSafeInteger(number) || number < (field.min ?? 0) || number > (field.max ?? 1_000_000)) errors[name] = "Informe um número dentro do intervalo.";
      else payload[field.key] = number;
      continue;
    }
    if (field.type === "email" && !z.email().safeParse(value).success) errors[name] = "Informe um e-mail válido.";
    else if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors[name] = "Informe uma data válida.";
    else if (field.options && !field.options.some(option => option.value === value)) errors[name] = "Selecione uma opção válida.";
    else payload[field.key] = value;
  }
  return payload;
}

function initialFields(fields: FieldSpec[], row: Payload | undefined, timezone: string, prefix = "") {
  return Object.fromEntries(fields.map(field => {
    const value = row?.[field.key];
    return [prefix + field.key, typeof value === "string" || typeof value === "number"
      ? String(value).slice(0, field.type === "date" ? 10 : undefined)
      : field.default === "today" ? civilDate(new Date(), timezone) : String(field.default ?? "")];
  }));
}

export type ResourceFormProps = {
  title: string;
  description?: string;
  path: string;
  fields: FieldSpec[];
  row?: Payload;
  method?: "post" | "patch";
  collection?: "lines" | "items";
  destructive?: boolean;
  submitLabel?: string;
  includeVersion?: boolean;
  defaults?: Payload;
  onClose: () => void;
  onSave?: (row?: ApiRow) => void;
};

export function ResourceForm({ title, description, path, fields, row, method = "post", collection, destructive, submitLabel = "Salvar", includeVersion, defaults, onClose, onSave }: ResourceFormProps) {
  const { company } = useWorkspace();
  const refresh = useRefreshWorkspace();
  const collectionFields = collection === "items" ? saleItemFields : budgetLineFields;
  const existingItems = collection && Array.isArray(row?.[collection]) ? row[collection] as Payload[] : [];
  const [lines, setLines] = useState(() => collection ? Array.from({ length: Math.max(1, existingItems.length) }, (_, index) => index) : []);
  const [lineSequence, setLineSequence] = useState(lines.length);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const { startDate, endDate } = currentMonth(company.timezone);
    const initial = initialFields(fields, { ...(collection === "lines" ? { periodStart: startDate, periodEnd: endDate } : {}), ...defaults, ...row }, company.timezone);
    return Object.assign(initial, ...lines.map(index => initialFields(collectionFields, existingItems[index], company.timezone, index + ".")));
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [idempotency, setIdempotency] = useState<{ key: string; fingerprint: string }>();
  const setValue = (key: string, value: string) => setValues(current => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const validation: Record<string, string> = {};
    const payload: Payload = parseFields(fields, values, "", validation);
    if (collection) {
      payload[collection] = lines.map(index => {
        const prefix = index + ".";
        const item = parseFields(collectionFields, values, prefix, validation);
        if (collection === "items" && !item.catalogItemId) {
          if (!item.description) validation[prefix + "description"] = "Informe uma descrição ou selecione um item.";
          if (item.unitPrice === undefined) validation[prefix + "unitPrice"] = "Informe o preço de um item avulso.";
        }
        return item;
      });
    }
    if (collection === "lines" && String(payload.periodStart) > String(payload.periodEnd)) validation.periodEnd = "A data final deve vir após a inicial.";
    if (path === "/transfers" && payload.sourceAccountId && payload.sourceAccountId === payload.destinationAccountId) validation.destinationAccountId = "Selecione outra conta.";
    if (path === "/transactions") Object.assign(payload, { currency: company.currency, status: "SCHEDULED" });
    if (includeVersion && row?.version !== undefined) payload.version = row.version;
    setErrors(validation);
    if (Object.keys(validation).length) return;
    setBusy(true);
    try {
      const fingerprint = JSON.stringify(payload);
      const key = idempotency?.fingerprint === fingerprint ? idempotency.key : crypto.randomUUID();
      setIdempotency({ key, fingerprint });
      const { data } = await api[method]<ApiRow>(path, payload, { headers: { ...companyHeaders(company.id), "Idempotency-Key": key } });
      await refresh();
      toast.success("Operação concluída.");
      onSave?.(data);
      onClose();
    } catch (failure) {
      const invalid = Object.fromEntries(Object.entries(errorFields(failure)).map(([field, messages]) => {
        const nested = field.match(/^(?:lines|items)\[(\d+)\]\.(.+)$/);
        const key = nested ? lines[Number(nested[1])] + "." + nested[2] : field;
        return [key, messages[0] ?? "Revise este campo."];
      }));
      setErrors(invalid);
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  function addLine() {
    setLines(current => [...current, lineSequence]);
    setValues(current => ({ ...current, ...initialFields(collectionFields, undefined, company.timezone, lineSequence + ".") }));
    setLineSequence(lineSequence + 1);
  }

  function renderField(spec: FieldSpec, prefix = "") {
    const selectedKind = values.kind || values.type;
    const categoryField = spec.resource === "/financial-categories" && !spec.params && selectedKind;
    const field = categoryField ? { ...spec, params: { kind: selectedKind } } : spec;
    const key = prefix + spec.key;
    return <ResourceField key={key} spec={field} prefix={prefix} error={errors[key]} value={values[key]} onChange={value => {
      setValue(key, value);
      if (spec.key === "type" && path === "/transactions") setValue("categoryId", "");
      if (spec.key === "kind" && path === "/financial-categories") setValue("parentId", "");
    }} />;
  }

  const preview = collection === "items" ? salePreview(lines, values) : undefined;
  return <Dialog open onOpenChange={onClose} title={title} description={description} busy={busy}>
    <form className="form-stack" onSubmit={submit} noValidate>
      <div className="form-grid">{fields.map(field => renderField(field))}</div>
      {collection && <>
        {lines.map((index, position) => <fieldset className="line-editor" key={index}>
          <legend>{collection === "items" ? "Item" : "Categoria"} {position + 1}</legend>
          <div className="form-grid">{collectionFields.map(field => renderField(field, index + "."))}</div>
          <Button type="button" size="small" variant="outline" disabled={lines.length < 2} onClick={() => setLines(lines.filter(item => item !== index))}><Trash2 size={15} /> Remover</Button>
        </fieldset>)}
        <Button type="button" variant="outline" size="small" disabled={lines.length >= 100} onClick={addLine}><Plus size={16} /> {collection === "items" ? "Adicionar item" : "Adicionar categoria"}</Button>
      </>}
      {preview && <p className="muted">Prévia do total: <strong>{money(preview, company.currency)}</strong>. O valor final será confirmado ao salvar.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="dialog-actions"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Voltar</Button><Button variant={destructive ? "danger" : "primary"} disabled={busy}>{busy ? "Aguarde…" : submitLabel}</Button></div>
    </form>
  </Dialog>;
}

function salePreview(lines: number[], values: Record<string, string>) {
  let total = new Decimal(decimalInput(values.taxTotal ?? "") ?? "0");
  for (const index of lines) {
    const quantity = decimalInput(values[index + ".quantity"] ?? "");
    const price = decimalInput(values[index + ".unitPrice"] ?? "");
    if (!quantity || !price) return undefined;
    const discount = decimalInput(values[index + ".discountAmount"] ?? "") ?? "0";
    total = total.plus(new Decimal(quantity).mul(price).toDecimalPlaces(2).minus(discount));
  }
  return total.toFixed(2);
}
