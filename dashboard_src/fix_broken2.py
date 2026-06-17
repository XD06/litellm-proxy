import re
with open('src/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# I need to fix lines like:
# if (").forEach((btn) => {.dataset.bounddatatrafficmode) return;
# ").forEach((btn) => {.dataset.bounddatatrafficmode = "1";
# 
# The variable name should just be the thing inside the parens: btn

def fix_line(match):
    # Match: if (").forEach((btn) => {.dataset...
    varname = match.group(1)
    dataset_key = match.group(2)
    return f"if ({varname}.dataset.{dataset_key}) return;\n      {varname}.dataset.{dataset_key} = '1';"

# re.sub(r'if \("\)\.forEach\(\(([^)]+)\)\s*=>\s*\{\.dataset\.([^)]+)\) return;\s*"\)\.forEach\(\(\1\)\s*=>\s*\{\.dataset\.\2 = "1";', fix_line, content)

content = re.sub(r'if \("\)\.forEach\(\(([^)]+)\)\s*=>\s*\{\.(dataset\.[a-zA-Z0-9]+)\) return;\s*"\)\.forEach\(\(\1\)\s*=>\s*\{\.\2 = "1";',
                 r'if (\1.\2) return;\n      \1.\2 = "1";', content)

with open('src/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
