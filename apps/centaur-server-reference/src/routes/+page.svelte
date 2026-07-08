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
    See <code>spec/08-centaur-server-app.md</code> for the full specification.
  </p>
  <p>
    All feature code is pending implementation. This skeleton confirms the
    Svelte 5 / SvelteKit app scaffolds and serves correctly.
  </p>
  <ul>
    <li>
      <a href="/demo"><strong>▶ Playable game demo</strong></a> — two Centaur bot teams on the
      full <code>@cyphid/snek-engine</code> rules
    </li>
    <li><a href="/.well-known/snek-game-invite">Healthcheck endpoint (POST only)</a></li>
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
