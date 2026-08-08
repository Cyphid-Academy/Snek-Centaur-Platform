<script lang="ts">
// The navigation shell of the one web application.
//
// spec: application-shell/unified-web-application
// Every Snek Centaur Server serves this same application, so this layout is
// where a platform surface is reached from wherever it is served
// (`#no-second-application`): route content mounts inside it, and the
// navigation around it is the same navigation on every server.
//
// spec: application-shell/unified-web-application#same-data-any-server
// Nothing here is per-server. The navigation names surfaces, never the server
// serving them — which server the application was fetched from settles nothing
// about what a visitor may read, so there is nothing about this one to show.
// It is deliberately mechanism only: what each surface *contains* belongs to
// the capability that owns that workflow, and arrives as a route.
import type { Snippet } from "svelte";
import { page } from "$app/state";

const { children }: { children: Snippet } = $props();

interface Destination {
  readonly href: string;
  readonly label: string;
}

const destinations: readonly Destination[] = [
  { href: "/", label: "Home" },
  { href: "/sign-in", label: "Sign in" },
];

const current = $derived(page.url.pathname);
</script>

<div class="app">
  <nav aria-label="Platform">
    <span class="mark">Snek</span>
    <ul>
      {#each destinations as destination (destination.href)}
        <li>
          <a
            href={destination.href}
            aria-current={current === destination.href ? "page" : undefined}>{destination.label}</a
          >
        </li>
      {/each}
    </ul>
  </nav>
  {@render children()}
</div>

<style>
  :global(body) {
    margin: 0;
    background: #0f172a;
  }
  .app {
    min-height: 100vh;
    background: #0f172a;
    color: #e2e8f0;
    font-family: system-ui, sans-serif;
  }
  nav {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid #1e293b;
    background: #0b1220;
  }
  .mark {
    font-weight: 700;
    color: #f8fafc;
    letter-spacing: 0.02em;
  }
  ul {
    display: flex;
    gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  a {
    color: #94a3b8;
    text-decoration: none;
    font-size: 0.95rem;
  }
  a:hover {
    color: #7dd3fc;
  }
  a[aria-current="page"] {
    color: #f8fafc;
    text-decoration: underline;
    text-underline-offset: 4px;
  }
</style>
