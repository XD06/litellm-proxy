import re

with open('src/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the broken string
content = re.sub(r'root\.querySelectorAll\("([^"]+)"\)\.forEach\(\("\)\.forEach\(\(([^)]+)\)\s*=>\s*\{\)\s*=>\s*\{', r'root.querySelectorAll("\1").forEach((\2) => {', content)
content = re.sub(r'target\.querySelectorAll\("([^"]+)"\)\.forEach\(\("\)\.forEach\(\(([^)]+)\)\s*=>\s*\{\)\s*=>\s*\{', r'target.querySelectorAll("\1").forEach((\2) => {', content)

with open('src/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
