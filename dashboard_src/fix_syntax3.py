import re

with open('src/app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open('src/app.js', 'w', encoding='utf-8') as f:
    for line in lines:
        if "addEventListener(" in line and "() =>" in line:
            stripped = line.rstrip()
            if stripped.endswith(");") and not stripped.endswith("));") and not stripped.endswith("});"):
                # E.g. setView(...); -> setView(...));
                line = stripped[:-2] + "));\n"
            elif stripped.endswith(";") and not stripped.endswith(");"):
                # E.g. setView(...) -> setView(...));
                line = stripped[:-1] + "));\n"
        f.write(line)
