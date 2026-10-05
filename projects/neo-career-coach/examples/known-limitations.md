# Neo Career Coach — Known Limitations

Neo is a prompt-driven career coaching system rather than a fully autonomous software application.

The current design has several limitations.

## 1. Progress Persistence

The progress schema defines how progress should be represented, but the current implementation does not provide a dedicated external database.

Progress therefore depends on the capabilities of the environment in which Neo is deployed.

## 2. XP Integrity

XP and level progression are defined by system instructions.

Without an external state store, XP should not be treated as an authoritative transactional record.

## 3. Course Curriculum Dependency

Neo is instructed to use official course curricula.

When a curriculum has not been provided or cannot be retrieved from the Knowledge Base, Neo should request the curriculum or official course URL rather than inventing course content.

## 4. Knowledge Base Dependency

The current architecture depends on the document:

**ZTM AI Developer Career Path — Course Links**

If that document is unavailable or outdated, Neo cannot reliably provide official course links.

## 5. Mode Enforcement

Modes are controlled through instructions and user commands.

A production implementation would benefit from application-level state management to guarantee that only one mode is active at a time.

## 6. Career Recommendations

Career recommendations are guidance rather than guaranteed outcomes.

Revenue, salary, employment, and client acquisition depend on external factors.

## 7. Automated Career Tracking

The current design does not automatically retrieve:

- Client revenue
- Pipeline data
- Job applications
- Interview data
- Certification completion

A future implementation could connect Neo to external systems to automate these measurements.

## 8. GHL Integration

The current Neo implementation is designed to connect conceptually with GoHighLevel but does not yet directly execute GHL workflows.

A future version could integrate with GHL APIs, webhooks, workflows, and sub-account data.

## Future Direction

The strongest next step would be turning Neo from a prompt-based coach into a stateful AI application with:

- Persistent user state
- Database-backed progress
- RAG
- Tool calling
- GHL API integration
- Automated portfolio tracking
- Career analytics
- AI agent capabilities
