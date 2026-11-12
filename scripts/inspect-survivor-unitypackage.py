#!/usr/bin/env python3
"""Read author-provided .unitypackage METADATA ONLY. Never run Unity scripts.

Unity .unitypackage is gzipped tar of GUID/asset, GUID/pathname pairs.
We do not extract or execute its files, and do not assume third-party clips
are licensed without an independent provenance review.
"""
import json
import tarfile
from collections import Counter
from pathlib import Path

root=Path('survivor-source-audit')
archive=root/'ZombieApocalypseSurvivorMale.unitypackage'
if not archive.is_file() or archive.stat().st_size>30_000_000:
    raise RuntimeError('Missing or oversized creator-hosted Unity package')
paths=[]
with tarfile.open(archive,mode='r:gz') as tar:
    members=tar.getmembers()
    if not members or len(members)>10000:
        raise RuntimeError('Unexpected Unity package member count')
    for item in members:
        if item.isfile() and item.name.endswith('/pathname'):
            if item.size>8192 or item.size<1:
                raise RuntimeError('Unreasonably long Unity manifest pathname')
            file=tar.extractfile(item)
            if file is None:
                continue
            pathname=file.read(8193).decode('utf-8','replace').strip()
            if len(pathname)>2048 or pathname.startswith('/') or '..' in Path(pathname).parts:
                raise RuntimeError('Unexpected unsafe Unity package pathname')
            paths.append(pathname)
extensions=Counter(Path(s).suffix.lower() for s in paths)
notable=[p for p in paths if Path(p).suffix.lower() in
        {'.fbx','.anim','.controller','.png','.jpg','.jpeg','.prefab','.mat','.unity','.cs','.asset','.txt'}]
locomotion=[s for s in paths if Path(s).suffix.lower() in {'.anim','.fbx'}
            and any(keyword in Path(s).stem.lower() for keyword in ('walk','run','jump','idle'))]
summary={
    'status':'SOURCE_PACKAGE_FILENAMES_ONLY_NOT_LICENSED_FOR_REUSE',
    'authorPackage':archive.name,
    'records':len(paths),
    'extensions':dict(sorted(extensions.items())),
    'locomotionCandidates':locomotion[:120],
    'selectedPathnames':notable[:200],
    'note':'Only asset paths are inspected. Authorship, animation quality, and third-party Unity or Mixamo licensing MUST be checked before any asset is used or shipped.'
}
(root/'unity-package-audit.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
