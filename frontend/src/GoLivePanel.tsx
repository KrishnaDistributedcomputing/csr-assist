import {
  Activity,
  AlarmClock,
  BellRing,
  CheckCircle2,
  CircleDollarSign,
  Cloud,
  Database,
  FileCheck2,
  LifeBuoy,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { DeploymentInfo } from "./types";

interface GoLivePanelProps {
  deployment: DeploymentInfo;
}

const schedule = [
  {
    time: "07:30–08:00",
    title: "Open the command center",
    owner: "Release lead",
    tasks: [
      "Confirm on-call attendance, escalation contacts, and decision authority.",
      "Freeze nonessential configuration, index, model, and image changes.",
      "Record the active revision, image digest, Search index, and Foundry deployment.",
    ],
    evidence: "Attendance recorded; change freeze announced; baseline captured.",
  },
  {
    time: "08:00–09:00",
    title: "Prove platform and data health",
    owner: "Platform + data leads",
    tasks: [
      "Check Container App readiness, traffic, replica restarts, CPU, memory, and ingress errors.",
      "Verify approved Azure documents, selected-document filters, index freshness, and citation links.",
      "Confirm managed identity can query Search and invoke the allowlisted Foundry deployment.",
    ],
    evidence: "Health checks green; known-answer probes return only approved citations.",
  },
  {
    time: "09:00–10:30",
    title: "Controlled user ramp",
    owner: "Business lead",
    tasks: [
      "Admit the pilot group and provide the source-boundary and citation-review reminder.",
      "Run return-policy, support, missing-information, and conflicting-instruction scenarios.",
      "Capture response time, cache status, answer state, citation quality, and user feedback.",
    ],
    evidence: "Pilot scenarios pass; no unsupported claims; support channel is staffed.",
  },
  {
    time: "10:30–12:00",
    title: "Expand and observe",
    owner: "Release lead",
    tasks: [
      "Increase access only after the pilot gate is accepted.",
      "Watch p95 response time, 5xx/429 rates, cache hit rate, Foundry usage, and Search latency.",
      "Review low-rated answers and invalidate any answer cache entry tied to bad feedback.",
    ],
    evidence: "Error and latency thresholds remain green for 60 continuous minutes.",
  },
  {
    time: "12:00–13:00",
    title: "Midday checkpoint",
    owner: "All leads",
    tasks: [
      "Publish a concise health summary, incidents, mitigations, usage, and cost position.",
      "Reconcile indexed-document counts and confirm no unapproved source entered the corpus.",
      "Decide continue, hold, reduce traffic, or rollback using the gates below.",
    ],
    evidence: "Checkpoint decision and accountable approver recorded.",
  },
  {
    time: "13:00–16:00",
    title: "Sustain hypercare",
    owner: "Operations + support",
    tasks: [
      "Repeat known-answer probes after any scale event, document update, or configuration change.",
      "Triage user questions separately from platform incidents and content defects.",
      "Track unresolved actions with owner, severity, target time, and customer impact.",
    ],
    evidence: "No unresolved critical issue; action log is current.",
  },
  {
    time: "16:00–17:00",
    title: "Close Day 2 and hand off",
    owner: "Release lead",
    tasks: [
      "Confirm the active revision and traffic allocation, then archive metrics and incident notes.",
      "Assign overnight ownership and next-business-day follow-ups.",
      "Approve hypercare exit only when every exit criterion is met.",
    ],
    evidence: "Signed handoff, next checkpoint, and open-action owners published.",
  },
];

const roles = [
  ["Release lead", "Owns go/hold/rollback calls, timeline, and stakeholder updates."],
  ["Platform lead", "Owns Container Apps, revisions, scaling, logs, identity, and rollback."],
  ["Data/Search lead", "Owns approved documents, index freshness, filters, and citations."],
  ["AI lead", "Owns model routing, grounding behavior, latency, token use, and fallbacks."],
  ["Business lead", "Owns pilot acceptance, answer quality, and operational impact."],
  ["Support lead", "Owns intake, severity, communications, and user workarounds."],
];

const gates = [
  {
    level: "Green",
    detail: "Health endpoint succeeds; 5xx < 1%; no citation boundary breach; p95 meets the agreed target.",
  },
  {
    level: "Amber",
    detail: "Transient 429/5xx increase, elevated latency, isolated content defect, or cache hit rate below target.",
  },
  {
    level: "Red",
    detail: "Unavailable service, wrong-document grounding, unsupported factual claim, identity failure, or sustained error spike.",
  },
];

export default function GoLivePanel({ deployment }: GoLivePanelProps) {
  const region = deployment.azure_region || "Azure region not reported";
  const serviceCount = deployment.azure_services.length;

  return (
    <section className="go-live-panel" aria-label="Day 2 go-live plan">
      <div className="go-live-hero">
        <div>
          <p className="eyebrow">Operations runbook</p>
          <h2>Day 2 go-live command center</h2>
          <p>
            Stabilize production, expand access deliberately, and finish the day
            with an evidence-backed handoff. Every gate below requires an owner
            and recorded proof.
          </p>
        </div>
        <div className="go-live-status">
          <Cloud size={22} />
          <span>Azure production boundary</span>
          <strong>{region}</strong>
          <small>{serviceCount} configured Azure services</small>
        </div>
      </div>

      <div className="go-live-principles">
        <article><ShieldCheck /><strong>Grounding first</strong><span>No answer quality shortcut overrides source boundaries.</span></article>
        <article><Activity /><strong>Measure before expanding</strong><span>Traffic grows only after health and quality gates pass.</span></article>
        <article><RotateCcw /><strong>Rollback stays ready</strong><span>Keep the prior healthy revision available throughout hypercare.</span></article>
      </div>

      <section className="go-live-section">
        <div className="section-heading">
          <div><p className="eyebrow">Hour-by-hour</p><h3>Day 2 operating schedule</h3></div>
          <AlarmClock size={22} />
        </div>
        <div className="go-live-timeline">
          {schedule.map((block, index) => (
            <article key={block.time}>
              <div className="go-live-time"><span>{index + 1}</span><strong>{block.time}</strong></div>
              <div>
                <span className="go-live-owner">{block.owner}</span>
                <h4>{block.title}</h4>
                <ul>{block.tasks.map((task) => <li key={task}>{task}</li>)}</ul>
                <p><FileCheck2 size={14} /><strong>Exit evidence:</strong> {block.evidence}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="go-live-two-column">
        <section className="go-live-section">
          <div className="section-heading"><div><p className="eyebrow">Accountability</p><h3>Command-center roles</h3></div><Users size={22} /></div>
          <div className="go-live-role-list">
            {roles.map(([role, detail]) => <article key={role}><strong>{role}</strong><span>{detail}</span></article>)}
          </div>
        </section>
        <section className="go-live-section">
          <div className="section-heading"><div><p className="eyebrow">Decision framework</p><h3>Health gates</h3></div><CheckCircle2 size={22} /></div>
          <div className="go-live-gates">
            {gates.map((gate) => <article className={gate.level.toLowerCase()} key={gate.level}><strong>{gate.level}</strong><span>{gate.detail}</span></article>)}
          </div>
        </section>
      </div>

      <div className="go-live-playbooks">
        <article>
          <BellRing size={21} />
          <h3>Incident and communications</h3>
          <ul>
            <li><strong>Sev 1:</strong> data boundary, security, or broad outage—stop expansion, notify leadership, and decide rollback immediately.</li>
            <li><strong>Sev 2:</strong> degraded service or repeated wrong answers—hold traffic, isolate scope, and update every 30 minutes.</li>
            <li><strong>Sev 3:</strong> isolated UX or content issue—record workaround and resolve in the next planned change window.</li>
          </ul>
        </article>
        <article>
          <RotateCcw size={21} />
          <h3>Rollback triggers and sequence</h3>
          <ol>
            <li>Trigger on wrong-source grounding, sustained 5xx, identity failure, or unacceptable answer quality.</li>
            <li>Stop document/configuration changes and preserve logs, metrics, request IDs, and revision details.</li>
            <li>Shift traffic to the last healthy immutable revision; do not rebuild during the incident.</li>
            <li>Run health, known-answer, citation, and selected-document probes before reopening access.</li>
          </ol>
        </article>
        <article>
          <CircleDollarSign size={21} />
          <h3>Cost and capacity controls</h3>
          <ul>
            <li>Track Container Apps CPU/memory/request volume and Azure AI Search capacity.</li>
            <li>Review Foundry prompt/output tokens and unexpected model-routing changes.</li>
            <li>Use prebuilt FAQ answers and cache hit rate to reduce repeated inference.</li>
          </ul>
        </article>
        <article>
          <Database size={21} />
          <h3>Data and model checks</h3>
          <ul>
            <li>Reconcile approved document count, index timestamp, and selected grounding scope.</li>
            <li>Test supported, unsupported, conflicting, and missing-information questions.</li>
            <li>Verify citations resolve to the same documents used for generation.</li>
          </ul>
        </article>
      </div>

      <section className="go-live-exit">
        <LifeBuoy size={24} />
        <div>
          <p className="eyebrow">Hypercare exit</p>
          <h3>Day 2 is complete only when</h3>
          <ul>
            <li>No open Sev 1 or unresolved Sev 2 incident remains.</li>
            <li>Health and answer-quality gates stayed green for two continuous hours.</li>
            <li>Known-answer, unsupported-answer, citation, and document-filter probes pass.</li>
            <li>Costs remain within the approved envelope and no unexpected model is used.</li>
            <li>Operations accepts the runbook, dashboards, contacts, open actions, and next checkpoint.</li>
          </ul>
        </div>
      </section>
    </section>
  );
}
