#!/usr/bin/env bash
# Validate and stage a tar backup before replacing a stopped instance's data.
set -euo pipefail
umask 077
export ANT_RESTORE_REPO_ROOT
ANT_RESTORE_REPO_ROOT=$(cd -- "$(dirname -- "$0")/.." && pwd)

exec python3 /dev/fd/3 "$@" 3<<'PY'
import argparse
import errno
import os
from pathlib import Path, PurePosixPath
import shutil
import socket
import stat
import subprocess
import sys
import tarfile
import tempfile

root = Path(os.environ['ANT_RESTORE_REPO_ROOT'])
parser = argparse.ArgumentParser(prog='scripts/restore.sh', description='Restore a gzip tar backup into a stopped Ant instance. Existing nonempty folders require --force.')
parser.add_argument('archive', help='backup file; - reads from stdin')
parser.add_argument('--container', action='store_true', help='restore the ant-home and ant-data Compose volumes instead of host folders')
parser.add_argument('--compose-file', default=str(root / 'docker/compose.yaml'), help='Compose file for container mode')
parser.add_argument('--project-name', help='Compose project name, if overridden when starting Ant')
parser.add_argument('--ant-home', default=os.environ.get('ANT_HOME', str(Path.home() / 'Ants')), help='host ant folders (default: ANT_HOME or ~/Ants)')
parser.add_argument('--data-dir', default=os.environ.get('ANT_DATA_DIR', str(Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local/share'))) / 'ant')), help='host state directory (default: ANT_DATA_DIR or XDG_DATA_HOME/ant)')
parser.add_argument('--force', action='store_true', help='replace ALL contents of both target folders after validation')
args = parser.parse_args()

def fail(message):
    raise RuntimeError(message)

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
            fail('Stop antd before restoring (including any user service).')

def checked_target(value):
    path = Path(value).expanduser().absolute()
    if path.is_symlink() or (path.exists() and not path.is_dir()):
        fail('Target must be a real directory: ' + str(path))
    path = path.resolve()
    # An explicit path typo with --force must not wipe a home or source tree.
    if any(protected.is_relative_to(path) for protected in [Path.home().resolve(), root.resolve(), Path.cwd().resolve()]):
        fail('Refusing a home, current directory, source tree, or its ancestor as a restore target: ' + str(path))
    if path.exists() and any(path.iterdir()) and not args.force:
        fail('Target is not empty: ' + str(path) + '; back it up first, then use --force to replace it.')
    return path

def validated_members(archive):
    members = archive.getmembers()
    roots = set()
    for member in members:
        path = PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0] not in {'Ants', 'data'}:
            fail('Unsafe or unexpected archive member: ' + member.name)
        if not (member.isfile() or member.isdir() or member.issym() or member.islnk()):
            fail('Special files are not allowed in a backup: ' + member.name)
        if len(path.parts) == 1:
            if not member.isdir() or path.parts[0] in roots:
                fail('Archive roots must be unique directories.')
            roots.add(path.parts[0])
        if member.issym() or member.islnk():
            target = PurePosixPath(member.linkname)
            if target.is_absolute():
                fail('Absolute links cannot be restored: ' + member.name)
            combined = target if member.islnk() else path.parent / target
            normalized = []
            for part in combined.parts:
                if part == '..':
                    if not normalized:
                        fail('Link escapes backup: ' + member.name)
                    normalized.pop()
                elif part != '.':
                    normalized.append(part)
            if not normalized or normalized[0] != path.parts[0]:
                fail('Links must stay within their own backup root: ' + member.name)
        # Generated socket paths and Chromium singleton links are stale on restore.
        if path.name == 'antd.sock' or ('browser' in path.parts and path.name.startswith('Singleton')):
            fail('Archive contains stale runtime files: ' + member.name)
    if roots != {'Ants', 'data'}:
        fail('Expected both Ants/ and data/ in the backup.')
    return members

def main():
    if args.container:
        if '--ant-home' in sys.argv or '--data-dir' in sys.argv or any(a.startswith(('--ant-home=', '--data-dir=')) for a in sys.argv):
            fail('--ant-home and --data-dir are host-only options; container paths come from the supplied Compose layout.')
        command = ['docker', 'compose', '-f', args.compose_file]
        if args.project_name:
            command += ['--project-name', args.project_name]
        running = subprocess.run(command + ['ps', '--status', 'running', '--services', 'ant'], check=True, capture_output=True, text=True)
        if running.stdout.strip():
            fail('Stop the ant Compose service before restoring; this script does not stop it automatically.')
        command += ['run', '--rm', '--no-deps', '-T', '--entrypoint', '/bin/bash', 'ant', '/opt/ant/scripts/restore.sh', '--ant-home', '/home/ant/Ants', '--data-dir', '/home/ant/.local/share/ant']
        if args.force:
            command.append('--force')
        command.append('-')
        if args.archive == '-':
            subprocess.run(command, stdin=sys.stdin.buffer, check=True)
        else:
            with Path(args.archive).expanduser().open('rb') as source:
                subprocess.run(command, stdin=source, check=True)
        return

    targets = [checked_target(args.ant_home), checked_target(args.data_dir)]
    if any(a.is_relative_to(b) for a, b in [(targets[0], targets[1]), (targets[1], targets[0])]):
        fail('Ant home and data directory must be separate, non-overlapping directories.')
    check_stopped(targets[1])
    if args.archive != '-' and any(Path(args.archive).expanduser().resolve().is_relative_to(target) for target in targets):
        fail('Move the archive outside the restore targets first.')
    if not hasattr(tarfile, 'data_filter'):
        fail('Restore needs Python with tarfile.data_filter (Python 3.12+ or a patched 3.11).')
    with tempfile.TemporaryDirectory(prefix='ant-restore-') as temporary:
        stage = Path(temporary)
        archive_path = Path(args.archive).expanduser() if args.archive != '-' else stage / 'backup.tar.gz'
        if args.archive == '-':
            with archive_path.open('wb') as spool:
                shutil.copyfileobj(sys.stdin.buffer, spool)
        extracted = stage / 'extracted'
        extracted.mkdir(mode=0o700)
        with tarfile.open(archive_path, mode='r:gz') as archive:
            members = validated_members(archive)
            # The standard data filter also blocks symlink chains, external
            # hardlinks and privileged modes while extracting into fresh staging.
            archive.extractall(extracted, members=members, filter='data')
        for target, name in zip(targets, ['Ants', 'data']):
            # Recheck just before replacing. Keep the top-level directory itself:
            # it may be a Docker volume mount and cannot be renamed or removed.
            checked_target(str(target))
            target.mkdir(mode=0o700, parents=True, exist_ok=True)
            target.chmod(0o700)
            for child in target.iterdir():
                if child.is_symlink() or not child.is_dir():
                    child.unlink()
                else:
                    shutil.rmtree(child)
            shutil.copytree(extracted / name, target, symlinks=True, dirs_exist_ok=True)
            target.chmod(0o700)
    print('Restored Ant folders and data. Restart antd when ready.', file=sys.stderr)
    print('Claude login state was not restored. Host keyring secrets need the original OS keyring key.', file=sys.stderr)

try:
    main()
except (OSError, EOFError, RuntimeError, tarfile.TarError, subprocess.CalledProcessError) as error:
    print('restore: ' + str(error), file=sys.stderr)
    sys.exit(1)
PY
