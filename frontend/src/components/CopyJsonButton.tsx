import { useState } from "react";
import { Braces, Check } from "lucide-react";

import { api } from "../api/client";

/** Copies the agent-facing commission JSON to the clipboard, flashing a
 * "copied!" confirmation for 2s. Used on both the detail and edit topbars. */
export function CopyJsonButton({ id }: { id: number }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const payload = await api.copyJson(id);
    await navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      className="btn sm mono"
      onClick={() => void copy()}
      title="Copy commission JSON for agents"
    >
      {copied ? <Check /> : <Braces />}
      {copied ? "copied!" : "Copy API JSON"}
    </button>
  );
}
