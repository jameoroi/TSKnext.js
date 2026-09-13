# ADR-003: Auth.js plus the legacy session bridge

- Status: accepted
- Decision: use Auth.js for OAuth/provider integration while keeping a server-side bridge to the existing commerce session during migration
- Context: existing customers/admins and cookies must continue working while Next-native pages are moved incrementally
- Consequences: all new routes must use the shared session/tenant guards; the compatibility API remains temporary and must not receive new unvalidated contracts
