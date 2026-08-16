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
    This is the one application every platform surface — platform-wide and
    team-internal alike — is reached in, per the
    <code>application-shell</code> capability. Its shared infrastructure — the
    state binding, the surface mounting contract, and the one board rendering
    — lives under <code>src/lib/shell/</code> and <code>src/lib/board/</code>.
    Individual surfaces are pending implementation.
  </p>
  <ul>
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
