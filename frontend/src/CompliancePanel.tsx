import {
  Accessibility,
  BadgeCheck,
  Cloud,
  Database,
  ExternalLink,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

const dataControls = [
  {
    icon: Database,
    title: "Offline processing",
    status: "Implemented",
    detail:
      "Document parsing, SQLite search, answer caching, feedback, and optional Ollama inference remain inside the deployed local environment.",
  },
  {
    icon: Cloud,
    title: "Explicit Online boundary",
    status: "Implemented",
    detail:
      "Users must select Online mode before queries and bounded source excerpts are sent to Azure AI Search and Azure AI Foundry.",
  },
  {
    icon: LockKeyhole,
    title: "Managed identity",
    status: "Implemented",
    detail:
      "The Azure deployment uses a user-assigned managed identity and role-based access instead of application API keys.",
  },
  {
    icon: ShieldCheck,
    title: "Public demo privacy",
    status: "Implemented",
    detail:
      "Uploads, feedback, settings changes, and history persistence are disabled. Only approved public sample content is available.",
  },
  {
    icon: BadgeCheck,
    title: "Evidence-only responses",
    status: "Implemented",
    detail:
      "Answers require indexed evidence and citations. Unsupported questions receive the defined refusal instead of speculation.",
  },
  {
    icon: Accessibility,
    title: "Production governance",
    status: "Verify",
    detail:
      "Data residency, retention, access reviews, incident response, and Azure service configuration require owner approval before production use.",
  },
];

const accessibilityChecks = [
  {
    title: "Programmatic identification",
    detail:
      "Semantic controls, accessible names, roles, selected states, labeled regions, and live status messages expose interface state to assistive technology.",
  },
  {
    title: "Keyboard and focus",
    detail:
      "Workspace tabs support Arrow, Home, and End keys. Interactive controls retain visible keyboard focus and native keyboard activation.",
  },
  {
    title: "Visual presentation",
    detail:
      "Responsive layouts, scalable text, light and dark themes, and non-colour status text support magnification and varied visual needs.",
  },
  {
    title: "Errors and progress",
    detail:
      "Errors use alert semantics, running operations use status semantics, and controls provide descriptive labels and disabled states.",
  },
];

const verificationSteps = [
  "Run automated WCAG 2.1 AA checks on every release.",
  "Complete keyboard-only testing at desktop and mobile breakpoints.",
  "Test with NVDA or JAWS on Windows and VoiceOver on supported Apple platforms.",
  "Verify contrast, 200% text resize, 400% zoom reflow, focus order, and error recovery.",
  "Assess applicable Clause 11 requirements using the standard's Annex C procedures.",
  "Record exceptions, remediation owners, evidence, and review dates before claiming conformance.",
];

export default function CompliancePanel() {
  return (
    <section
      className="compliance-panel"
      aria-label="Data and accessibility compliance"
    >
      <div className="compliance-hero">
        <div>
          <p className="eyebrow">Data and accessibility compliance</p>
          <h2>Controls, boundaries, and verification</h2>
          <p>
            This page documents implemented safeguards and required validation.
            It is not a certification or legal opinion.
          </p>
        </div>
        <div className="compliance-status">
          <ShieldCheck size={22} />
          <strong>Evidence-based status</strong>
          <span>Implemented controls are separated from items requiring review</span>
        </div>
      </div>

      <div className="compliance-section">
        <div className="section-heading">
          <div>
            <h3>Data-handling controls</h3>
            <p>Current application and public-demo safeguards.</p>
          </div>
        </div>
        <div className="compliance-grid">
          {dataControls.map((control) => {
            const Icon = control.icon;
            return (
              <article className="compliance-card" key={control.title}>
                <div className="compliance-card-heading">
                  <div className="compliance-icon"><Icon size={20} /></div>
                  <span
                    className={`compliance-badge ${
                      control.status === "Verify" ? "verify" : "implemented"
                    }`}
                  >
                    {control.status}
                  </span>
                </div>
                <h4>{control.title}</h4>
                <p>{control.detail}</p>
              </article>
            );
          })}
        </div>
      </div>

      <div className="compliance-details">
        <article>
          <h3>Processing and retention summary</h3>
          <div className="compliance-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th scope="col">Mode</th>
                  <th scope="col">Processing boundary</th>
                  <th scope="col">Persistence</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Offline</th>
                  <td>Local application, SQLite, and optional Ollama</td>
                  <td>Operator-managed mounted storage</td>
                </tr>
                <tr>
                  <th scope="row">Online</th>
                  <td>Azure AI Search and Azure AI Foundry</td>
                  <td>Depends on approved Azure tenant and service settings</td>
                </tr>
                <tr>
                  <th scope="row">Public demo</th>
                  <td>Approved public samples only</td>
                  <td>No user history; runtime storage is ephemeral</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
        <article>
          <h3>Production owner decisions</h3>
          <ul>
            <li>Classify allowed documents and prohibit secrets or regulated data unless approved.</li>
            <li>Confirm Azure region, residency, retention, logging, and network requirements.</li>
            <li>Review role assignments, access logs, backups, deletion, and incident procedures.</li>
            <li>Publish a privacy notice and retention schedule for the production deployment.</li>
          </ul>
        </article>
      </div>

      <div className="compliance-section">
        <div className="section-heading standard-heading">
          <div>
            <h3>CAN/ASC - EN 301 549:2024 Section 11 alignment</h3>
            <p>
              Section 11 addresses accessible software and interoperability
              with platform accessibility services and assistive technology.
            </p>
          </div>
          <a
            href="https://accessible.canada.ca/standards-and-technical-guides/standards-and-technical-guides-database/can-asc-en-301-5492024-accessibility-requirements-ict-products-and-services-en-301-5492021-idt/11-software"
            target="_blank"
            rel="noreferrer"
          >
            Official standard <ExternalLink size={15} />
          </a>
        </div>
        <div className="accessibility-grid">
          {accessibilityChecks.map((check) => (
            <article key={check.title}>
              <CheckMark />
              <div>
                <h4>{check.title}</h4>
                <p>{check.detail}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="compliance-note">
          <strong>Applicability note</strong>
          <p>
            Browser-delivered content also requires assessment against the
            applicable web requirements, including WCAG 2.1 criteria referenced
            by the standard. Full conformance requires evaluating applicable
            preconditions and passing the prescribed tests; these documented
            controls alone do not establish conformance.
          </p>
        </div>
      </div>

      <div className="verification-card">
        <div>
          <p className="eyebrow">Release gate</p>
          <h3>Required accessibility verification</h3>
        </div>
        <ol>
          {verificationSteps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </div>
    </section>
  );
}

function CheckMark() {
  return (
    <span className="check-mark" aria-hidden="true">
      <BadgeCheck size={19} />
    </span>
  );
}
