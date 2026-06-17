import re

with open('src/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r'\.onclick = (async\s*\([^)]*\)\s*=>\s*\{)', r'.addEventListener("click", \1', content)
content = re.sub(r'\.onclick = (\([^)]*\)\s*=>\s*\{)', r'.addEventListener("click", \1', content)
content = re.sub(r'\.onclick = (\(\)\s*=>\s*[^)]+)\)', r'.addEventListener("click", \1)', content)

content = re.sub(r'\.onsubmit = (async\s*\([^)]*\)\s*=>\s*\{)', r'.addEventListener("submit", \1', content)
content = re.sub(r'\.onsubmit = (\([^)]*\)\s*=>\s*\{)', r'.addEventListener("submit", \1', content)

with open('src/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
