
import json
import os
import sys
import datetime
import subprocess

def get_git_hash():
    try:
        return subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], encoding='utf-8').strip()
    except Exception:
        return "nohash"

def get_current_base_version(workspace_root):
    try:
        with open(os.path.join(workspace_root, 'package.json'), 'r', encoding='utf-8') as f:
            data = json.load(f)
            version = data.get('version', '0.0.0')
            # Extract base version (e.g., 0.30.0 from 0.30.0-nightly...)
            return version.split('-')[0]
    except Exception:
        return "0.0.0"

def set_version(new_version, dry_run=False):
    """
    Updates the version in all relevant package.json files and package-lock.json.
    """
    workspace_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    
    if new_version in ['dev', 'nightly']:
        base = get_current_base_version(workspace_root)
        now = datetime.datetime.now()
        date = now.strftime("%Y%m%d")
        # Calculate milliseconds since the start of the day
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        ms_since_start_of_day = int((now - start_of_day).total_seconds() * 1000)
        new_version = f"{base}-{new_version}.{date}.{ms_since_start_of_day}"

    # Files to update specifically for sandboxImageUri
    sandbox_uri_files = [
        "package.json",
        "packages/cli/package.json"
    ]

    # 1. Update all package.json files (excluding third_party and node_modules)
    for root, dirs, files in os.walk(workspace_root):
        # Skip certain directories
        if 'node_modules' in dirs:
            dirs.remove('node_modules')
        if 'dist' in dirs:
            dirs.remove('dist')
        if 'third_party' in dirs:
            dirs.remove('third_party')
        
        for file in files:
            if file == 'package.json':
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, workspace_root)
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)

                    old_version = data.get('version')
                    if old_version == new_version:
                        continue

                    if not dry_run:
                        data['version'] = new_version

                        # Update sandboxImageUri if this file is in our list
                        if rel_path.replace('\\', '/') in sandbox_uri_files:
                            if 'config' in data and 'sandboxImageUri' in data['config']:
                                uri = data['config']['sandboxImageUri']
                                if ':' in uri:
                                    parts = uri.split(':')
                                    parts[-1] = new_version
                                    data['config']['sandboxImageUri'] = ':'.join(parts)

                        with open(file_path, 'w', encoding='utf-8', newline='\n') as f:
                            json.dump(data, f, indent=2)
                            f.write('\n')

                    print(f"{'[DRY RUN] ' if dry_run else ''}Updated version in {rel_path} from {old_version} to {new_version}")

                except Exception as e:
                    print(f"Error updating {file_path}: {e}")

    # 2. Update package-lock.json if it exists
    lockfile_path = os.path.join(workspace_root, 'package-lock.json')
    if os.path.exists(lockfile_path):
        try:
            with open(lockfile_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if not dry_run:
                data['version'] = new_version
                if 'packages' in data:
                    if '' in data['packages']:
                        data['packages']['']['version'] = new_version
                    
                    # Update local workspace packages
                    for pkg_path, pkg_info in data['packages'].items():
                        if pkg_path.startswith('packages/') and 'version' in pkg_info:
                            # Only update if it's one of our packages (check if it has a package.json in the filesystem)
                            pkg_json_path = os.path.join(workspace_root, pkg_path, 'package.json')
                            if os.path.exists(pkg_json_path):
                                pkg_info['version'] = new_version

                with open(lockfile_path, 'w', encoding='utf-8', newline='\n') as f:
                    json.dump(data, f, indent=2)
                    f.write('\n')
            
            print(f"{'[DRY RUN] ' if dry_run else ''}Updated version in package-lock.json to {new_version}")

        except Exception as e:
            print(f"Error updating package-lock.json: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python set-version.py <new_version> [--dry-run]")
        sys.exit(1)

    new_version_arg = sys.argv[1]
    is_dry_run = "--dry-run" in sys.argv
    set_version(new_version_arg, is_dry_run)
