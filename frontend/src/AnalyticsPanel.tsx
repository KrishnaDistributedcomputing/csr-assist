import { BarChart3 } from "lucide-react";
import type { UsageDashboard } from "./types";

export default function AnalyticsPanel({ usage }: { usage: UsageDashboard }) {
  return (
    <section className="usage-dashboard" aria-label="Token usage dashboard">
      <div className="usage-heading">
        <div>
          <p className="eyebrow">Local performance</p>
          <h2><BarChart3 size={19} /> Token usage dashboard</h2>
        </div>
        <span>Corpus revision {usage.corpus_revision}</span>
      </div>
      <div className="usage-cards">
        <div><span>Requests</span><strong>{usage.totals.requests}</strong></div>
        <div><span>Actual tokens</span><strong>{usage.totals.total_tokens.toLocaleString()}</strong></div>
        <div><span>Average latency</span><strong>{usage.totals.avg_latency_ms.toLocaleString()} ms</strong></div>
        <div><span>Cache hit rate</span><strong>{usage.totals.cache_hit_rate}%</strong></div>
        <div><span>Cached answers</span><strong>{usage.cached_answers}</strong></div>
        <div><span>Extracted facts</span><strong>{usage.key_facts.toLocaleString()}</strong></div>
        <div><span>Good responses</span><strong>{usage.feedback.good}</strong></div>
        <div><span>Bad responses</span><strong>{usage.feedback.bad}</strong></div>
      </div>
      {usage.by_model.length > 0 && (
        <div className="usage-models">
          {usage.by_model.map((row) => (
            <div key={`${row.model}-${row.mode}`}>
              <strong>{row.model}</strong>
              <span>{row.mode} · {row.requests} requests</span>
              <span>{(row.prompt_tokens + row.output_tokens).toLocaleString()} tokens</span>
              <span>{row.avg_latency_ms.toLocaleString()} ms avg</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
