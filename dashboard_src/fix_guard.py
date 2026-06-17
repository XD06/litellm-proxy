import re

with open('src/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# For every function bindXXX(root) { root.querySelectorAll("[data-XXX]").forEach((el) => { 
# add if (el.dataset.boundXXX) return; el.dataset.boundXXX = '1';

def replacer(match):
    prefix = match.group(1)
    selector = match.group(2)
    varname = match.group(3)
    
    # generate a safe dataset key from selector
    key = re.sub(r'[^a-zA-Z0-9]', '', selector)
    return f'{prefix}{selector}").forEach(({varname}) => {{\n      if ({varname}.dataset.bound{key}) return;\n      {varname}.dataset.bound{key} = "1";'

content = re.sub(r'(root\.querySelectorAll\(")([^"]+)("\)\.forEach\(([^)]+)\)\s*=>\s*\{)', replacer, content)
content = re.sub(r'(target\.querySelectorAll\(")([^"]+)("\)\.forEach\(([^)]+)\)\s*=>\s*\{)', replacer, content)

with open('src/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
