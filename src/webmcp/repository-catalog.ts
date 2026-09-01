import {
  REPOSITORY_WEBMCP_TOOL_CATALOG,
  type RepositoryToolName,
  type RepositoryWebMCPToolDefinition,
} from "../repository/contracts";

const CATALOG_BY_NAME = new Map<RepositoryToolName, RepositoryWebMCPToolDefinition>(
  REPOSITORY_WEBMCP_TOOL_CATALOG.map((definition) => [definition.name, definition]),
);

export function getRepositoryWebMCPToolDefinition(
  name: RepositoryToolName,
): RepositoryWebMCPToolDefinition {
  const definition = CATALOG_BY_NAME.get(name);
  if (!definition) throw new Error(`Unknown repository WebMCP tool: ${name}`);
  return definition;
}

export { REPOSITORY_WEBMCP_TOOL_CATALOG };
