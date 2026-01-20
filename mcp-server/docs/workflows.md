# MCP Server Example Workflows

This guide provides real-world usage patterns for the RLM MCP Server tools. Each workflow demonstrates how to combine tools effectively for common developer tasks.

## Table of Contents

1. [Onboarding to a New Codebase](#1-onboarding-to-a-new-codebase)
2. [Refactoring a Module](#2-refactoring-a-module)
3. [Code Review Workflow](#3-code-review-workflow)
4. [Bug Investigation](#4-bug-investigation)
5. [Dependency Audit](#5-dependency-audit)
6. [API Documentation](#6-api-documentation)

---

## 1. Onboarding to a New Codebase

**Target Audience**: New team members joining a project

**Goal**: Quickly understand the codebase structure, key components, and dependencies.

### Workflow Steps

#### Step 1: Index the Codebase

First, create a searchable index of the entire project:

```
Tool: index_codebase
Arguments:
  - path: "/path/to/project"
  - forceReindex: true
```

This creates a complete index including all symbols, imports, exports, and code chunks.

#### Step 2: Verify Index Status

Check that indexing completed successfully:

```
Tool: get_index_status
Arguments: (none required)
```

Expected output shows file counts, language breakdown, and index health.

#### Step 3: Discover Main Components

Search for entry points and main components:

```
Tool: search_code
Arguments:
  - query: "main entry point application initialization"
  - limit: 10
```

Then search for key architectural components:

```
Tool: search_code
Arguments:
  - query: "core services controllers handlers"
  - limit: 15
```

#### Step 4: Analyze Project Dependencies

Understand how modules connect:

```
Tool: analyze_dependencies
Arguments:
  - detectCircular: true
  - detectUnused: true
```

This reveals the dependency graph and highlights any architectural issues.

#### Step 5: Deep Dive into Key Files

For each critical file discovered, get comprehensive explanations:

```
Tool: explain_code
Arguments:
  - path: "src/core/app.ts"
  - detail: "comprehensive"
```

Repeat for other key files like:
- Configuration files
- Main service files
- Core utilities

### Expected Outcomes

- Clear mental model of the project structure
- Understanding of main entry points
- Knowledge of critical dependencies
- Familiarity with core patterns used

---

## 2. Refactoring a Module

**Target Audience**: Developers planning safe refactoring

**Goal**: Understand all usages and dependencies before making changes.

### Workflow Steps

#### Step 1: Find All Symbol Usages

Before renaming or moving anything, find every reference:

```
Tool: find_usages
Arguments:
  - symbolName: "UserService"
  - includeTests: true
```

Document all locations that will need updates.

#### Step 2: Analyze Dependencies

Check what the module imports and what depends on it:

```
Tool: analyze_dependencies
Arguments:
  - path: "src/services/user-service.ts"
  - detectCircular: true
```

This reveals:
- Direct dependencies (imports)
- Reverse dependencies (who imports this)
- Potential circular dependency issues

#### Step 3: Find Similar Patterns

Look for similar code that might need consistent changes:

```
Tool: search_code
Arguments:
  - query: "class extends BaseService implements"
  - languages: ["typescript"]
  - limit: 20
```

This helps ensure consistent refactoring across similar patterns.

#### Step 4: Understand Current Implementation

Get a comprehensive explanation of the existing code:

```
Tool: explain_code
Arguments:
  - path: "src/services/user-service.ts"
  - detail: "comprehensive"
```

This includes:
- Function purposes
- Design patterns used
- Potential improvement areas

### Impact Analysis Checklist

After running the workflow:
- [ ] Total files affected: `N`
- [ ] Test files to update: `M`
- [ ] Circular dependencies: Yes/No
- [ ] Breaking changes: List them
- [ ] Similar patterns to update: `K`

---

## 3. Code Review Workflow

**Target Audience**: Code reviewers and tech leads

**Goal**: Thoroughly review code changes for patterns, dependencies, and quality.

### Workflow Steps

#### Step 1: Search for Anti-Patterns

Check if the code introduces known problematic patterns:

```
Tool: search_code
Arguments:
  - query: "any type assertion console.log TODO FIXME"
  - paths: ["src/"]
  - limit: 20
```

#### Step 2: Verify Symbol Usage Patterns

For new public APIs, ensure consistent usage:

```
Tool: find_usages
Arguments:
  - symbolName: "NewFeatureComponent"
  - includeTests: true
```

Check if tests exist and if usage follows conventions.

#### Step 3: Analyze Dependency Impact

Check if new dependencies are appropriate:

```
Tool: analyze_dependencies
Arguments:
  - path: "src/features/new-feature/"
  - detectCircular: true
  - detectUnused: true
```

Look for:
- Unexpected dependencies
- Circular imports
- Unused imports (dead code)

#### Step 4: Review Implementation Details

Get detailed explanations of complex logic:

```
Tool: explain_code
Arguments:
  - path: "src/features/new-feature/handler.ts"
  - symbolName: "processRequest"
  - detail: "detailed"
```

### Code Review Checklist

- [ ] No anti-patterns introduced
- [ ] Dependencies are appropriate
- [ ] No circular dependencies
- [ ] Tests cover new functionality
- [ ] Consistent with existing patterns
- [ ] Documentation updated

---

## 4. Bug Investigation

**Target Audience**: Developers debugging issues

**Goal**: Trace errors to their root cause through code flow analysis.

### Workflow Steps

#### Step 1: Search for Error Context

Find code related to the error or symptom:

```
Tool: search_code
Arguments:
  - query: "ConnectionTimeout retry failed database connection"
  - limit: 15
```

#### Step 2: Trace the Call Chain

Once you identify the failing function, find what calls it:

```
Tool: find_usages
Arguments:
  - symbolName: "connectToDatabase"
  - includeTests: false
```

This helps trace the execution path leading to the error.

#### Step 3: Understand Control Flow

Get detailed explanation of the suspect code:

```
Tool: explain_code
Arguments:
  - path: "src/db/connection.ts"
  - symbolName: "connectWithRetry"
  - detail: "comprehensive"
```

Focus on:
- Error handling paths
- Edge cases
- Timeout logic

#### Step 4: Search for Related Issues

Look for similar patterns that might have the same bug:

```
Tool: search_code
Arguments:
  - query: "timeout retry exponential backoff"
  - languages: ["typescript"]
  - limit: 10
```

### Bug Investigation Template

```markdown
## Bug: [Description]

### Symptom
[What error/behavior is observed]

### Affected Code
- File: `path/to/file.ts`
- Function: `functionName`

### Call Chain
1. `entryPoint()` ->
2. `middlewareFunction()` ->
3. `failingFunction()` <- ERROR HERE

### Root Cause
[Explanation from code analysis]

### Related Patterns
[Other code with similar issues]
```

---

## 5. Dependency Audit

**Target Audience**: Tech leads and architects

**Goal**: Assess technical debt and dependency health.

### Workflow Steps

#### Step 1: Full Index for Accurate Analysis

Ensure the index is complete and fresh:

```
Tool: index_codebase
Arguments:
  - forceReindex: true
```

#### Step 2: Detect Circular Dependencies

Find all circular dependency chains:

```
Tool: analyze_dependencies
Arguments:
  - detectCircular: true
```

Each circular dependency adds coupling and makes testing harder.

#### Step 3: Find Unused Imports

Detect dead imports that can be removed:

```
Tool: analyze_dependencies
Arguments:
  - detectUnused: true
```

#### Step 4: Search for Problematic Patterns

Look for common technical debt indicators:

```
Tool: search_code
Arguments:
  - query: "deprecated legacy hack workaround"
  - limit: 30
```

Also search for:
- `@ts-ignore` / `@ts-nocheck`
- `any` type usage
- Long functions (search for large code blocks)

#### Step 5: Analyze High-Coupling Areas

For areas with many dependencies, get detailed analysis:

```
Tool: analyze_dependencies
Arguments:
  - path: "src/core/"
```

### Dependency Audit Report Template

```markdown
## Dependency Audit Report

### Summary
- Total Files Analyzed: X
- Circular Dependencies: Y chains
- Unused Imports: Z files

### Circular Dependencies
| Chain | Files Involved | Severity |
|-------|----------------|----------|
| 1 | A -> B -> A | High |

### Unused Dependencies
| File | Unused Import |
|------|---------------|
| src/x.ts | lodash |

### Technical Debt Indicators
- TODO comments: N
- Deprecated usage: M
- Type assertions: K

### Recommendations
1. Break circular dependency in core/
2. Remove unused imports in utils/
3. Address deprecated APIs before next release
```

---

## 6. API Documentation

**Target Audience**: Developers creating or maintaining API docs

**Goal**: Generate comprehensive documentation for public APIs.

### Workflow Steps

#### Step 1: Get Comprehensive Code Explanation

For each public API file, generate detailed documentation:

```
Tool: explain_code
Arguments:
  - path: "src/api/users.ts"
  - detail: "comprehensive"
```

This provides:
- Function signatures
- Parameter descriptions
- Return value documentation
- Usage notes

#### Step 2: Find Usage Examples

For each exported function, find real usage examples:

```
Tool: find_usages
Arguments:
  - symbolName: "createUser"
  - includeTests: true
```

Tests often provide the best usage examples.

#### Step 3: Document Related Functions

Search for related functionality to cross-reference:

```
Tool: search_code
Arguments:
  - query: "user authentication validation"
  - paths: ["src/api/"]
  - limit: 10
```

#### Step 4: Explain Complex Logic

For complex algorithms or business logic, get detailed explanations:

```
Tool: explain_code
Arguments:
  - path: "src/api/users.ts"
  - symbolName: "validateUserPermissions"
  - detail: "comprehensive"
```

### API Documentation Template

```markdown
## UserService API

### Overview
[Generated from explain_code comprehensive]

### Functions

#### createUser(data: UserInput): Promise<User>

**Description**: [From explain_code]

**Parameters**:
- `data` (UserInput): User creation data

**Returns**: Promise<User>

**Example**:
```typescript
// From find_usages (test file)
const user = await createUser({
  email: "test@example.com",
  name: "Test User"
});
```

**Related Functions**:
- `updateUser()` - Update existing user
- `deleteUser()` - Remove user
- `validateUserPermissions()` - Check user access
```

---

## Workflow Cheat Sheet

| Goal | Primary Tools | Key Arguments |
|------|---------------|---------------|
| Onboarding | `index_codebase` -> `search_code` -> `explain_code` | `detail: "comprehensive"` |
| Refactoring | `find_usages` -> `analyze_dependencies` | `includeTests: true`, `detectCircular: true` |
| Code Review | `search_code` -> `find_usages` -> `analyze_dependencies` | Pattern-focused queries |
| Bug Investigation | `search_code` -> `find_usages` -> `explain_code` | Error/symptom queries |
| Dependency Audit | `analyze_dependencies` | `detectCircular`, `detectUnused` |
| Documentation | `explain_code` -> `find_usages` | `detail: "comprehensive"`, `includeTests: true` |

---

## Tips for Effective Tool Usage

### Search Query Best Practices

1. **Be specific**: "user authentication JWT token" > "auth"
2. **Use domain terms**: Use actual function/class names when known
3. **Combine concepts**: "error handling retry timeout" finds related code
4. **Filter by language**: Narrow results with `languages` parameter

### Explanation Detail Levels

| Level | Use Case |
|-------|----------|
| `brief` | Quick overview during browsing |
| `detailed` | Understanding specific functions |
| `comprehensive` | Full documentation, architecture review |

### Dependency Analysis Flags

- `detectCircular: true` - Always use for architectural reviews
- `detectUnused: true` - Use during cleanup/refactoring
- Combine both for complete health check

### Performance Tips

1. Index once, search many times
2. Use path filters to narrow searches
3. Start with higher limits, then refine queries
4. Use `get_index_status` to verify index health before intensive searches
