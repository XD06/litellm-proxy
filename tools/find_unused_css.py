#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Find CSS class selectors that are never referenced in HTML or JS files.
This helps identify truly dead CSS rules.

Strategy:
  1. Extract all class selectors from the CSS file.
  2. Search for each class name in the HTML and JS files.
  3. Report classes that are not found anywhere.
"""

import re
import sys
import os
from pathlib import Path


def extract_class_names(css_text: str) -> set:
    """Extract all class names from CSS selectors."""
    # Remove comments
    css_no_comments = re.sub(r'/\*.*?\*/', '', css_text, flags=re.DOTALL)

    # Remove @media and other at-rules prelude (keep inner content)
    # Actually, we just need class names, so extract all .classname patterns

    # Match .classname (not preceded by a letter to avoid matching in values)
    # Class names can contain letters, digits, hyphens, underscores
    pattern = r'\.([a-zA-Z][a-zA-Z0-9_-]*)'
    matches = re.findall(pattern, css_no_comments)

    return set(matches)


def search_in_file(filepath: str, class_names: set) -> set:
    """Search for class names in a file. Returns the set of found class names."""
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception:
        return set()

    found = set()
    for name in class_names:
        # Search for the class name as a word
        if re.search(r'\b' + re.escape(name) + r'\b', content):
            found.add(name)
    return found


def main():
    css_path = sys.argv[1] if len(sys.argv) > 1 else "dashboard_src/src/styles_merged.css"
    search_dirs = sys.argv[2:] if len(sys.argv) > 2 else ["dashboard", "dashboard_src/src"]

    with open(css_path, 'r', encoding='utf-8') as f:
        css_text = f.read()

    class_names = extract_class_names(css_text)
    print(f"Total unique class names in CSS: {len(class_names)}")

    # Search in all HTML and JS files in the search directories
    found_classes = set()
    files_searched = 0

    for search_dir in search_dirs:
        for root, dirs, files in os.walk(search_dir):
            # Skip node_modules
            dirs[:] = [d for d in dirs if d != 'node_modules']
            for fname in files:
                if fname.endswith(('.html', '.js', '.jsx', '.ts', '.tsx')):
                    fpath = os.path.join(root, fname)
                    found = search_in_file(fpath, class_names - found_classes)
                    found_classes.update(found)
                    files_searched += 1

    print(f"Files searched: {files_searched}")
    print(f"Classes found in HTML/JS: {len(found_classes)}")

    unused = class_names - found_classes
    print(f"\nPotentially unused classes: {len(unused)}")
    print("=" * 60)

    for name in sorted(unused):
        print(f"  .{name}")


if __name__ == '__main__':
    main()
