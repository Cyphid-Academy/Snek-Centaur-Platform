<script lang="ts">
const title = "Snek Centaur Server";
const subtitle = "Reference Implementation";
</script>

<svelte:head>
  <title>{title}</title>
</svelte:head>

<main>
  <h1>{title}</h1>
  <p>{subtitle}</p>
  <p>
    This is the reference implementation of the Snek Centaur Server.
    Its behaviour is specified by the <code>team-server-management</code> capability.
  </p>
  <p>
    All feature code is pending implementation. This skeleton confirms the
    Svelte 5 / SvelteKit app scaffolds and serves correctly.
  </p>
  <ul>
    <li><a href="/console">Platform console</a></li>
    <li><a href="/sign-in">Sign in through the platform</a></li>
    <li><a href="/.well-known/snek-healthcheck">Healthcheck endpoint</a></li>
    <li><a href="/.well-known/snek-server-keys">Published signing keys</a></li>
  </ul>
</main>

<style>
  main {
    font-family: system-ui, sans-serif;
    max-width: 640px;
    margin: 4rem auto;
    padding: 0 1rem;
    color: #e2e8f0;
    background: #0f172a;
    min-height: 100vh;
  }

  h1 {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 0.25rem;
    color: #f8fafc;
  }

  p {
    line-height: 1.6;
    color: #94a3b8;
  }

  code {
    background: #1e293b;
    padding: 0.1em 0.4em;
    border-radius: 4px;
    font-size: 0.9em;
    color: #7dd3fc;
  }

  a {
    color: #7dd3fc;
  }
</style>
