#!/usr/bin/env python3
"""Export and validate a derived-facts-only public snapshot. Python stdlib only."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import getpass
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
COPY_FILES = ('index.html', 'styles.css', 'core.js', 'app.js', 'data.json')
DOC_FILES = set(COPY_FILES) | {'about.html', '.nojekyll'}
REPO_FILES = {f'docs/{n}' for n in DOC_FILES} | {'README.md', '.gitignore', 'tools/export-public.py', 'tests/test-core.cjs'}
DATA_KEYS = {'schema_version','generated_at','batch_id','registered_date','disclosure','samples','dimensions','status_definitions','observations','evidence','comparison','cost','cost_phase2','version_linkage','bias','tasks','phase2','phase3','cost_phase3'}
FORBIDDEN_KEYS = {'source_code','raw_source','excerpt','cookie','cookies','oauth','access_token','refresh_token','password','secret','api_key','raw_bundle','source_map'}
SENSITIVE = [r'/(?:Users|home|private|tmp)/', r'https?://(?:chatgpt\.com/(?:space|s|c)/|[^/\s]*sites[^/\s]*openai[^/\s]*/)', r'page_[a-f0-9]{20,}', r'(?m)^-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----$', r'\b(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]+', r'\bBearer\s+[A-Za-z0-9._-]+', r'rawbundles[/\\]']

def walk(value, where='$'):
    if isinstance(value, dict):
        for key, child in value.items():
            assert key.lower() not in FORBIDDEN_KEYS, f'Forbidden data field: {where}.{key}'
            yield from walk(child, f'{where}.{key}')
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk(child, f'{where}[{index}]')
    elif isinstance(value, str):
        yield where, value

def validate():
    files = {p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*') if p.is_file() and '.git' not in p.relative_to(ROOT).parts}
    assert files == REPO_FILES, f'Unexpected or missing files: {files ^ REPO_FILES}'
    # Scan every published repository file, including documentation, tests and exporter.
    username = getpass.getuser()
    patterns = SENSITIVE + ([r'\b' + re.escape(username) + r'\b'] if username not in {'root','runner','nobody'} else [])
    for name in files:
        path = ROOT / name
        assert not path.is_symlink(), f'Symlink forbidden: {name}'
        content = path.read_text(encoding='utf-8')
        for pattern in patterns:
            assert not re.search(pattern, content, re.I), f'Sensitive pattern in {name}: {pattern}'
    docs = ROOT / 'docs'
    for name in DOC_FILES:
        content = (docs / name).read_text(encoding='utf-8')
        for url in re.findall(r'(?:href|src)=["\']([^"\']+)["\']', content) if name.endswith('.html') else []:
            if url.startswith(('#','https://','http://')):
                continue
            assert not url.startswith(('data:', 'javascript:', '//')), f'Unsafe URL in {name}'
            assert (docs / urlsplit(url).path).is_file(), f'Missing local link: {name} -> {url}'
    data = json.loads((docs / 'data.json').read_text())
    assert set(data) <= DATA_KEYS, f'Unreviewed schema keys: {set(data) - DATA_KEYS}'
    for where, value in walk(data):
        assert not re.search(r'function\s*\([^)]*\)\s*\{|\bclass\s+\w+\s*\{', value), f'Embedded code: {where}'
        for url in re.findall(r'https?://[^\s"<>]+', value):
            parsed = urlsplit(url)
            assert not parsed.username and not parsed.password, f'Credential URL: {where}'
            assert not re.search(r'(?:access_token|api_key|secret|password|oauth|token)=', parsed.query, re.I), f'Credential query: {where}'
    ids = [s['sample_id'] for s in data['samples']]
    assert len(ids) == len(set(ids)) == 10
    assert sum(len(d['fields']) for d in data['dimensions']) == 96
    counts = Counter(o['status'] for o in data['observations'])
    findings = data['phase2']['version_summary']['version_findings']
    return {'samples':len(ids), 'fields_per_sample':96, 'observation_status_counts':dict(counts), 'version_modules':{'same':findings['equal_modules'],'changed':findings['changed_existing_modules'],'new':len(findings['new_modules'])},'verified_gameplay_cycles':data['phase2']['runtime_summary']['verified_gameplay_cycles'],'phase3_acceptance':{'verified_steps':data['phase3']['verified_step_count'],'required_steps':data['phase3']['required_step_count'],'full_delivery_accepted':data['phase3']['full_delivery_accepted'],'actual_loaded_response_sha256':data['phase3']['version_gate']['actual_loaded_response_sha256']},'files':[{'path':n,'bytes':(ROOT/n).stat().st_size,'sha256':hashlib.sha256((ROOT/n).read_bytes()).hexdigest()} for n in sorted(files)],'checks':['exact repository file allowlist','no symlinks in any public repository file','local links resolve','all public repository files scanned for personal username, private identifiers and credential patterns','derived-data schema and forbidden-field scan','no embedded game source or raw bundles','sample and field count checks']}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, help='Prepared private site/dist snapshot; defaults to validation only')
    parser.add_argument('--audit', type=Path, help='Optional audit path outside the public repository')
    args = parser.parse_args()
    started = datetime.now(timezone.utc).isoformat()
    if args.source:
        source = args.source.resolve()
        for name in COPY_FILES:
            source_file = source / name
            assert source_file.is_file() and not source_file.is_symlink(), f'Missing or symlink source: {name}'
            text = source_file.read_text(encoding='utf-8')
            if name == 'index.html':
                text = re.sub(r'<a\b[^>]*href="https://chatgpt\.com/space/[^"\s]+"[^>]*>.*?</a>', '<a href="about.html">研究说明 ↗</a>', text)
                assert 'href="about.html"' in text, 'Research information link missing'
            (ROOT / 'docs' / name).write_text(text, encoding='utf-8')
    report = validate()
    report.update({'started_at_utc':started,'completed_at_utc':datetime.now(timezone.utc).isoformat(),'scope':'Public static snapshot export and local verification; publishing is handled separately.','source':'site/dist','third_party_raw_assets_copied':False})
    if args.audit:
        assert ROOT not in args.audit.resolve().parents, 'Audit must remain outside public repository'
        args.audit.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
