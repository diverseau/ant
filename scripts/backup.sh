#!/usr/bin/env bash
# A stopped-instance tar backup. No Claude login state or OS keyring export.
set -euo pipefail
umask 077
export ANT_BACKUP_REPO_ROOT
ANT_BACKUP_REPO_ROOT=$(cd -- "$(dirname -- "$0")/.." && pwd)

# Keep stdin available for the matching restore script's container transport.
exec python3 /dev/fd/3 "$@" 3<<'PY'
import argparse
import datetime
import errno
import os
from pathlib import Path
import socket
import stat
import subprocess
import sys
import tarfile
import tempfile

root = Path(os.environ['ANT_BACKUP_REPO_ROOT'])
parser = argparse.ArgumentParser(prog='scripts/backup.sh', description='Back up a stopped Ant instance to a private gzip tar archive.')
parser.add_argument('archive', nargs='?', default='ant-backup-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.tar.gz', help='output file (default: timestamped file in the current directory; - streams to stdout)')
parser.add_argument('--container', action='store_true', help='read the ant-home and ant-data Compose volumes instead of host folders')
parser.add_argument('--compose-file', default=str(root / 'docker/compose.yaml'), help='Compose file for container mode')
parser.add_argument('--project-name', help='Compose project name, if overridden when starting Ant')
parser.add_argument('--ant-home', default=os.environ.get('ANT_HOME', str(Path.home() / 'Ants')), help='host ant folders (default: ANT_HOME or ~/Ants)')
parser.add_argument('--data-dir', default=os.environ.get('ANT_DATA_DIR', str(Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local/share'))) / 'ant')), help='host state directory (default: ANT_DATA_DIR or XDG_DATA_HOME/ant)')
parser.add_argument('--force', action='store_true', help='replace an existing regular archive file')
args = parser.parse_args()

def fail(message):
    raise RuntimeError(message)

def compose():
    command = ['docker', 'compose', '-f', args.compose_file]
    if args.project_name:
        command += ['--project-name', args.project_name]
    running = subprocess.run(command + ['ps', '--status', 'running', '--services', 'ant'], check=True, capture_output=True, text=True)
    if running.stdout.strip():
        fail('Stop the ant Compose service before backing up; this script does not stop it automatically.')
    return command

def check_stopped(data):
    socket_path = os.environ.get('ANT_SOCKET', str(Path(os.environ.get('XDG_RUNTIME_DIR', str(data))) / 'antd.sock'))
    try:
        mode = Path(socket_path).lstat().st_mode
    except FileNotFoundError:
        return
    if not stat.S_ISSOCK(mode):
        fail('Expected a Unix socket at ' + socket_path + '; refusing to assume antd is stopped.')
    with socket.socket(socket.AF_UNIX) as probe:
        probe.settimeout(1)
        try:
            probe.connect(socket_path)
        except OSError as error:
            if error.errno not in (errno.ENOENT, errno.ECONNREFUSED):
                fail('Cannot verify that antd is stopped: ' + str(error))
        else:
            fail('Stop antd before backing up (including any user service).')

def include(member):
    parts = Path(member.name).parts
    # Keep cookies, bookmarks and other profile state; discard only rebuildable
    # caches and stale Chromium locks. Never dereference workspace symlinks.
    cache_names = {'Cache', 'Code Cache', 'GPUCache', 'ShaderCache', 'GrShaderCache', 'DawnCache', 'GraphiteDawnCache', 'CacheStorage'}
    if 'browser' in parts and (cache_names.intersection(parts) or any(p.startswith('Singleton') for p in parts)):
        return None
    if not (member.isfile() or member.isdir() or member.issym() or member.islnk()):
        return None
    return member

def write_backup(output, sources, command):
    if command is not None:
        subprocess.run(command + ['run', '--rm', '--no-deps', '-T', '--entrypoint', '/bin/bash', 'ant', '/opt/ant/scripts/backup.sh', '--ant-home', '/home/ant/Ants', '--data-dir', '/home/ant/.local/share/ant', '-'], stdout=output, check=True)
    else:
        with tarfile.open(fileobj=output, mode='w|gz', dereference=False) as archive:
            for source, name in sources:
                archive.add(source, arcname=name, filter=include)

def main():
    if args.container and ('--ant-home' in sys.argv or '--data-dir' in sys.argv or any(a.startswith(('--ant-home=', '--data-dir=')) for a in sys.argv)):
        fail('--ant-home and --data-dir are host-only options; container paths come from the supplied Compose layout.')
    command = compose() if args.container else None
    sources = []
    if command is None:
        for value, name in [(args.ant_home, 'Ants'), (args.data_dir, 'data')]:
            source = Path(value).expanduser()
            if source.is_symlink() or not source.is_dir():
                fail('Expected a real directory: ' + str(source))
            sources.append((source.resolve(), name))
        if sources[0][0] == sources[1][0] or any(a.is_relative_to(b) for a, b in [(sources[0][0], sources[1][0]), (sources[1][0], sources[0][0])]):
            fail('Ant home and data directory must be separate, non-overlapping directories.')
        check_stopped(sources[1][0])
    if args.archive == '-':
        write_backup(sys.stdout.buffer, sources, command)
    else:
        destination = Path(args.archive).expanduser().absolute()
        if any(destination.resolve().is_relative_to(source) for source, _ in sources):
            fail('Write the archive outside the directories being backed up.')
        if destination.is_symlink() or (destination.exists() and not destination.is_file()):
            fail('Archive destination must not be a symlink or special file.')
        if destination.exists() and not args.force:
            fail('Archive already exists; choose another name or use --force.')
        # Publish only a complete archive. A hard link makes the no-force case
        # atomic even if another process creates the destination while we work.
        fd, temporary = tempfile.mkstemp(prefix='.ant-backup-', dir=destination.parent)
        try:
            with os.fdopen(fd, 'wb') as output:
                write_backup(output, sources, command)
                output.flush()
                os.fsync(output.fileno())
            if args.force:
                os.replace(temporary, destination)
            else:
                os.link(temporary, destination)
            print('Backup: ' + str(destination), file=sys.stderr)
        finally:
            Path(temporary).unlink(missing_ok=True)
    print('Claude login state is excluded. A key held in the host OS keyring is not exported; a data-directory secrets.key is included if present.', file=sys.stderr)

try:
    main()
except (OSError, EOFError, RuntimeError, tarfile.TarError, subprocess.CalledProcessError) as error:
    print('backup: ' + str(error), file=sys.stderr)
    sys.exit(1)
PY
