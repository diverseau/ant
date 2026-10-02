# Self-hosting Ant

Ant can run continuously on a Linux machine or server with Docker Engine and the
Docker Compose plugin. The container runs antd, serves the built web app, and
starts Claude Code and each ant's headless Chromium when needed. A server that
stays awake keeps routines and channels running when your PC sleeps. Docker on a
PC that sleeps cannot keep that PC's ants running.

## Install and sign in

From the repository root on the Docker host:

```sh
docker compose -f docker/compose.yaml up -d --build
docker compose -f docker/compose.yaml exec -it ant claude
```

In Claude Code, enter `/login` and follow its own sign-in flow. On a remote server,
open the login URL in your own browser and complete the CLI's prompts. Do not put
tokens, API keys, or your host's Claude files into the image or Compose
environment. Login happens inside the container, using the official CLI.

Open <http://127.0.0.1:7420> on the Docker host, or use the SSH tunnel below. Check
the installation with:

```sh
docker compose -f docker/compose.yaml logs --tail=100 ant
docker compose -f docker/compose.yaml exec ant claude auth status
curl --fail http://127.0.0.1:7420/api/health
```

Create an ant, send a message, and open its computer to verify that Claude's
nested sandbox and Chromium work on this host. The image includes bubblewrap,
socat, Chromium and its sandbox helper, screenshot fonts, Git, Python 3, and CA
certificates. It builds the web app with the lockfile and installs the official
Claude Code native CLI as the non-root user. Node 26 runs Ant's TypeScript
directly. No VNC, desktop session, or s6 services are needed by the current browser
implementation.

## Storage and configuration

The Compose project defaults to `ant`. Its named volumes survive container
recreation:

| Volume | Container path | Contents |
| --- | --- | --- |
| `ant-home` | `/home/ant/Ants` | Ant folders, workspaces, memory, browser profiles |
| `ant-data` | `/home/ant/.local/share/ant` | Database, generated settings, private daemon state, file-backed secrets key |
| `ant-claude` | `/home/ant/.claude` | Claude Code's own login and configuration state |

Docker prefixes volume names with the project name, for example `ant_ant-home`.
Use the same `--project-name` for every command if you override it. Backup and
restore scripts accept `--project-name NAME` and `--compose-file FILE` too.

`CLAUDE_CONFIG_DIR` points inside the Claude volume. The home-level
`/home/ant/.claude.json` is also a symlink to
`/home/ant/.claude/.claude.json`, so home-level configuration survives restarts.
The image does not sign in or copy credentials. The login volume stays separate
from the backup format; sign in again when migrating to a fresh host.

The runtime user is `ant`, uid/gid `1000:1000`. New named volumes inherit the
image's ownership. The entrypoint checks write access and makes the three volume
directories private (`0700`). It does not run as root or recursively change
ownership. If you replace named volumes with bind mounts, prepare dedicated
directories owned by uid/gid 1000 on the host before starting. Do not mount your
whole home directory or the Docker socket.

The default model is `sonnet`. For example:

```sh
ANT_MODEL=haiku docker compose -f docker/compose.yaml up -d
```

Inside the container, antd binds `0.0.0.0:7420` so Docker can forward the port. On
the host, the published port binds only `127.0.0.1:7420`. Chromium gets 1 GiB of
shared memory. Compose provides an init process; the image also includes tini
for standalone `docker run`. The daemon restarts unless explicitly stopped.

## Updating

Back up first using the instructions below. Update your repository checkout,
then rebuild and recreate the service:

```sh
docker compose -f docker/compose.yaml build --pull --no-cache ant
docker compose -f docker/compose.yaml up -d ant
```

Using `--no-cache` reruns Anthropic's native installer as well as refreshing the
system packages. Existing volumes, including Claude login state, stay attached.
Check the health endpoint and an ant's browser after an update. Do not use
`docker compose down -v` for updates: it deletes the volumes.

## Backups and restores

The scripts require Bash and Python 3 on the machine running them. Restore needs
Python's `tarfile.data_filter` (Python 3.12+ or a patched 3.11; the container's
Debian Python package must provide it). Run `scripts/backup.sh --help` and
`scripts/restore.sh --help` for options.

Archives have two roots, `Ants/` and `data/`. They include browser profiles and
cookies, but exclude browser caches, Chromium singleton locks, sockets, and other
special files. They exclude the separate Claude login volume. Treat archives as
private: the backup script creates them with mode `0600`, and they can contain
browser logins, conversations, files and connector secrets. Keep them outside
the source folders and encrypt them using your own backup storage system.

Stop antd before either operation and keep it stopped until the script finishes.
The scripts refuse a running Compose `ant` service; in host mode they probe the
Unix socket. If your host installation uses a custom `ANT_SOCKET` or
`XDG_RUNTIME_DIR`, supply that environment when running the scripts. The check
does not prevent another operator or service manager from starting antd midway
through a backup or restore. Stopping it keeps the SQLite database and its WAL,
workspace files and browser profiles consistent.

For a container installation, from the repository root:

```sh
docker compose -f docker/compose.yaml stop ant
scripts/backup.sh --container ./ant-backup.tar.gz
docker compose -f docker/compose.yaml up -d ant
```

Container mode uses `docker compose run --rm --no-deps -T` with the same volumes
and image, as uid 1000. Backup data streams to a temporary archive on the host;
restore streams back into the volumes. It does not publish ports or need a bind
mount for the archive. The image must already be built.

To restore on that host (first back up the current instance):

```sh
docker compose -f docker/compose.yaml stop ant
scripts/restore.sh --container --force ./ant-backup.tar.gz
docker compose -f docker/compose.yaml up -d ant
```

On a fresh host, build the image without starting the daemon, restore without
`--force` into the empty volumes, then start and sign in:

```sh
docker compose -f docker/compose.yaml build ant
scripts/restore.sh --container ./ant-backup.tar.gz
docker compose -f docker/compose.yaml up -d ant
docker compose -f docker/compose.yaml exec -it ant claude
```

For a host installation using the existing systemd user service:

```sh
systemctl --user stop ant.service
scripts/backup.sh ./ant-backup.tar.gz
systemctl --user start ant.service

# Restore later, after backing up the current state:
systemctl --user stop ant.service
scripts/restore.sh --force ./ant-backup.tar.gz
systemctl --user start ant.service
```

Host mode defaults to `~/Ants` and `~/.local/share/ant`, respecting `ANT_HOME`,
`ANT_DATA_DIR` and `XDG_DATA_HOME`. Use `--ant-home DIR --data-dir DIR` for other
locations. A backup without a filename creates a timestamped file in the current
directory. Existing archives are never replaced without `--force`; restore
refuses nonempty target directories without `--force`. Missing or empty targets
are accepted. With `--force`, restore replaces **all contents** of both target
folders, after validating and extracting the complete archive into temporary
storage. It rejects path traversal, special files, and links outside their own
archive root. Absolute workspace symlinks are not portable: replace them with
internal relative links before backup if you need to restore those workspaces.

Restore needs temporary disk space for the unpacked archive (plus a compressed
copy for streamed container restores). Replacing the two destination folders is
not atomic; keep your previous backup so you can recover if disk space runs out
or the process is interrupted.

**Secrets keys:** on a desktop, Ant can keep its encryption key in the OS
keyring. These scripts do not export that key; restoring the database on another
host will not decrypt those secrets without the original key. Re-enter the
secrets or arrange key migration separately. In this container there is no OS
keyring: Ant falls back to a `0600` file, `secrets.key`, in the data volume. That
file is included in the backup if present. The key and encrypted secrets are
therefore stored together; anyone who obtains the volume or archive can decrypt
them. This is file protection, not keyring protection.

Host/container migration also changes filesystem paths. Generated daemon
settings refer to absolute paths; Ant regenerates them when it starts an ant's
turn. User-written scripts or workspace files with host paths need manual
adjustment. Claude login state is never migrated by these scripts.
Claude Code's own transcripts and resumable sessions live in its separate
volume, so they are also excluded. After migration, a missing Claude session
may fail its first resume attempt; Ant clears that session id so the next turn
starts a fresh session. Ant's database history and folder memory remain restored.

## Remote access

Keep the default loopback port publication. From your PC, create an SSH tunnel
to the server:

```sh
ssh -N -L 127.0.0.1:7420:127.0.0.1:7420 user@server
```

Then open <http://127.0.0.1:7420> locally. You can use the server's Tailscale
address or hostname for the SSH connection, keeping access on your private
tailnet. SSH authenticates the connection, and the browser still uses a
localhost origin, which the current Ant API requires.

Never change the host port to `0.0.0.0:7420:7420` without a separate, correctly
configured authentication layer. The current HTTP API has no application login
gate; origin checking is not authentication. Direct Tailscale HTTP access and
public reverse proxies also need backend origin support, outside this setup's
scope. Use the SSH tunnel rather than editing or bypassing those checks.

## Limitations

- Host desktop notifications do not apply in the container. Use the web app or
  configured channels to see activity.
- All ants run as the same OS user inside one container. It is a personal
  instance, not a security boundary between mutually untrusted users or ants.
- `ANT_IN_CONTAINER=1` enables Claude Code's `enableWeakerNestedSandbox`. The
  container is the outer boundary. Host kernel, Docker seccomp and AppArmor
  policies can still prevent bubblewrap or Chromium sandbox startup. Verify
  both with a real turn and browser on your server; do not work around failures
  by using privileged mode or disabling the sandbox.
- This packaging has not been Docker-built or run in the implementation
  sandbox. Native CLI installation, persistent `/login`, nested sandboxing and
  Chromium startup must be verified on a Docker host with network access.
