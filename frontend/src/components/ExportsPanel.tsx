import { Database, FileArchive } from "lucide-react";

import { api } from "../api/client";

export function ExportsPanel() {
  return (
    <section>
      <div className="settings-heading">
        <div>
          <h1>Exports</h1>
          <div className="mono-sm muted">
            Full-site exports of commission metadata and stored files. Per-commission
            zip exports remain on each detail page.
          </div>
        </div>
      </div>

      <div className="settings-panel">
        <div className="settings-panel-title">Database export</div>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
          A JSON dump of every commission&rsquo;s metadata, labels, characters,
          artists, lifecycle nodes, and file records. No binary payloads.
        </p>
        <a className="btn primary" href={api.databaseExportUrl()} download>
          <Database size={14} strokeWidth={2} /> Download database.json
        </a>
      </div>

      <div className="settings-panel">
        <div className="settings-panel-title">Files export</div>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
          A zip of every stored file, laid out under{" "}
          <span className="mono">{"{artists}-{id}/{node}/"}</span>. Large; expect
          the response time to scale with the storage size.
        </p>
        <a className="btn primary" href={api.filesExportUrl()} download>
          <FileArchive size={14} strokeWidth={2} /> Download files.zip
        </a>
      </div>
    </section>
  );
}
