import {
  Bot,
  Database,
  FileInput,
  LockKeyhole,
  Search,
  Server,
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

export default function ArchitecturePanel() {
  return (
    <section className="architecture-panel" aria-label="System architecture">
      <div className="architecture-hero">
        <div>
          <p className="eyebrow">System architecture</p>
          <h2>Hybrid document intelligence</h2>
          <p>
            Offline mode keeps retrieval and optional generation local. Online
            mode explicitly uses Azure AI Search and Azure AI Foundry for
            selected public or approved content.
          </p>
        </div>
        <div className="architecture-lock">
          <LockKeyhole size={22} />
          <strong>Choice by design</strong>
          <span>Users select the local or Azure processing boundary</span>
        </div>
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

      <div className="architecture-details">
        <article>
          <h3>Online answer path</h3>
          <ol>
            <li>Search the managed Azure AI Search index.</li>
            <li>Send bounded retrieved excerpts to the Foundry model.</li>
            <li>Require source citations and reject uncited output.</li>
            <li>Use the exact refusal when indexed evidence is insufficient.</li>
          </ol>
        </article>
        <article>
          <h3>Fast answer path</h3>
          <ol>
            <li>Check the revision-aware answer cache.</li>
            <li>Search extracted facts before full document chunks.</li>
            <li>Apply source feedback weights and rank matches.</li>
            <li>Return a cited answer without model tokens.</li>
          </ol>
        </article>
        <article>
          <h3>Learning boundary</h3>
          <p>
            Good and bad ratings adjust local source ranking. Bad ratings also
            invalidate matching cached answers. Feedback never retrains models
            automatically or leaves the workstation.
          </p>
        </article>
        <article>
          <h3>Persistent storage</h3>
          <dl>
            <div><dt>Documents</dt><dd>/data/documents</dd></div>
            <div><dt>Index</dt><dd>/data/index</dd></div>
            <div><dt>Settings</dt><dd>/data/config</dd></div>
            <div><dt>Models</dt><dd>/data/models</dd></div>
          </dl>
        </article>
      </div>
    </section>
  );
}
