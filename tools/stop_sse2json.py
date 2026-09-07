import subprocess

result = subprocess.run(
    ['wmic', 'process', 'where',
     "name='python.exe' or name='python3.exe'",
     'get', 'processid,commandline', '/format:csv'],
    capture_output=True, text=True
)
killed = 0
for line in result.stdout.splitlines():
    line = line.strip()
    if 'sse2json.py' in line.lower():
        parts = line.split(',')
        if len(parts) >= 3:
            try:
                pid = int(parts[-1].strip())
                subprocess.run(['taskkill', '/PID', str(pid), '/F'],
                               capture_output=True)
                print(f'[stop_proxy] Stopped PID {pid} (sse2json.py)')
                killed += 1
            except Exception as e:
                print(f'Error: {e}')
if killed == 0:
    print('[stop_proxy] No running sse2json.py process found.')