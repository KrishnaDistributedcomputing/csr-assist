import {
  Activity,
  Bot,
  Cloud,
  Container,
  Cpu,
  Database,
  FileInput,
  LockKeyhole,
  Network,
  RotateCcw,
  Search,
  Server,
  ShieldCheck,
} from "lucide-react";

const layers = [
  {
    icon: FileInput,
    title: "Managed documents",
    detail: "PDF, DOCX, TXT, Markdown, CSV, JSON, XML, and images",
    path: "/data/documents",
  },
  {
    icon: Server,
    title: "Processing pipeline",
    detail: "Safe parsers, OCR, chunking, key-fact extraction, and hashing",
    path: "FastAPI background scan",
  },
  {
    icon: Database,
    title: "Knowledge indexes",
    detail: "Offline SQLite FTS5 plus an optional managed Azure AI Search index",
    path: "Offline: /data/index · Online: Azure AI Search",
  },
  {
    icon: Search,
    title: "Retrieval and cache",
    detail: "Choose local cache and FTS or managed Azure AI Search retrieval",
    path: "Explicit Offline and Online modes",
  },
  {
    icon: Bot,
    title: "Mira response",
    detail: "Cited extraction, optional Ollama, or grounded Azure AI Foundry",
    path: "The selected mode controls the processing boundary",
  },
];

const technicalLayers = [
  {
    concern: "User interface",
    docker: "React SPA served by the local FastAPI container",
    azure: "React SPA served by Azure Container Apps",
  },
  {
    concern: "Retrieval",
    docker: "SQLite FTS5 key facts and chunks; optional local vectors",
    azure: "Azure AI Search over separately approved indexed content",
  },
  {
    concern: "Generation",
    docker: "Per-request approved Ollama model installed in /data/models",
    azure: "Per-request approved Azure AI Foundry deployment",
  },
  {
    concern: "Identity",
    docker: "Host and container access controls",
    azure: "User-assigned managed identity with Search and Foundry RBAC",
  },
  {
    concern: "Persistence",
    docker: "Documents, SQLite state, configuration, and model volumes",
    azure: "Azure Search index plus ephemeral public-demo application storage",
  },
  {
    concern: "Data boundary",
    docker: "No Azure transfer; processing remains inside the customer host",
    azure: "Only the question and bounded approved excerpts reach Foundry",
  },
];

const configuration = [
  ["CSR_DOCUMENTS_DIR", "Managed source-document root", "/data/documents"],
  ["CSR_INDEX_DIR", "SQLite indexes, cache, history, and usage", "/data/index"],
  ["CSR_MODELS_DIR", "Ollama manifests and model blobs", "/data/models"],
  ["CSR_AZURE_AI_SEARCH_ENDPOINT", "Approved Azure AI Search service", "Required online"],
  ["CSR_AZURE_AI_SEARCH_INDEX", "Search index containing approved chunks", "csr-assist-documents"],
  ["CSR_AZURE_AI_FOUNDRY_ENDPOINT", "Foundry inference resource", "Required online"],
  ["CSR_AZURE_AI_FOUNDRY_DEPLOYMENT", "Default allowlisted deployment", "phi-4-mini"],
  ["CSR_AZURE_AI_FOUNDRY_DEPLOYMENTS", "Additional comma-separated deployments", "Optional"],
];

export default function ArchitecturePanel() {
  return (
    <section className="architecture-panel" aria-label="System architecture">
      <div className="architecture-hero">
        <div>
          <p className="eyebrow">System architecture</p>
          <h2>Hybrid document intelligence</h2>
          <p>
            Docker on-premises keeps retrieval and optional generation local.
            Azure cloud uses managed retrieval and an explicitly selected,
            allowlisted Foundry deployment for approved content.
          </p>
        </div>
        <div className="architecture-lock">
          <LockKeyhole size={22} />
          <strong>Choice by design</strong>
          <span>Users select the local or Azure processing boundary</span>
        </div>
      </div>

      <div className="architecture-boundaries">
        <article>
          <div className="architecture-card-title">
            <Container size={21} />
            <div>
              <span>Docker on-premises</span>
              <h3>Customer-controlled local stack</h3>
            </div>
          </div>
          <p>
            FastAPI, SQLite, document processors, OCR, Ollama, and the React
            interface run in the Docker boundary. The selected Ollama model is
            validated against the administrator allowlist and must be installed
            before a generated request can run.
          </p>
          <code>Browser → FastAPI → SQLite retrieval → Ollama → cited answer</code>
        </article>
        <article>
          <div className="architecture-card-title">
            <Cloud size={21} />
            <div>
              <span>Azure cloud</span>
              <h3>Managed identity and approved sources</h3>
            </div>
          </div>
          <p>
            Container Apps queries Azure AI Search, builds a bounded grounded
            prompt, and invokes the selected Foundry deployment. Deployment
            identifiers are server-allowlisted; arbitrary client model names
            are rejected.
          </p>
          <code>Browser → Container App → AI Search → Foundry → cited answer</code>
        </article>
      </div>

      <div className="architecture-flow">
        {layers.map((layer, index) => {
          const Icon = layer.icon;
          return (
            <div className="architecture-step" key={layer.title}>
              <div className="architecture-number">{index + 1}</div>
              <div className="architecture-icon"><Icon size={21} /></div>
              <div>
                <strong>{layer.title}</strong>
                <p>{layer.detail}</p>
                <code>{layer.path}</code>
              </div>
            </div>
          );
        })}
      </div>

      <section className="architecture-technical-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Deployment topology</p>
            <h3>Docker and Azure technical boundaries</h3>
          </div>
          <Network size={22} />
        </div>
        <div className="architecture-table-wrap">
          <table className="architecture-table">
            <thead>
              <tr>
                <th scope="col">Concern</th>
                <th scope="col">Docker on-premises</th>
                <th scope="col">Azure cloud</th>
              </tr>
            </thead>
            <tbody>
              {technicalLayers.map((layer) => (
                <tr key={layer.concern}>
                  <th scope="row">{layer.concern}</th>
                  <td>{layer.docker}</td>
                  <td>{layer.azure}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="architecture-details">
        <article>
          <Cpu size={20} />
          <h3>Per-request model routing</h3>
          <ol>
            <li>The interface lists models reported by the active environment.</li>
            <li>The selected model identifier is sent with the chat request.</li>
            <li>The API rejects identifiers outside the environment allowlist.</li>
            <li>Docker verifies installation; Azure selects the approved deployment.</li>
            <li>The model identifier namespaces cache and usage records.</li>
          </ol>
        </article>
        <article>
          <Cloud size={20} />
          <h3>Online answer path</h3>
          <ol>
            <li>Search the managed Azure AI Search index.</li>
            <li>Send bounded retrieved excerpts to the Foundry model.</li>
            <li>Require source citations and reject uncited output.</li>
            <li>Use the exact refusal when indexed evidence is insufficient.</li>
          </ol>
        </article>
        <article>
          <Search size={20} />
          <h3>Fast answer path</h3>
          <ol>
            <li>Check the revision-aware answer cache.</li>
            <li>Search extracted facts before full document chunks.</li>
            <li>Apply source feedback weights and rank matches.</li>
            <li>Return a cited answer without model tokens.</li>
          </ol>
        </article>
        <article>
          <Activity size={20} />
          <h3>Learning boundary</h3>
          <p>
            Good and bad ratings adjust local source ranking. Bad ratings also
            invalidate matching cached answers. Feedback never retrains models
            automatically or leaves the workstation.
          </p>
        </article>
        <article>
          <Database size={20} />
          <h3>Persistent storage</h3>
          <dl>
            <div><dt>Documents</dt><dd>/data/documents</dd></div>
            <div><dt>Index</dt><dd>/data/index</dd></div>
            <div><dt>Settings</dt><dd>/data/config</dd></div>
            <div><dt>Models</dt><dd>/data/models</dd></div>
          </dl>
        </article>
        <article>
          <ShieldCheck size={20} />
          <h3>Grounding and validation</h3>
          <p>
            Retrieval precedes generation. Unsupported questions return the
            exact insufficient-evidence response. Generated factual output must
            cite retrieved chunks; uncited output is rejected or replaced with
            a transparent extractive fallback when evidence is strong.
          </p>
        </article>
      </div>

      <section className="architecture-technical-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Runtime configuration</p>
            <h3>Key environment and storage settings</h3>
          </div>
          <Server size={22} />
        </div>
        <div className="architecture-table-wrap">
          <table className="architecture-table configuration-table">
            <thead>
              <tr>
                <th scope="col">Setting</th>
                <th scope="col">Purpose</th>
                <th scope="col">Default or requirement</th>
              </tr>
            </thead>
            <tbody>
              {configuration.map(([setting, purpose, value]) => (
                <tr key={setting}>
                  <th scope="row"><code>{setting}</code></th>
                  <td>{purpose}</td>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="architecture-technical-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Resilience</p>
            <h3>Failure handling and operational signals</h3>
          </div>
          <RotateCcw size={22} />
        </div>
        <div className="architecture-resilience">
          <article>
            <strong>Model unavailable</strong>
            <p>
              Docker reports setup required when a model is not installed.
              Azure rejects unconfigured deployments instead of silently using
              an arbitrary model.
            </p>
          </article>
          <article>
            <strong>Foundry timeout or quota</strong>
            <p>
              After the bounded generation attempt, strongly supported Azure
              results can become a cited extractive answer with a visible
              fallback notice.
            </p>
          </article>
          <article>
            <strong>Insufficient evidence</strong>
            <p>
              Mira returns the standard scope refusal and does not use model
              knowledge, previous unrelated evidence, or external sources.
            </p>
          </article>
          <article>
            <strong>Observability</strong>
            <p>
              Usage records capture mode, model, latency, token counts, and
              cache hits. Health endpoints expose indexing, Ollama, and vector
              availability without leaking document content.
            </p>
          </article>
        </div>
      </section>
    </section>
  );
}
