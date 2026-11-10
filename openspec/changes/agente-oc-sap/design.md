# Design

## Context

This is a greenfield project implementing a conversational agent for processing purchase orders in a simulated SAP environment. The project starts from a detailed PRD and fixture data (6 test cases + master data). The implementation must work locally first, then be prepared for Railway deployment.

**Constraints:**
- Must use TypeScript and Node.js 20+
- Must use Vercel AI SDK for LLM integration
- Must use DeepSeek API (OpenAI-compatible format)
- Must implement custom agent loop (not use framework's built-in loop)
- Must be testable without API key via demo.ts
- Must include P0 features (txt evidence) and P1 features (PDF evidence)
- Must prepare for Railway deployment but prioritize local functionality

## Goals / Non-Goals

**Goals:**
- Implement a fully functional conversational agent that processes purchase orders through natural conversation
- Build a React-based chat interface with real-time streaming and tool call visualization
- Create a case history sidebar showing all processed cases with file access
- Implement all 10 validation rules (RC1-RC10) with proper blocking/confirmation logic
- Generate both txt (P0) and pdf (P1) approval evidence
- Ensure idempotency and traceability for all operations
- Provide a demo.ts that runs all test cases without requiring an API key
- Write integration tests with Vitest covering all critical paths
- Package the agent as a reusable module (bonus feature)
- Prepare deployment configuration for Railway while ensuring local-first functionality

**Non-Goals:**
- Real SAP integration (design documentation only, no actual SAP connection)
- User authentication or authorization system
- Database persistence (using file system only)
- Multi-tenancy or user isolation
- WebSocket-based streaming (using SSE instead)
- Advanced error recovery or retry mechanisms beyond basic timeout handling

## Decisions

### 1. Runtime and Language: Node.js 20+ with TypeScript
**Decision:** Use Node.js 20+ as the runtime with TypeScript for all code.

**Rationale:** 
- PRD explicitly requires TypeScript
- Node.js provides better ecosystem maturity and library support than Bun for this use case
- TypeScript ensures type safety across the agent loop, tools, and API contracts
- Node.js 20+ has native support for modern features (fetch, streams, etc.)

**Alternatives considered:**
- **Bun for everything**: Faster but less mature ecosystem, some libraries may have compatibility issues
- **Node.js with JavaScript**: Loses type safety benefits, harder to maintain complex agent logic

### 2. Frontend: React with Vite
**Decision:** Use React with Vite for the chat interface.

**Rationale:**
- React provides component-based architecture for complex UI (chat, sidebar, tool visualization)
- Vite offers fast development experience and optimized builds
- Large ecosystem of UI libraries for streaming, markdown rendering, file handling
- Better long-term maintainability than vanilla HTML

**Alternatives considered:**
- **Svelte**: Simpler but smaller ecosystem for complex state management
- **Vue**: Good option but React has better streaming/SSE libraries
- **Plain HTML**: Insufficient for dynamic chat interface with multiple interactive elements

### 3. Backend Server: Hono
**Decision:** Use Hono as the HTTP server framework.

**Rationale:**
- Lightweight, modern, and TypeScript-first
- Excellent performance and small bundle size
- Native support for streaming responses (SSE)
- Works well with both Node.js and edge environments
- Simpler than Express, more mature than many alternatives

**Alternatives considered:**
- **Express**: Heavier, older design patterns, less TypeScript-friendly
- **Fastify**: Good performance but more complex configuration
- **Native Node.js http**: Too low-level, would need to implement routing, middleware, etc.

### 4. LLM Integration: DeepSeek via OpenAI SDK + Vercel AI SDK
**Decision:** Use DeepSeek API through the OpenAI SDK (with baseURL override) wrapped by Vercel AI SDK.

**Rationale:**
- DeepSeek provides OpenAI-compatible API, allowing reuse of existing OpenAI SDK
- Vercel AI SDK provides excellent tool calling support, streaming, and message management
- Custom adapter layer isolates the agent loop from provider-specific details
- Easy to swap providers later by changing only the adapter implementation

**Alternatives considered:**
- **Direct DeepSeek API calls**: Would need to implement tool calling parsing, streaming, etc. manually
- **LangChain**: Overly complex for this use case, obscures the agent loop implementation
- **Anthropic SDK**: DeepSeek also supports Anthropic format, but OpenAI format is more widely used

### 5. Agent Loop: Custom Implementation
**Decision:** Build a custom agent loop instead of using framework-provided loops.

**Rationale:**
- PRD requires demonstrating understanding of agent architecture
- Custom loop provides full control over iteration limits, confirmation flow, error handling
- Easier to debug and explain in SOLUCION.md
- Avoids framework magic that obscures what's happening

**Alternatives considered:**
- **Vercel AI SDK's built-in agent loop**: Hides implementation details, less educational
- **LangChain AgentExecutor**: Too heavy, doesn't match our tool contract
- **OpenAI Assistants API**: Vendor lock-in, less control

### 6. Session Storage: JSON Files
**Decision:** Persist sessions as JSON files in `out/sessions/` directory.

**Rationale:**
- Simple to implement and debug
- Survives server restarts (requirement)
- Easy to inspect and modify for testing
- No database setup required
- Sufficient for single-user demo application

**Alternatives considered:**
- **SQLite**: More robust but adds complexity for a demo
- **In-memory only**: Loses sessions on restart, violates requirement
- **Redis**: Overkill for this use case, adds infrastructure dependency

### 7. Streaming: Server-Sent Events (SSE)
**Decision:** Use SSE for streaming chat responses.

**Rationale:**
- Native browser support via EventSource API
- Simpler than WebSocket (one-way communication is sufficient)
- Works well with HTTP/2 and proxies
- Compatible with all modern browsers
- Vercel AI SDK has excellent SSE support

**Alternatives considered:**
- **WebSocket**: Overkill for one-way streaming, more complex setup
- **Long polling**: Less efficient, more complex client code
- **Chunked transfer encoding**: Lower-level, harder to implement correctly

### 8. Testing: Vitest
**Decision:** Use Vitest for integration tests.

**Rationale:**
- Native TypeScript support without transpilation
- Fast execution with parallel test runs
- Compatible with Vite ecosystem
- Modern API similar to Jest but lighter
- Good support for async testing (critical for agent loops)

**Alternatives considered:**
- **Jest**: Heavier, requires more configuration for TypeScript
- **Mocha**: Older, less TypeScript-friendly
- **Node.js test runner**: Less feature-rich, smaller ecosystem

### 9. PDF Generation: pdf-lib
**Decision:** Use pdf-lib for generating PDF approval evidence.

**Rationale:**
- Pure JavaScript, no external dependencies
- Works in both Node.js and browser
- Good TypeScript support
- Sufficient for simple text-based PDFs
- Actively maintained

**Alternatives considered:**
- **pdfkit**: Older API, less TypeScript-friendly
- **Puppeteer**: Overkill for simple PDFs, requires Chromium
- **wkhtmltopdf**: External binary dependency, harder to deploy

### 10. Containerization: Docker Compose
**Decision:** Use Docker Compose for local development and testing.

**Rationale:**
- Ensures consistent environment across team members
- Easy to test deployment configuration
- Simplifies Railway migration (similar container model)
- Can include multiple services (backend, frontend, future database)
- Industry standard for local development

**Alternatives considered:**
- **npm scripts only**: Less portable, environment differences
- **Vagrant**: Heavier, less modern
- **Kubernetes**: Overkill for local development

### 11. Deployment: Railway (Prepared)
**Decision:** Prepare for Railway deployment but prioritize local functionality.

**Rationale:**
- Railway provides easy deployment for Node.js applications
- Supports environment variables and secrets
- Good free tier for demo purposes
- Similar to Docker model, easy migration
- User can deploy later without code changes

**Alternatives considered:**
- **Vercel**: Better for frontend, but backend streaming can be tricky
- **Heroku**: More expensive, similar capabilities
- **AWS/Azure**: Overkill for demo application
- **Local tunnel**: Works but not a permanent solution

### 12. Validation: Zod
**Decision:** Use Zod for runtime validation of tool arguments and API contracts.

**Rationale:**
- PRD explicitly requires Zod for tool arguments
- Excellent TypeScript inference
- Runtime + compile-time safety
- Good error messages for validation failures
- Lightweight and fast

**Alternatives considered:**
- **Joi**: Heavier, less TypeScript-friendly
- **Yup**: Similar but less popular in modern TypeScript projects
- **Manual validation**: Error-prone, harder to maintain

## Risks / Trade-offs

### Risk: DeepSeek API Rate Limits
**Impact:** High request volume during testing may hit rate limits.
**Mitigation:** 
- Implement exponential backoff in LLM adapter
- Use demo.ts for testing without API calls
- Cache responses where possible
- Monitor usage during development

### Risk: Large Context Windows with Tool Calls
**Impact:** Complex cases with many tool calls may exceed context limits or become slow.
**Mitigation:**
- Implement iteration limit (25 iterations max)
- Summarize tool results in context
- Consider context window management for very long conversations
- Monitor token usage

### Risk: Session File I/O Performance
**Impact:** Concurrent requests to same session may cause race conditions or slow writes.
**Mitigation:**
- Use atomic file writes (write to temp, then rename)
- Implement file locking for concurrent access
- Consider batching writes for high-frequency updates
- Monitor I/O performance during testing

### Risk: Browser Compatibility for SSE
**Impact:** Some older browsers may not support SSE or may have connection limits.
**Mitigation:**
- SSE is widely supported in modern browsers
- Provide fallback to polling if SSE fails (future enhancement)
- Test in Chrome, Firefox, Safari, Edge
- Document browser requirements

### Risk: Railway Deployment Complexity
**Impact:** Deployment may fail due to environment differences or configuration issues.
**Mitigation:**
- Test thoroughly in Docker Compose first (similar environment)
- Document all environment variables clearly
- Provide Railway-specific configuration files
- Test deployment in staging before production
- Have fallback plan (local demo) if Railway deployment fails

### Trade-off: File-based Storage vs Database
**Trade-off:** File-based storage is simpler but less robust than a database.
**Acceptable because:**
- Single-user demo application
- No complex queries or relationships
- Easier to inspect and debug
- Sufficient for PRD requirements
- Can migrate to database later if needed

### Trade-off: Custom Agent Loop vs Framework
**Trade-off:** Custom loop requires more implementation effort but provides better understanding.
**Acceptable because:**
- PRD requires demonstrating agent architecture knowledge
- Easier to explain in SOLUCION.md
- Full control over behavior
- Educational value for the developer
- Avoids framework dependencies and magic

### Trade-off: Local-first vs Railway-first
**Trade-off:** Prioritizing local functionality may require refactoring for Railway.
**Acceptable because:**
- Local functionality is the primary evaluation criterion
- Railway deployment is secondary (can be done during defense)
- Docker Compose provides similar environment to Railway
- Reduces deployment risk by ensuring core functionality works first
