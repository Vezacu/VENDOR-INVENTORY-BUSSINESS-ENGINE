# VIBE client workspace

The client is the React/Vite storefront workspace for VIBE. Install, configure,
run, build, and deploy the client and API together from the repository root.
See the [project README](../README.md) for the single-project workflow.

Do not install or deploy this workspace separately. Production API requests use
the same origin as the Express server; local development connects to the API at
`http://localhost:5000`.
