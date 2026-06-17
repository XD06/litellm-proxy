import re

with open('src/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Restore document and window handlers
content = re.sub(r'document\.onclick = (async\s*\([^)]*\)\s*=>\s*\{)', r'document.addEventListener("click", \1', content)
content = re.sub(r'document\.onclick = (\([^)]*\)\s*=>\s*\{)', r'document.addEventListener("click", \1', content)
content = re.sub(r'document\.onclick = ([\w]+)', r'document.addEventListener("click", \1)', content)

content = re.sub(r'window\.onclick = (async\s*\([^)]*\)\s*=>\s*\{)', r'window.addEventListener("click", \1', content)
content = re.sub(r'window\.onclick = (\([^)]*\)\s*=>\s*\{)', r'window.addEventListener("click", \1', content)
content = re.sub(r'window\.onclick = ([\w]+)', r'window.addEventListener("click", \1)', content)

with open('src/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
