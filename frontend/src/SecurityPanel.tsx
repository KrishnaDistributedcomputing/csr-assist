import {
  Activity,
  AlertTriangle,
  BarChart3,
  BellRing,
  CheckCircle2,
  Clock3,
  Eye,
  FileSearch,
  Fingerprint,
  RefreshCw,
  Radio,
  Server,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { SecurityOverview } from "./types";

function formatTimestamp(value: string) {
  if (!value) {
    return "Not reported";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function SecurityPanel() {
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setPending(true);
    setError("");
    try {
      setOverview(await api.securityOverview());
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Microsoft Sentinel status is unavailable."
      );
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (pending && !overview) {
    return (
      <section className="security-panel-loading" role="status">
        <RefreshCw className="spin" size={22} />
        <div>
          <strong>Connecting to Microsoft Sentinel</strong>
          <span>Loading incidents, detections, and privacy-safe telemetry.</span>
        </div>
      </section>
    );
  }

  if (!overview) {
    return (
      <section className="security-panel-error" role="alert">
        <AlertTriangle size={24} />
        <div><strong>Security posture unavailable</strong><span>{error}</span></div>
        <button onClick={() => void refresh()}>Retry</button>
      </section>
    );
  }

  if (!overview.configured) {
    return (
      <section
        className="security-panel security-not-configured"
        aria-label="Microsoft Sentinel security operations"
      >
        <ShieldAlert size={34} />
        <div>
          <p className="eyebrow">Security operations</p>
          <h2>Microsoft Sentinel is not configured here</h2>
          <p>
            Local deployments remain isolated and do not send telemetry to
            Azure. Deploy the Sentinel integration to view incidents,
            detections, and operational security signals.
          </p>
        </div>
      </section>
    );
  }

  const stateLabel = overview.state === "healthy"
    ? "Connected and healthy"
    : "Connected with partial data";
  const summaryCards = [
    ["Open incidents", overview.summary.open_incidents, BellRing],
    ["High severity", overview.summary.high_severity_incidents, ShieldAlert],
    ["Active detections", overview.summary.active_analytic_rules, Eye],
    [`Events · ${overview.lookback_hours}h`, overview.summary.telemetry_events, Activity],
  ] as const;
  const recentTrend = overview.telemetry_trend.slice(-12);
  const maximumTrendEvents = Math.max(
    ...recentTrend.map((point) => point.events),
    1
  );
  const maximumSignalCount = Math.max(
    ...overview.top_signals.map((signal) => signal.count),
    1
  );

  return (
    <section
      className="security-panel"
      aria-label="Microsoft Sentinel security operations"
    >
      <div className={`security-hero ${overview.state}`}>
        <div>
          <p className="eyebrow">Microsoft Sentinel</p>
          <h2>Security operations center</h2>
          <p>
            Monitor CSR Assist service health, abuse signals, identity
            failures, detections, and incidents without collecting prompts or
            document content.
          </p>
        </div>
        <div className="security-connection">
          {overview.state === "healthy"
            ? <ShieldCheck size={24} />
            : <AlertTriangle size={24} />}
          <strong>{stateLabel}</strong>
          <span>{overview.workspace.name}</span>
          <small>{overview.workspace.region}</small>
          <button onClick={() => void refresh()} disabled={pending}>
            <RefreshCw className={pending ? "spin" : ""} size={14} />
            Refresh
          </button>
        </div>
      </div>

      {overview.errors.length > 0 && (
        <div className="security-errors" role="alert">
          <AlertTriangle size={18} />
          <div>
            <strong>Some security sources are unavailable</strong>
            {overview.errors.map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
      )}

      <div className="security-summary">
        {summaryCards.map(([label, value, Icon]) => (
          <article key={label}>
            <Icon size={19} />
            <strong>{value.toLocaleString()}</strong>
            <span>{label}</span>
          </article>
        ))}
      </div>

      <div className="security-metrics-grid">
        <section className="security-card">
          <div className="section-heading">
            <div><p className="eyebrow">Ingestion</p><h3>Telemetry coverage</h3></div>
            <Radio size={20} />
          </div>
          <dl className="security-metric-list">
            <div><dt>Last event</dt><dd>{formatTimestamp(overview.telemetry.last_event_at)}</dd></div>
            <div><dt>Console events</dt><dd>{overview.telemetry.console_events.toLocaleString()}</dd></div>
            <div><dt>System events</dt><dd>{overview.telemetry.system_events.toLocaleString()}</dd></div>
            <div><dt>Error rate</dt><dd>{overview.telemetry.error_rate_percent.toFixed(2)}%</dd></div>
          </dl>
        </section>
        <section className="security-card">
          <div className="section-heading">
            <div><p className="eyebrow">Runtime</p><h3>Platform activity</h3></div>
            <Server size={20} />
          </div>
          <dl className="security-metric-list">
            <div><dt>Observed revisions</dt><dd>{overview.telemetry.unique_revisions}</dd></div>
            <div><dt>Observed replicas</dt><dd>{overview.telemetry.unique_replicas}</dd></div>
            <div><dt>Failed scale events</dt><dd>{overview.telemetry.failed_scale_events}</dd></div>
            <div><dt>Lookback window</dt><dd>{overview.lookback_hours} hours</dd></div>
          </dl>
        </section>
        <section className="security-card">
          <div className="section-heading">
            <div><p className="eyebrow">Incidents</p><h3>Queue distribution</h3></div>
            <BellRing size={20} />
          </div>
          <dl className="security-metric-list">
            <div><dt>Total returned</dt><dd>{overview.incident_metrics.total}</dd></div>
            <div><dt>Unassigned</dt><dd>{overview.incident_metrics.unassigned}</dd></div>
            {Object.entries(overview.incident_metrics.by_status).map(([status, count]) => (
              <div key={status}><dt>{status}</dt><dd>{count}</dd></div>
            ))}
          </dl>
        </section>
        <section className="security-card">
          <div className="section-heading">
            <div><p className="eyebrow">Detections</p><h3>Coverage posture</h3></div>
            <Eye size={20} />
          </div>
          <dl className="security-metric-list">
            <div><dt>Total rules</dt><dd>{overview.detection_metrics.total}</dd></div>
            <div><dt>Enabled</dt><dd>{overview.detection_metrics.enabled}</dd></div>
            <div><dt>Disabled</dt><dd>{overview.detection_metrics.disabled}</dd></div>
            <div><dt>ATT&amp;CK tactics</dt><dd>{overview.detection_metrics.tactics.length}</dd></div>
          </dl>
        </section>
      </div>

      <div className="security-grid">
        <section className="security-card">
          <div className="section-heading">
            <div><p className="eyebrow">Live posture</p><h3>Telemetry signals</h3></div>
            <Activity size={20} />
          </div>

          <div className="security-grid">
            <section className="security-card">
              <div className="section-heading">
                <div><p className="eyebrow">Hourly trend</p><h3>Events and errors</h3></div>
                <BarChart3 size={20} />
              </div>
              <div className="security-trend" aria-label="Hourly security telemetry trend">
                {recentTrend.map((point) => (
                  <div className="security-trend-point" key={point.time}>
                    <div className="security-trend-bars">
                      <span
                        className="events"
                        style={{ height: `${Math.max(point.events / maximumTrendEvents * 100, 3)}%` }}
                        title={`${point.events} events`}
                      />
                      <span
                        className="errors"
                        style={{ height: `${Math.max(point.errors / maximumTrendEvents * 100, point.errors ? 3 : 0)}%` }}
                        title={`${point.errors} errors`}
                      />
                    </div>
                    <small>{new Date(point.time).toLocaleTimeString([], { hour: "numeric" })}</small>
                  </div>
                ))}
                {recentTrend.length === 0 && <span>No hourly telemetry returned.</span>}
              </div>
              <div className="security-legend"><span><i className="events" />Events</span><span><i className="errors" />Errors</span></div>
            </section>
            <section className="security-card">
              <div className="section-heading">
                <div><p className="eyebrow">Platform signals</p><h3>Most frequent event reasons</h3></div>
                <Activity size={20} />
              </div>
              <div className="security-signal-list">
                {overview.top_signals.map((signal) => (
                  <div key={signal.signal}>
                    <span><strong>{signal.signal}</strong><small>{signal.count.toLocaleString()}</small></span>
                    <i><b style={{ width: `${signal.count / maximumSignalCount * 100}%` }} /></i>
                  </div>
                ))}
                {overview.top_signals.length === 0 && <span>No platform signals returned.</span>}
              </div>
            </section>
          </div>
          <dl className="security-telemetry">
            <div><dt>Server errors</dt><dd>{overview.telemetry.errors}</dd></div>
            <div><dt>Warnings</dt><dd>{overview.telemetry.warnings}</dd></div>
            <div><dt>Rate-limit events</dt><dd>{overview.telemetry.rate_limits}</dd></div>
            <div><dt>Identity failures</dt><dd>{overview.telemetry.identity_failures}</dd></div>
          </dl>
          <p className="security-privacy">
            <Fingerprint size={16} />
            Client addresses are hashed. Questions, answers, citations, and
            document text are excluded from security events.
          </p>
        </section>

        <section className="security-card">
          <div className="section-heading">
            <div><p className="eyebrow">Response</p><h3>Operator workflow</h3></div>
            <Clock3 size={20} />
          </div>
          <ol className="security-workflow">
            <li>Validate incident scope, affected revision, and detection evidence.</li>
            <li>Contain abuse or failure without exposing customer content.</li>
            <li>Preserve logs and request correlation before changing traffic.</li>
            <li>Recover to a known-good revision and verify security probes.</li>
          </ol>
        </section>
      </div>

      <section className="security-card">
        <div className="section-heading">
          <div><p className="eyebrow">Investigation queue</p><h3>Recent incidents</h3></div>
          <BellRing size={20} />
        </div>
        {overview.incidents.length === 0 ? (
          <div className="security-empty">
            <CheckCircle2 size={24} />
            <strong>No Sentinel incidents in the current result</strong>
            <span>Continue monitoring detections and telemetry during hypercare.</span>
          </div>
        ) : (
          <div className="security-table-wrapper">
            <table>
              <thead><tr><th>Incident</th><th>Severity</th><th>Status</th><th>Owner</th><th>Updated</th></tr></thead>
              <tbody>
                {overview.incidents.map((incident) => (
                  <tr key={incident.id}>
                    <th>{incident.title}</th>
                    <td><span className={`security-severity ${incident.severity.toLowerCase()}`}>{incident.severity}</span></td>
                    <td>{incident.status}</td>
                    <td>{incident.owner}</td>
                    <td>{formatTimestamp(incident.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="security-card">
        <div className="section-heading">
          <div><p className="eyebrow">Detection engineering</p><h3>Analytic rule coverage</h3></div>
          <FileSearch size={20} />
        </div>
        <div className="security-rules">
          {overview.analytic_rules.map((rule) => (
            <article key={rule.id}>
              <span className={`security-rule-state ${rule.enabled ? "enabled" : "disabled"}`}>
                {rule.enabled ? "Enabled" : "Disabled"}
              </span>
              <strong>{rule.name}</strong>
              <small>{rule.severity} · {rule.query_frequency || "Frequency not reported"}</small>
              <p>{rule.tactics.length ? rule.tactics.join(", ") : "Operational monitoring"}</p>
            </article>
          ))}
          {overview.analytic_rules.length === 0 && (
            <div className="security-empty">
              <AlertTriangle size={24} />
              <strong>No analytic rules returned</strong>
              <span>Verify Sentinel Reader access and rule deployment.</span>
            </div>
          )}
        </div>
      </section>

      <p className="security-refreshed">
        Last refreshed {formatTimestamp(overview.refreshed_at)}
      </p>
    </section>
  );
}
