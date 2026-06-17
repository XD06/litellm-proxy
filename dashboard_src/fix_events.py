import re

with open('src/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace .addEventListener("click", async () => { or (event) => {
# with .onclick = async () => { or (event) => {
content = re.sub(
    r'\.addEventListener\(\"click\",\s*(async\s*\([^)]*\)\s*=>\s*\{)',
    r'.onclick = \1',
    content
)
content = re.sub(
    r'\.addEventListener\(\"click\",\s*(\([^)]*\)\s*=>\s*\{)',
    r'.onclick = \1',
    content
)
content = re.sub(
    r'\.addEventListener\(\"click\",\s*(\(\)\s*=>\s*[^)]+)\)',
    r'.onclick = \1',
    content
)

content = re.sub(
    r'\.addEventListener\(\"submit\",\s*(async\s*\([^)]*\)\s*=>\s*\{)',
    r'.onsubmit = \1',
    content
)
content = re.sub(
    r'\.addEventListener\(\"submit\",\s*(\([^)]*\)\s*=>\s*\{)',
    r'.onsubmit = \1',
    content
)

with open('src/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
