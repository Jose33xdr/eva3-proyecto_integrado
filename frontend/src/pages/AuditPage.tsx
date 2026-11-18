import { RefreshCcw, ShieldCheck } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { PageLoader } from "../components/feedback/PageLoader";
import { PageHeader } from "../components/ui/PageHeader";
import { ResponsiveTable } from "../components/ui/ResponsiveTable";
import { useResource } from "../hooks/useResource";
import { translateChoiceLabel } from "../lib/choiceLabels";
import { localDateBound } from "../lib/dateBounds";

type AuditItem = {
  id: string;
  action: string;
  module: string;
  entity: string | null;
  entityId: string | null;
  description: string;
  metadata: { statusCode?: number; durationMs?: number } | null;
  createdAt: string;
  user: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
  } | null;
};

type AuditResponse = {
  items: AuditItem[];
  meta: { page: number; pages: number; total: number };
};

const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const initialAuditDates = () => {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: localDate(from), to: localDate(to) };
};

const formatDate = (value: string) =>
  new Date(value).toLocaleString("es-CL");

export const AuditPage = () => {
  const dates = useMemo(() => initialAuditDates(), []);
  const [from, setFrom] = useState(dates.from);
  const [to, setTo] = useState(dates.to);
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);

  const endpoint = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: "100",
    });
    if (from) params.set("from", localDateBound(from, "start"));
    if (to) params.set("to", localDateBound(to, "end"));
    if (action) params.set("action", action);
    return `/reports/audit?${params.toString()}`;
  }, [action, from, page, to]);

  const selectAudit = useCallback((response: AuditResponse) => response, []);
  const auditRes = useResource<AuditResponse, AuditResponse>(
    endpoint,
    selectAudit,
  );
  const records = auditRes.data?.items ?? [];
  const meta = auditRes.data?.meta;

  return (
    <div className="module-v2">
      <PageHeader
        eyebrow="Administración"
        title="Auditoría"
        description="Consulta qué usuario accedió a cada módulo y qué operación realizó, con fecha y resultado."
        actions={
          <button
            className="button button--secondary"
            onClick={() => void auditRes.reload()}
          >
            <RefreshCcw size={17} />
            Actualizar
          </button>
        }
      />

      <section className="module-panel">
        <div className="module-panel__header module-panel__header--filters">
          <div>
            <span className="module-panel__eyebrow">
              <ShieldCheck size={15} /> Registro de actividad
            </span>
            <h2>{meta?.total ?? 0} acciones encontradas</h2>
          </div>
          <div className="module-toolbar-actions">
            <label>
              Desde
              <input
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              Acción
              <select
                value={action}
                onChange={(event) => {
                  setAction(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todas</option>
                {[
                  "LOGIN",
                  "LOGIN_FAILED",
                  "LOGOUT",
                  "READ",
                  "CREATE",
                  "UPDATE",
                  "DELETE",
                  "EXPORT",
                  "CANCEL",
                  "OTHER",
                ].map((value) => (
                  <option value={value} key={value}>
                    {translateChoiceLabel(value)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {from && to && from > to ? (
          <div className="alert alert--error">
            La fecha «Desde» no puede ser posterior a «Hasta».
          </div>
        ) : null}
        {auditRes.error ? (
          <div className="alert alert--error">{auditRes.error}</div>
        ) : null}
        {auditRes.loading ? <PageLoader /> : null}

        {!auditRes.loading && records.length > 0 ? (
          <>
            <ResponsiveTable
              rows={records}
              getKey={(item) => item.id}
              columns={[
                {
                  key: "date",
                  header: "Fecha y hora",
                  render: (item) => formatDate(item.createdAt),
                },
                {
                  key: "user",
                  header: "Usuario",
                  render: (item) =>
                    item.user
                      ? `${item.user.firstName} ${item.user.lastName} (@${item.user.username})`
                      : "Sin usuario identificado",
                },
                {
                  key: "action",
                  header: "Acción",
                  render: (item) => translateChoiceLabel(item.action),
                },
                {
                  key: "module",
                  header: "Módulo",
                  render: (item) => item.module,
                },
                {
                  key: "details",
                  header: "Detalle",
                  render: (item) => (
                    <div className="cell-stack">
                      <span>{item.description}</span>
                      <small>
                        Resultado: {item.metadata?.statusCode ?? "—"}
                      </small>
                    </div>
                  ),
                },
              ]}
            />
            <div className="module-toolbar-actions">
              <button
                className="button button--secondary"
                disabled={!meta || page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Anterior
              </button>
              <span>
                Página {meta?.page ?? page} de {meta?.pages ?? 1}
              </span>
              <button
                className="button button--secondary"
                disabled={!meta || page >= meta.pages}
                onClick={() => setPage((current) => current + 1)}
              >
                Siguiente
              </button>
            </div>
          </>
        ) : null}

        {!auditRes.loading && !auditRes.error && records.length === 0 ? (
          <div className="module-empty">
            <span className="module-empty__icon">
              <ShieldCheck size={27} />
            </span>
            <strong>Sin actividad en este rango</strong>
            <p>Prueba con otras fechas o selecciona todas las acciones.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
};
