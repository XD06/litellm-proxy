with open('src/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

import_str = """import { state } from "./state.js";
import { timeRanges, REQUEST_PAGE_SIZE, PROVIDERS_PAGE_SIZE, CONFIG_PROVIDERS_PAGE_SIZE, MODEL_ROUTES_PAGE_SIZE, PROVIDER_MODEL_MAP_PAGE_SIZE, AUDIT_PAGE_SIZE, OVERVIEW_PROVIDER_LIMIT, OVERVIEW_FAILURE_LIMIT, USAGE_MODEL_LIMIT, views } from "./constants.js";
"""

start_iife = content.find('(() => {')
end_views = content.find('subtitle: "configuration and safe edits",\n    },\n  };') + len('subtitle: "configuration and safe edits",\n    },\n  };')

if start_iife != -1 and end_views != -1:
    new_content = import_str + content[end_views:]
    if new_content.endswith('})();\n'):
        new_content = new_content[:-6] + '\n'
    elif new_content.strip().endswith('})();'):
        new_content = new_content[:new_content.rfind('})();')] + '\n'
        
    with open('src/app.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('Successfully updated app.js')
else:
    print('Could not find markers')
