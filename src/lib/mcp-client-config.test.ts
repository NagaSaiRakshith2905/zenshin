import { expect, it } from "vitest";
import { mcpClientConfig } from "./mcp-client-config";

it("uses the supplied origin and environment-backed keys in both client formats", () => {
  const config = mcpClientConfig("https://workspace.example/path");
  expect(config.codex).toContain('url = "https://workspace.example/api/mcp"');
  expect(config.codex).toContain('bearer_token_env_var = "ZENSHIN_MCP_TOKEN"');
  expect(JSON.parse(config.claude).mcpServers.zenshin).toEqual({ type: "http", url: "https://workspace.example/api/mcp", headers: { Authorization: "Bearer ${ZENSHIN_MCP_TOKEN}" } });
});
