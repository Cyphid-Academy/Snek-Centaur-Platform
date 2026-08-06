---
name: Public origin behind Replit's TLS proxy
description: Why a SvelteKit dev server reports http:// on Replit, and why running the built adapter-node server fixes it without code changes
---

Replit terminates TLS at its edge and forwards plain HTTP into the container, so a server that derives its own origin from the incoming request sees `http://`. Under `vite dev` a SvelteKit app therefore reports `http://<domain>` (or `http://127.0.0.1:<port>`) even though the browser reached it over HTTPS. Dev does not honour `x-forwarded-proto`.

**This does not require a code change.** `@sveltejs/adapter-node` honours the `ORIGIN` environment variable, so building and running the built server with `ORIGIN=https://<domain>` makes the framework report the correct origin everywhere it derives one. Only the dev server is affected. Reach for `ORIGIN` before touching application code — a workflow that runs `vite dev` is the actual cause, not the app's origin-derivation logic.

**Why it matters:** when the derived origin is an *identity* — an OIDC-style issuer id, a registered return address, the base of a published-keys URL — a wrong scheme is compared against a value registered out-of-band as `https://` and refused, and the refusal names an issuer that looks correct apart from its scheme. That is easy to misdiagnose as a registration or credentials problem.

**Diagnostic trap:** from inside the container, DNS for the repl's own domain resolves to an internal address where port 80 is closed, so `curl http://<domain>` fails with a connection refusal. That says nothing about the public edge, which serves both HTTP and HTTPS fine. Test external reachability from an genuinely external vantage (a fetch tool), not from the container, and not with a screenshot tool — those render bare JSON as a blank page and prove nothing either way.

**How to apply:** on Replit, prefer running the built adapter-node server with an explicit `ORIGIN` over any scheme-detection logic. Check both the presenting side and whatever registered the expected value; fixing one leaves the mismatch. Note the tradeoff: the built server gives up HMR, so it suits a stack being demonstrated more than one being actively edited.
