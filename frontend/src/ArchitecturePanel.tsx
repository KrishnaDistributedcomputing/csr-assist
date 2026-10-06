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
    title: "Local knowledge index",
    detail: "Metadata, FTS5 facts, chunks, vectors, cache, history, and feedback",
    path: "/data/index/csr-assist.db",
  },
  {
    icon: Search,
    title: "Retrieval and cache",
    detail: "Cache first, then key facts, full text, and optional vectors",
    path: "Revision-aware local retrieval",
  },
  {
    icon: Bot,
    title: "Mira response",
    detail: "Fast cited extraction by default, optional local model generation",
    path: "No cloud inference",
  },
];

export default function ArchitecturePanel() {
  return (
    <section className="architecture-panel" aria-label="System architecture">
      <div className="architecture-hero">
        <div>
          <p className="eyebrow">System architecture</p>
          <h2>Local-first document intelligence</h2>
          <p>
            Documents stay inside the managed container volumes. Processing,
            retrieval, feedback, caching, and model inference run locally.
          </p>
        </div>
        <div className="architecture-lock">
          <LockKeyhole size={22} />
          <strong>Private by design</strong>
          <span>Loopback-only application and model runtime</span>
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
