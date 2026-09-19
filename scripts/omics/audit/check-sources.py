"""Read-only public-source verification. Writes receipts, never catalogue records."""
import argparse, concurrent.futures, datetime, hashlib, ipaddress, json, pathlib, socket, urllib.request, urllib.parse
p=argparse.ArgumentParser();p.add_argument('catalogue');p.add_argument('output');p.add_argument('--cache',required=True);a=p.parse_args()
cache=pathlib.Path(a.cache);cache.mkdir(parents=True,exist_ok=True)
records=json.load(open(a.catalogue))['records'];sources=[r for r in records if r['kind']=='source']
def safe(url):
 u=urllib.parse.urlsplit(url)
 if u.scheme not in ('https','http') or u.username or u.password or not u.hostname:raise ValueError('Unsafe source URL')
 for info in socket.getaddrinfo(u.hostname,u.port or (443 if u.scheme=='https' else 80),type=socket.SOCK_STREAM):
  if not ipaddress.ip_address(info[4][0]).is_global:raise ValueError('Non-public source destination')
 return url
class Redirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):return super().redirect_request(req,fp,code,msg,headers,safe(newurl))
opener=urllib.request.build_opener(Redirect())
def check(r):
 at=r['attributes'];url=at.get('artifact_url') or at.get('url');out={'source_id':r['id'],'url':url,'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'expected_sha256':at.get('artifact_sha256'),'method':'automated public artifact retrieval; not scientific claim verification'}
 try:
  req=urllib.request.Request(safe(url),headers={'User-Agent':'rewire-source-audit/1.0 (https://benchmarks.rewire.it/evidence/)'})
  with opener.open(req,timeout=20) as response:
   content=response.read(25_000_001);out.update(http_status=response.status,final_url=response.url,content_type=response.headers.get('Content-Type'))
  if len(content)>25_000_000:raise ValueError('Artifact exceeds 25 MB retrieval budget; needs targeted retrieval')
  h=hashlib.sha256(content).hexdigest();out.update(retrieved_sha256=h,bytes=len(content),outcome='supported' if h==out['expected_sha256'] else 'insufficient_evidence',reason='Exact pinned artifact bytes retrieved' if h==out['expected_sha256'] else 'Accessible resource, but pinned byte identity not established; dynamic responses and corrections require review')
  target=cache/h
  if not target.exists():target.write_bytes(content)
 except Exception as e:out.update(outcome='inaccessible',reason=str(e)[:350])
 return out
out=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 for i,row in enumerate(pool.map(check,sources),1):
  out.append(row)
  if i%50==0:print(f'{i}/{len(sources)} sources checked',flush=True)
pathlib.Path(a.output).parent.mkdir(parents=True,exist_ok=True)
pathlib.Path(a.output).write_text(''.join(json.dumps(r,sort_keys=True)+'\n' for r in out))
print(json.dumps({'sources':len(out),'outcomes':{s:sum(r['outcome']==s for r in out) for s in ['supported','insufficient_evidence','inaccessible']}}))
