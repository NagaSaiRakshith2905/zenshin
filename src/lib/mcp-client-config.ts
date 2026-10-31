export function mcpClientConfig(origin: string) {
  const url = `${new URL(origin).origin}/api/mcp`;
  return {
    codex: `[mcp_servers.zenshin]\nurl = ${JSON.stringify(url)}\nbearer_token_env_var = "ZENSHIN_MCP_TOKEN"\n`,
    claude: JSON.stringify({ mcpServers: { zenshin: { type: "http", url, headers: { Authorization: "Bearer ${ZENSHIN_MCP_TOKEN}" } } } }, null, 2),
  };
}
