with open('src/app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start = -1
end = -1
for i, line in enumerate(lines):
    if line.startswith('  function adminQuery()'):
        start = i
    if line.startswith('  function openConfirmDialog'):
        end = i
        break

if start != -1 and end != -1:
    api_lines = lines[start:end]
    
    # Process api.js
    with open('src/api.js', 'w', encoding='utf-8') as f:
        f.write('import { state } from "./state.js";\n\n')
        for line in api_lines:
            # Add export to top-level functions
            if line.startswith('  function '):
                f.write(line.replace('  function ', 'export function ', 1))
            elif line.startswith('  async function '):
                f.write(line.replace('  async function ', 'export async function ', 1))
            else:
                if line.startswith('  '):
                    f.write(line[2:])
                else:
                    f.write(line)
                    
    # Process app.js
    new_lines = lines[:start] + lines[end:]
    # Find last import
    last_import = -1
    for i, line in enumerate(new_lines):
        if line.startswith('import '):
            last_import = i
            
    import_stmt = 'import { adminQuery, withAdmin, apiGet, apiPost, apiPatch, readJson, errorMessage } from "./api.js";\n'
    new_lines.insert(last_import + 1, import_stmt)
    
    with open('src/app.js', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
        
    print('Extracted api.js safely!')
else:
    print('Failed to find lines.')
