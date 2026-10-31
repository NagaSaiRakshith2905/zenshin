"use client";
import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mcpClientConfig } from "@/lib/mcp-client-config";

export function McpSetup() {
  const [message, setMessage] = useState("");
  const [fallback, setFallback] = useState("");
  async function copy(client: "codex" | "claude") {
    const config = mcpClientConfig(window.location.origin)[client];
    try { await navigator.clipboard.writeText(config); setMessage("Configuration copied. It uses this site’s address and an environment variable for your key."); setFallback(""); }
    catch { setFallback(config); setMessage("Copy failed. Select and copy the configuration below."); }
  }
  return <details className="rounded-[14px] border p-4">
    <summary className="cursor-pointer font-medium">Connect Codex or Claude Code</summary>
    <div className="mt-3 flex flex-col gap-3 text-sm">
      <p>Store your key in <code>ZENSHIN_MCP_TOKEN</code> in the environment that launches your client. Configuration copies use this site’s <code>/api/mcp</code> endpoint and contain no secret.</p>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void copy("codex")}><Copy data-icon="inline-start" />Copy Codex configuration</Button><Button variant="outline" onClick={() => void copy("claude")}><Copy data-icon="inline-start" />Copy Claude Code configuration</Button></div>
      <p>Add the Codex entry to your user <code>config.toml</code>, or merge the Claude Code entry into <code>.mcp.json</code>. Restart your client, then check its MCP server status.</p>
      <p>Keys expire after 90 days by default. To rotate, create and configure a replacement, verify it, then revoke the old key. Revocation and project or permission changes apply on the next request.</p>
      <p role="status">{message}</p>
      {fallback && <pre tabIndex={0} className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3">{fallback}</pre>}
    </div>
  </details>;
}
