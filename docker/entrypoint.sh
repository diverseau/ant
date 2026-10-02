#!/usr/bin/env bash
# Ported from hermes-agent docker/stage2-hook.sh @ 54bc5e50 (MIT, Nous Research)
set -euo pipefail
umask 077

if [[ $(id -u) != 1000 ]]; then
  echo 'Ant must run as the image user ant (uid 1000).' >&2
  exit 1
fi

# New named volumes inherit these directories from the image. Bind mounts must
# already belong to uid/gid 1000; do not change ownership of arbitrary host data.
for dir in "$ANT_HOME" "$ANT_DATA_DIR" "$CLAUDE_CONFIG_DIR"; do
  if [[ -L "$dir" ]]; then
    echo "Refusing symlinked volume directory: $dir" >&2
    exit 1
  fi
  mkdir -p -- "$dir"
  if [[ ! -w "$dir" || ! -x "$dir" ]]; then
    echo "Ant cannot write $dir; prepare the mount for uid/gid 1000:1000." >&2
    exit 1
  fi
  chmod 0700 -- "$dir"
done

exec "$@"
