#!/usr/bin/env bash
# Pulls the upstream 40kdc-data terrain JSON (templates + layouts) into the
# vendored source dir static/data/terrain/source/40kdc/. These files are the
# input to scripts/convert-40kdc-terrain.mjs (pnpm convert:40kdc), which merges
# them with gw.yml into static/data/terrain/combined.yml.
#
# Run: scripts/pull-40kdc-terrain.sh  (or: make pull-terrain)
set -euo pipefail

repo="wn-mitch/40kdc-data"
branch="main"
base="https://raw.githubusercontent.com/${repo}/${branch}/data/core"

# Resolve the source dir relative to this script so it works from any cwd.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dest_dir="${script_dir}/../static/data/terrain/source/40kdc"
mkdir -p "${dest_dir}"

for file in terrain-templates.json terrain-layouts.json; do
  echo "Pulling ${file} from ${repo}@${branch}..."
  curl -fsSL "${base}/${file}" -o "${dest_dir}/${file}"
done

echo "Pulled terrain JSON into ${dest_dir}"
