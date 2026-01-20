# RLM MCP Server

A Model Context Protocol (MCP) server that provides semantic code search and analysis for Claude Code integration.

## Features

- **Semantic Code Search**: Search your codebase using natural language queries
- **Code Explanation**: Get detailed explanations of code files, functions, and classes
- **Usage Analysis**: Find all usages of symbols across your project
- **Dependency Analysis**: Analyze import/export relationships and detect circular dependencies
- **Real-time Updates**: Automatic index updates when files change
- **Multi-language Support**: TypeScript, JavaScript, Python, Go, Rust, Java, Kotlin, C/C++

## Documentation

- **[Example Workflows](docs/workflows.md)**: Real-world usage patterns including onboarding, refactoring, code review, bug investigation, dependency audits, and API documentation generation.

## Installation

```bash
# Navigate to the mcp-server directory
cd mcp-server

# Install dependencies
npm install

# Build the server
npm run build
```

## Usage with Claude Code

### Configuration

Add the MCP server to your Claude Code configuration:

```json
{
  "mcpServers": {
    "rlm": {
      "command": "node",
      "args": ["/path/to/rlm/mcp-server/dist/index.js"],
      "env": {
        "OPENAI_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Available Tools

#### `index_codebase`
Index the codebase for semantic search.

```
Arguments:
- path (optional): Root path to index
- forceReindex (optional): Force re-indexing
```

#### `search_code`
Search code using natural language queries.

```
Arguments:
- query: Natural language search query
- languages (optional): Filter by languages
- paths (optional): Filter by file paths
- limit (optional): Maximum results (default: 10)
```

#### `explain_code`
Get explanations of code files, functions, or code ranges.

```
Arguments:
- path: File path to explain
- symbolName (optional): Specific symbol to explain
- startLine (optional): Start line for range
- endLine (optional): End line for range
- detail (optional): "brief", "detailed", or "comprehensive"
```

#### `find_usages`
Find all usages of a symbol.

```
Arguments:
- symbolName: Name of the symbol
- path (optional): Starting file path
- includeTests (optional): Include test files
```

#### `analyze_dependencies`
Analyze import/export dependencies.

```
Arguments:
- path (optional): Path to analyze
- detectCircular (optional): Detect circular dependencies
- detectUnused (optional): Detect unused imports
```

## Running Standalone

```bash
# Start the MCP server
npm start

# Or with options
npm start -- --root /path/to/project --no-watch
```

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## Architecture

```
mcp-server/
├── src/
│   ├── index.ts          # Main entry point
│   ├── server.ts         # MCP server implementation
│   ├── types.ts          # Type definitions
│   ├── indexer/          # Codebase indexing
│   │   └── indexer.ts    # File and symbol indexing
│   ├── search/           # Search functionality
│   │   └── search.ts     # Semantic and keyword search
│   ├── tools/            # MCP tools
│   │   ├── search-code.ts
│   │   ├── explain-code.ts
│   │   ├── find-usages.ts
│   │   └── analyze-dependencies.ts
│   ├── watcher/          # File watching
│   │   └── watcher.ts    # Real-time file monitoring
│   └── utils/            # Utilities
│       ├── language.ts   # Language detection
│       └── files.ts      # File operations
├── claude-code.json      # Claude Code manifest
├── package.json
└── tsconfig.json
```

## Supported Languages

| Language | Extensions |
|----------|------------|
| TypeScript | .ts, .tsx, .mts, .cts |
| JavaScript | .js, .jsx, .mjs, .cjs |
| Python | .py, .pyi |
| Go | .go |
| Rust | .rs |
| Java | .java |
| Kotlin | .kt, .kts |
| C | .c, .h |
| C++ | .cpp, .cc, .cxx, .hpp |
| C# | .cs |
| Ruby | .rb |
| PHP | .php |
| Swift | .swift |

## License

MIT
