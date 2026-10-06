import {
  Accessibility,
  BadgeCheck,
  Cloud,
  Database,
  ExternalLink,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

type SourceMode = "offline" | "online";

interface CompliancePanelProps {
  source: SourceMode;
  readOnlyDemo: boolean;
}

const controlsBySource = {
  offline: [
    {
      icon: Database,
      title: "Local parsing and index",
      status: "Implemented",
      detail:
        "Customer files are parsed into chunks and key facts stored in the local SQLite index under the operator-managed data directories.",
    },
    {
      icon: LockKeyhole,
      title: "Local answers and cache",
      status: "Implemented",
      detail:
        "Search, cached answers, usage records, history, and optional Ollama generation remain inside the local application environment.",
    },
    {
      icon: Cloud,
      title: "No Azure AI transfer",
      status: "Boundary",
      detail:
        "Offline questions and document excerpts are not sent to Azure AI Search or Azure AI Foundry by this application.",
    },
    {
      icon: BadgeCheck,
      title: "Local feedback learning",
      status: "Implemented",
      detail:
        "Good and bad ratings adjust local ranking and cache behavior. Feedback does not automatically train an external model.",
    },
    {
      icon: ShieldCheck,
      title: "Customer data custody",
      status: "Customer control",
      detail:
        "The customer controls host access, disk encryption, backups, retention, deletion, malware scanning, and approved document classifications.",
    },
  ],
  online: [
    {
      icon: Database,
      title: "Approved Azure search index",
      status: "Customer control",
      detail:
        "Only administrator-approved document chunks should be placed in Azure AI Search. Indexed content persists until the customer removes it.",
    },
    {
      icon: Cloud,
      title: "Query and excerpt transfer",
      status: "Boundary",
      detail:
        "The question is sent to Azure AI Search. Bounded retrieved excerpts and the question are sent to Azure AI Foundry for grounded generation.",
    },
    {
      icon: LockKeyhole,
      title: "Managed identity and RBAC",
      status: "Implemented",
      detail:
        "The deployed application uses managed identity and least-privilege Azure roles instead of storing Azure AI API keys.",
    },
    {
      icon: ShieldCheck,
      title: "Offline data isolation",
      status: "Implemented",
      detail:
        "Offline customer documents are not searched, uploaded, copied, or synchronized into the Online index when the mode changes.",
    },
    {
      icon: BadgeCheck,
      title: "Grounded model input",
      status: "Implemented",
      detail:
        "Foundry receives bounded evidence rather than the full local corpus. Answers require citations or use a cited extractive fallback.",
    },
  ],
} satisfies Record<SourceMode, Array<{
  icon: typeof Database;
  title: string;
  status: string;
  detail: string;
}>>;

const flowRowsBySource = {
  offline: [
    ["Customer documents", "Local parser and application process", "Mounted customer storage"],
    ["Extracted chunks and facts", "Local SQLite FTS index", "Local index database"],
    ["Questions and answers", "Local retrieval and optional Ollama", "Local cache and history"],
    ["Feedback and usage", "Local ranking and analytics", "Local index database"],
  ],
  online: [
    ["Approved document chunks", "Azure AI Search", "Azure Search index until customer deletion"],
    ["Search question", "Azure AI Search query endpoint", "Subject to approved Azure service configuration"],
    ["Question and bounded excerpts", "Azure AI Foundry inference", "Verify tenant, region, logging, and service retention settings"],
    ["Answer metadata", "CSR Assist runtime", "No user history in the public demo; production policy required"],
  ],
} satisfies Record<SourceMode, string[][]>;

const ownerDecisionsBySource = {
  offline: [
    "Define allowed local document classifications and prohibit unapproved secrets, payment data, health data, or other regulated content.",
    "Configure host identity, file permissions, disk encryption, backups, retention, secure deletion, and recovery testing.",
    "Control local history, answer-cache, feedback, and usage retention and provide customer-data export or deletion procedures.",
    "Document endpoint security, patching, audit collection, incident response, and legal-hold responsibilities.",
  ],
  online: [
    "Approve which customer document chunks may be indexed; Offline content is never approved for Online use by default.",
    "Confirm Azure region, data residency, service retention, diagnostic logging, private networking, and encryption requirements.",
    "Review managed-identity roles, index administrators, audit logs, deletion workflows, legal holds, and incident procedures.",
    "Map the deployment to applicable privacy, contractual, sector, and customer-data obligations before production use.",
  ],
} satisfies Record<SourceMode, string[]>;

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

export default function CompliancePanel({
  source,
  readOnlyDemo,
}: CompliancePanelProps) {
  const online = source === "online";
  const dataControls = [
    ...controlsBySource[source],
    {
      icon: online ? Accessibility : ShieldCheck,
      title: readOnlyDemo ? "Public demo safeguards" : "Production approval",
      status: readOnlyDemo ? "Implemented" : "Verify",
      detail: readOnlyDemo
        ? "Only public samples are available. Uploads, feedback, settings changes, and user-history persistence are disabled."
        : "A designated customer owner must approve classification, residency, retention, access, deletion, and incident controls.",
    },
  ];
  const flowRows = flowRowsBySource[source];
  const ownerDecisions = ownerDecisionsBySource[source];

  return (
    <section
      className={`compliance-panel ${source}`}
      aria-label="Data and accessibility compliance"
    >
      <div className="compliance-hero">
        <div>
          <p className="eyebrow">
            {online ? "Online customer data compliance" : "Offline customer data compliance"}
          </p>
          <h2>
            {online ? "Azure processing boundary" : "Local processing boundary"}
          </h2>
          <p>
            {online
              ? "This mode uses only approved Azure-indexed content and sends bounded evidence to Azure AI services."
              : "This mode keeps indexed documents, retrieval, history, cache, and optional inference in the local environment."}
            {" "}This page documents controls, not a certification or legal opinion.
          </p>
        </div>
        <div className="compliance-status">
          {online ? <Cloud size={22} /> : <Database size={22} />}
          <strong>{online ? "Online · Azure AI" : "Offline · Local data"}</strong>
          <span>
            {online
              ? "Offline documents remain isolated and unavailable"
              : "No Azure AI request is made in this mode"}
          </span>
        </div>
      </div>

      <div className={`mode-boundary-callout ${source}`} role="note">
        <LockKeyhole size={20} />
        <div>
          <strong>
            {online ? "Customer-data boundary: Online" : "Customer-data boundary: Offline"}
          </strong>
          <p>
            {online
              ? "Changing to Online does not upload or synchronize local files. Only content separately approved and indexed in Azure is available."
              : "Changing to Offline prevents Azure-indexed sources from being searched. Customer documents remain under local operator custody."}
          </p>
        </div>
      </div>

      <div className="compliance-section">
        <div className="section-heading">
          <div>
            <h3>{online ? "Online data features" : "Offline data features"}</h3>
            <p>Controls and customer responsibilities for the selected mode.</p>
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
                      control.status === "Implemented"
                        ? "implemented"
                        : control.status === "Boundary"
                          ? "boundary"
                          : control.status === "Customer control"
                            ? "customer"
                            : "verify"
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
          <h3>{online ? "Online data flow and persistence" : "Offline data flow and persistence"}</h3>
          <div className="compliance-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th scope="col">Data item</th>
                  <th scope="col">Processing boundary</th>
                  <th scope="col">Persistence</th>
                </tr>
              </thead>
              <tbody>
                {flowRows.map(([item, boundary, persistence]) => (
                  <tr key={item}>
                    <th scope="row">{item}</th>
                    <td>{boundary}</td>
                    <td>{persistence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
        <article>
          <h3>Customer compliance responsibilities</h3>
          <ul>
            {ownerDecisions.map((decision) => <li key={decision}>{decision}</li>)}
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
