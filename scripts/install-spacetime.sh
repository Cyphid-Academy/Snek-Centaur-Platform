#!/usr/bin/env bash
#
# Ensure the SpacetimeDB CLI is present at the version this repo pins.
#
# The version is read from packages/stdb/spacetimedb/package.json so the module's
# own dependency stays the single source of truth — there is no second place to
# bump. This matters more than it looks: SpacetimeDB's on-disk data format is
# version-gated, so running a newer CLI even once rewrites .stdb/data such that
# the pinned CLI then refuses to start.
#
# Binaries are managed by SpacetimeDB's own version manager (`spacetimedb-update`,
# which the upstream installer places as `spacetime`). Installed versions land
# under $XDG_DATA_HOME, which Replit already points inside the workspace, so they
# survive the container rebuilds that wipe $HOME. That is why this installs into
# the repo's .local/bin rather than ~/.local/bin.
#
# Idempotent and offline on the happy path: when the installed version already
# satisfies the pin it exits without touching the network, so it is cheap enough
# to run before every start.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

module_manifest="packages/stdb/spacetimedb/package.json"
bin_home="$repo_root/.local/bin"
spacetime_bin="$bin_home/spacetime"
# The CLI resolves its version-manager sibling through XDG_BIN_HOME, falling back
# to ~/.local/bin — which is not where this installs.
export XDG_BIN_HOME="$bin_home"

say() { echo "install-spacetime: $*"; }
die() {
  echo "install-spacetime: $*" >&2
  exit 1
}

[ -f "$module_manifest" ] || die "cannot find $module_manifest"

pin="$(node -p "require('./$module_manifest').dependencies?.spacetimedb ?? ''")"
[ -n "$pin" ] || die "no spacetimedb dependency pinned in $module_manifest"

case "$pin" in
  *[!0-9.*]*) die "unsupported version pin '$pin' — expected e.g. 2.7.1 or 2.7.*" ;;
esac

installed_version() {
  [ -x "$spacetime_bin" ] || return 0
  "$spacetime_bin" --version 2>/dev/null |
    sed -n 's/.*spacetimedb tool version \([0-9][0-9.]*\).*/\1/p' | head -1
}

# A trailing "*" means "any patch in this range"; anything else must match whole.
# Without the exact branch, a pin of 2.7.1 would also accept 2.7.10.
satisfies() {
  local candidate="$1"
  [ -n "$candidate" ] || return 1
  case "$pin" in
    *\*)
      case "$candidate" in
        "${pin%\*}"*) return 0 ;;
        *) return 1 ;;
      esac
      ;;
    *) [ "$candidate" = "$pin" ] ;;
  esac
}

# pnpm puts node_modules/.bin on PATH for every script, which is how dev:stdb,
# stdb:publish and the demo stack find bare `spacetime`. pnpm also prunes and
# rewrites that directory during install, so repair the link on *every* run —
# including the fast path — or a `pnpm install` silently breaks the next start.
link_into_node_modules() {
  mkdir -p node_modules/.bin
  ln -sf ../../.local/bin/spacetime node_modules/.bin/spacetime
}

current="$(installed_version)"
if satisfies "$current"; then
  link_into_node_modules
  say "spacetime $current already satisfies $pin"
  exit 0
fi

[ -n "$current" ] &&
  say "installed spacetime $current does not satisfy $pin — correcting"

case "$(uname -s)" in
  Linux) os="unknown-linux-gnu" ;;
  Darwin) os="apple-darwin" ;;
  *) die "unsupported OS $(uname -s)" ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch="x86_64" ;;
  arm64 | aarch64) arch="aarch64" ;;
  *) die "unsupported architecture $(uname -m)" ;;
esac

# One request yields the version, the download URL and the publisher's digest.
# Only the most recent releases are searched, which is ample for a maintained
# pin but would not find a very old one.
say "resolving newest release matching $pin"
resolved="$(
  curl -fsSL --max-time 60 \
    "https://api.github.com/repos/clockworklabs/SpacetimeDB/releases?per_page=100" |
    node -e '
      let raw = "";
      process.stdin.on("data", (d) => (raw += d));
      process.stdin.on("end", () => {
        const [pin, assetName] = process.argv.slice(1);
        const exact = !pin.endsWith("*");
        const prefix = pin.replace(/\*$/, "");
        for (const release of JSON.parse(raw)) {
          if (release.draft || release.prerelease) continue;
          const version = String(release.tag_name).replace(/^v/, "");
          const ok = exact ? version === pin : version.startsWith(prefix);
          if (!ok) continue;
          const asset = (release.assets || []).find((a) => a.name === assetName);
          if (!asset) continue;
          const digest = String(asset.digest || "").replace(/^sha256:/, "");
          process.stdout.write([version, digest, asset.browser_download_url].join("\t"));
          return;
        }
      });
    ' "$pin" "spacetimedb-update-${arch}-${os}"
)" || die "could not reach the GitHub releases API to resolve $pin"
[ -n "$resolved" ] || die "no published release matches $pin for ${arch}-${os}"

IFS=$'\t' read -r version digest download_url <<<"$resolved"

if [ ! -x "$spacetime_bin" ]; then
  say "installing the spacetime version manager into .local/bin"
  mkdir -p "$bin_home"
  tmp="$(mktemp "${TMPDIR:-/tmp}/spacetime-update.XXXXXX")"
  trap 'rm -f "$tmp"' EXIT
  curl -fsSL --max-time 300 -o "$tmp" "$download_url" ||
    die "failed to download the spacetime version manager"
  # The publisher's digest, so a mutated release asset cannot be executed here.
  if [ -n "$digest" ]; then
    actual="$(sha256sum "$tmp" | cut -d' ' -f1)"
    [ "$actual" = "$digest" ] ||
      die "checksum mismatch for $download_url (expected $digest, got $actual)"
  else
    say "warning: the release publishes no digest for this asset; skipping verification"
  fi
  chmod +x "$tmp"
  mv "$tmp" "$spacetime_bin"
  trap - EXIT
fi

say "installing spacetime $version"
"$spacetime_bin" version install "$version" >/dev/null
"$spacetime_bin" version use "$version" >/dev/null

link_into_node_modules

confirmed="$(installed_version)"
satisfies "$confirmed" ||
  die "installed $confirmed, which still does not satisfy $pin"
say "spacetime $confirmed ready"
