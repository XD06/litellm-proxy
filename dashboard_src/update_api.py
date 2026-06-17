with open('src/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

start = content.find('function adminQuery()')
end = content.find('function safeSearchRegex(str)')

if start != -1 and end != -1:
    api_content = content[start:end]
    
    # write src/api.js
    with open('src/api.js', 'w', encoding='utf-8') as f:
        f.write('import { state } from "./state.js";\n\n')
        # add export to functions
        api_content = api_content.replace('function adminQuery', 'export function adminQuery')
        api_content = api_content.replace('function withAdmin', 'export function withAdmin')
        api_content = api_content.replace('async function apiGet', 'export async function apiGet')
        api_content = api_content.replace('async function apiPost', 'export async function apiPost')
        api_content = api_content.replace('async function apiPatch', 'export async function apiPatch')
        api_content = api_content.replace('async function readJson', 'export async function readJson')
        api_content = api_content.replace('function errorMessage', 'export function errorMessage')
        f.write(api_content)
        
    # remove from app.js
    new_content = content[:start] + content[end:]
    
    # insert import in app.js
    import_str = 'import { adminQuery, withAdmin, apiGet, apiPost, apiPatch, readJson, errorMessage } from "./api.js";\n'
    # insert it after the last import
    last_import = new_content.rfind('import {')
    end_last_import = new_content.find(';\n', last_import) + 2
    new_content = new_content[:end_last_import] + import_str + new_content[end_last_import:]
    
    with open('src/app.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('Extracted API logic to api.js')
else:
    print('Could not find API block')
