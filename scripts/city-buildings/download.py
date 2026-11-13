import os,json,urllib.request,zipfile,io
T=os.environ["SKETCHFAB_API_TOKEN"]  # never print or commit the token
M={'b7':'b26b4ace15bd48259fcf235d31eec7c8','b10':'08f1f006b4bb4e04831555cfc1a3ea49','b11':'d3029779c7e54ee6afa3890b42a32098','b4':'a07af3b8c6c045d89a37a3b3cde7be1b','b1':'570874c83da24c788c0f247a51a6814d','b6':'e1ec43d7bf1146789553000f49e7e060','b5':'01bbf6d3b3424694b4c6a1e4693af104'}
def get(u,auth=True):
  h={'Authorization':'Token '+T} if auth else {}
  return urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=300)
meta={}
for k,uid in M.items():
  d=json.load(get('https://api.sketchfab.com/v3/models/'+uid))
  lic=d['license'] or {}
  meta[k]=dict(uid=uid,title=d['name'],creator=d['user']['displayName'],username=d['user']['username'],profile=d['user']['profileUrl'],url=d['viewerUrl'],license=lic.get('label'),licslug=lic.get('slug'),licurl=lic.get('url'),faces=d['faceCount'],verts=d['vertexCount'],downloadable=d.get('isDownloadable'))
  print(k,meta[k]['title'],meta[k]['creator'],meta[k]['licslug'],d['faceCount'],flush=True)
  if (meta[k]['licslug'] or '') not in ('by','cc0'): print('SKIP license');continue
  if os.path.exists(k+'.glb'): continue
  dl=json.load(get(f'https://api.sketchfab.com/v3/models/{uid}/download'))
  if 'glb' in dl:
    b=get(dl['glb']['url'],False).read();open(k+'.glb','wb').write(b);meta[k]['glbBytes']=len(b)
  else:
    z=zipfile.ZipFile(io.BytesIO(get(dl['gltf']['url'],False).read()));z.extractall(k)
json.dump(meta,open('meta.json','w'),indent=1)
