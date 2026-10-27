#!/usr/bin/env python3
"""Initial installation only. Adds one exact Nginx route; never touches the bot."""
import hashlib, json, os, pathlib, secrets, shutil, subprocess, urllib.request

src = pathlib.Path(__file__).resolve().parent
app = pathlib.Path('/opt/rebeca-methods')
config = pathlib.Path('/etc/rebeca-methods')
unit = pathlib.Path('/etc/systemd/system/rebeca-methods.service')
nginx = pathlib.Path('/etc/nginx/sites-available/delamark-vip-api')
expected = 'af4bacd0f5f949cf8187c1a88ca742a7681d194cbeb68d675673fcb547d721d6'
original = nginx.read_bytes()
assert hashlib.sha256(original).hexdigest() == expected, 'Nginx changed; review before installing'
assert not app.exists() and not config.exists() and not unit.exists(), 'Initial installation only'
subprocess.run(['node', '--check', str(src / 'server.mjs')], check=True)
cfg = json.loads(pathlib.Path('/etc/delamark-analysis-vip/config.json').read_text())
assert cfg.get('dbUrl') == 'https://nelrzzyivrmiccxvrjql.supabase.co' and cfg.get('dbKey'), 'Source configuration unavailable'
app.mkdir(mode=0o700)
config.mkdir(mode=0o700)
os.umask(0o077)
(config / 'config.json').write_text(json.dumps({'gatewayKey': secrets.token_hex(32)}) + '\n')
shutil.copy2(src / 'server.mjs', app / 'server.mjs')
shutil.copy2(src / 'rebeca-methods.service', unit)
backup = app / 'nginx-before.conf'
backup.write_bytes(original)
route = '''    # Rebeca: authenticated global lottery history only
    location = /rebeca/historico {
        limit_except POST { deny all; }
        proxy_pass http://127.0.0.1:8801;
        proxy_set_header Host vip-api.delamarkpalpites.com;
        proxy_set_header X-Gateway-Key $http_x_gateway_key;
        proxy_set_header Authorization "";
    }
'''
anchor = '    location / { return 404; }'
assert original.decode().count(anchor) == 1
try:
    subprocess.run(['systemctl', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', 'enable', '--now', 'rebeca-methods'], check=True)
    import time
    for attempt in range(20):
        try:
            health = json.load(urllib.request.urlopen('http://127.0.0.1:8801/health', timeout=2))
            assert health.get('service') == 'rebeca-methods'
            break
        except Exception:
            if attempt == 19: raise
            time.sleep(.25)
    nginx.write_text(original.decode().replace(anchor, route + anchor))
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    print('INSTALLED: rebeca-methods active; exact HTTPS route added; nginx reloaded')
except Exception:
    nginx.write_bytes(original)
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    subprocess.run(['systemctl', 'disable', '--now', 'rebeca-methods'], check=False)
    raise
