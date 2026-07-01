#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CSS Merger: eliminates dead code by merging duplicate selectors and :root blocks.

Strategy:
  1. Parse CSS into top-level blocks (rules, @media, @keyframes, @font-face, comments, etc.)
  2. For :root blocks, merge all CSS custom properties (--vars), keeping the LAST defined value.
  3. For regular selectors that appear multiple times, merge declarations so that later
     property values override earlier ones (CSS cascade semantics).
  4. @media / @supports blocks are treated as scoped contexts — merging happens within each scope.
  5. @keyframes, @font-face are kept as-is (they don't cascade the same way).
  6. Comments that are section dividers for dead theme passes are removed.
  7. Empty rules (no declarations) are removed.

Output: a single clean CSS file with no duplicate selectors and a single :root block.
"""

import re
import sys
from collections import OrderedDict
from typing import List, Tuple, Optional


# ─── Tokenizer ───────────────────────────────────────────────────────────────

def tokenize_css(text: str) -> List[Tuple[str, str]]:
    """
    Split CSS text into top-level blocks.
    Returns a list of (block_type, block_text) tuples.
    block_type is one of: 'rule', 'at_media', 'at_keyframes', 'at_other', 'comment', 'whitespace'
    """
    blocks = []
    i = 0
    n = len(text)

    while i < n:
        # Skip leading whitespace
        ws_start = i
        while i < n and text[i] in ' \t\n\r':
            i += 1
        if i > ws_start:
            ws = text[ws_start:i]
            if blocks and blocks[-1][0] != 'whitespace':
                blocks.append(('whitespace', ws))
            elif not blocks:
                blocks.append(('whitespace', ws))

        if i >= n:
            break

        # Comment
        if text[i:i+2] == '/*':
            end = text.find('*/', i + 2)
            if end == -1:
                end = n
            else:
                end += 2
            blocks.append(('comment', text[i:end]))
            i = end
            continue

        # @-rule
        if text[i] == '@':
            # Find the rule keyword
            m = re.match(r'@([a-zA-Z-]+)', text[i:])
            if not m:
                # Unknown, skip char
                i += 1
                continue
            at_keyword = m.group(1).lower()

            if at_keyword in ('media', 'supports', 'container'):
                # @media / @supports / @container — parse as nested block
                block_text, end_idx = _extract_nested_block(text, i)
                blocks.append(('at_media', block_text))
                i = end_idx
            elif at_keyword in ('keyframes', '-webkit-keyframes', '-moz-keyframes'):
                block_text, end_idx = _extract_nested_block(text, i)
                blocks.append(('at_keyframes', block_text))
                i = end_idx
            elif at_keyword in ('font-face', 'import', 'charset', 'namespace', 'page', 'layer'):
                # These might have blocks or just end with ;
                block_text, end_idx = _extract_at_rule(text, i)
                blocks.append(('at_other', block_text))
                i = end_idx
            else:
                # Unknown @-rule, try to extract as block or statement
                block_text, end_idx = _extract_at_rule(text, i)
                blocks.append(('at_other', block_text))
                i = end_idx
            continue

        # Regular rule (selector { ... })
        # Find the opening brace
        brace_idx = _find_opening_brace(text, i)
        if brace_idx == -1:
            # No brace found, rest is probably stray text
            break

        selector = text[i:brace_idx].strip()
        block_text, end_idx = _extract_brace_block(text, brace_idx)
        full_text = text[i:end_idx]
        blocks.append(('rule', full_text))
        i = end_idx

    return blocks


def _find_opening_brace(text: str, start: int) -> int:
    """Find the opening brace, handling strings and comments."""
    i = start
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == '{':
            return i
        if ch == '/' and i + 1 < n and text[i+1] == '*':
            # Skip comment
            end = text.find('*/', i + 2)
            i = end + 2 if end != -1 else n
            continue
        if ch in '"\'':
            # Skip string
            end = _skip_string(text, i)
            i = end
            continue
        i += 1
    return -1


def _extract_brace_block(text: str, brace_idx: int) -> Tuple[str, int]:
    """Extract content from { to matching }, return (full_text_including_braces, end_index)."""
    i = brace_idx + 1
    n = len(text)
    depth = 1

    while i < n and depth > 0:
        ch = text[i]
        if ch == '/' and i + 1 < n and text[i+1] == '*':
            end = text.find('*/', i + 2)
            i = end + 2 if end != -1 else n
            continue
        if ch in '"\'':
            i = _skip_string(text, i)
            continue
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
        i += 1

    return text[brace_idx:i], i


def _extract_nested_block(text: str, start: int) -> Tuple[str, int]:
    """Extract an @media/@keyframes block (including prelude and nested block)."""
    i = start
    n = len(text)

    # Find the opening brace of the outer block
    prelude_end = _find_opening_brace(text, i)
    if prelude_end == -1:
        # Maybe it's a statement ending with ;
        semi = text.find(';', i)
        if semi != -1:
            return text[i:semi+1], semi + 1
        return text[i:], n

    # Now find the matching closing brace
    _, end_idx = _extract_brace_block(text, prelude_end)
    return text[i:end_idx], end_idx


def _extract_at_rule(text: str, start: int) -> Tuple[str, int]:
    """Extract a simple @-rule (font-face, import, etc.)."""
    i = start
    n = len(text)
    brace_idx = _find_opening_brace(text, i)
    semi_idx = -1

    # Find first ; or { (not inside string/comment)
    j = i
    while j < n:
        ch = text[j]
        if ch == '/' and j + 1 < n and text[j+1] == '*':
            end = text.find('*/', j + 2)
            j = end + 2 if end != -1 else n
            continue
        if ch in '"\'':
            j = _skip_string(text, j)
            continue
        if ch == ';':
            semi_idx = j
            break
        if ch == '{':
            brace_idx = j
            break
        j += 1

    if brace_idx != -1 and (semi_idx == -1 or brace_idx < semi_idx):
        _, end_idx = _extract_brace_block(text, brace_idx)
        return text[i:end_idx], end_idx
    elif semi_idx != -1:
        return text[i:semi_idx+1], semi_idx + 1
    else:
        return text[i:], n


def _skip_string(text: str, start: int) -> int:
    """Skip a string starting at text[start] (which is a quote). Return index after closing quote."""
    quote = text[start]
    i = start + 1
    n = len(text)
    while i < n:
        if text[i] == '\\':
            i += 2
            continue
        if text[i] == quote:
            return i + 1
        i += 1
    return n


# ─── Rule Parser ──────────────────────────────────────────────────────────────

def parse_rule(block_text: str) -> Tuple[str, str]:
    """Parse a rule block into (selector, body)."""
    # block_text is like: "selector { ... }"
    brace_idx = block_text.index('{')
    selector = block_text[:brace_idx].strip()
    body = block_text[brace_idx+1:].rstrip()
    if body.endswith('}'):
        body = body[:-1]
    return selector, body


def parse_declarations(body: str) -> 'OrderedDict[str, str]':
    """Parse a declaration body into an ordered dict of property: value."""
    decls = OrderedDict()
    i = 0
    n = len(body)

    while i < n:
        # Skip whitespace
        while i < n and body[i] in ' \t\n\r':
            i += 1
        if i >= n:
            break

        # Skip comments
        if body[i:i+2] == '/*':
            end = body.find('*/', i + 2)
            i = end + 2 if end != -1 else n
            continue

        # Find property name
        prop_start = i
        while i < n and body[i] not in ':;{}':
            if body[i:i+2] == '/*':
                end = body.find('*/', i + 2)
                i = end + 2 if end != -1 else n
                continue
            i += 1

        if i >= n or body[i] != ':':
            # Not a valid declaration, skip to next ;
            while i < n and body[i] != ';':
                i += 1
            i += 1
            continue

        prop = body[prop_start:i].strip()
        i += 1  # skip ':'

        # Find value (until ; or end)
        val_start = i
        while i < n and body[i] != ';':
            if body[i:i+2] == '/*':
                end = body.find('*/', i + 2)
                i = end + 2 if end != -1 else n
                continue
            if body[i] in '"\'':
                i = _skip_string(body, i)
                continue
            if body[i] == '{':
                # Nested block (e.g., in @supports or nested CSS), skip
                _, end_idx = _extract_brace_block(body, i)
                i = end_idx
                continue
            i += 1

        val = body[val_start:i].strip()
        if i < n and body[i] == ';':
            i += 1

        if prop and val:
            decls[prop] = val

    return decls


def declarations_to_str(decls: 'OrderedDict[str, str]') -> str:
    """Convert declarations dict back to CSS string."""
    lines = []
    for prop, val in decls.items():
        lines.append(f"  {prop}: {val};")
    return '\n'.join(lines)


# ─── Merger ───────────────────────────────────────────────────────────────────

# Section-divider comments to remove (dead theme passes)
DEAD_COMMENTS = [
    'Modern overview pass',
    'Minimalist correction',
    'Overview mockup skin',
]


def is_dead_comment(comment_text: str) -> bool:
    """Check if a comment is a section divider for a dead theme pass."""
    inner = comment_text.strip('/* ').strip('*/').strip()
    for marker in DEAD_COMMENTS:
        if marker in inner:
            return True
    return False


def merge_css(text: str) -> str:
    """Main merge function."""
    blocks = tokenize_css(text)

    # Phase 1: Extract and merge all :root blocks
    root_vars = OrderedDict()
    non_root_blocks = []

    for btype, btext in blocks:
        if btype == 'whitespace':
            non_root_blocks.append((btype, btext))
            continue
        if btype == 'comment':
            if is_dead_comment(btext):
                # Skip dead section divider comments
                continue
            non_root_blocks.append((btype, btext))
            continue
        if btype == 'rule':
            selector, body = parse_rule(btext)
            if selector == ':root':
                # Merge variables
                decls = parse_declarations(body)
                for prop, val in decls.items():
                    root_vars[prop] = val
                # Don't add to non_root_blocks — we'll output a single :root at the end
                continue
            non_root_blocks.append((btype, btext))
            continue
        # @media, @keyframes, @other — keep as-is
        non_root_blocks.append((btype, btext))

    # Phase 2: Merge duplicate selectors in non-root blocks
    # For top-level rules, merge by selector
    # For @media, merge within each media block
    merged_blocks = []

    # Track selectors we've seen (for top-level rule merging)
    # We use an OrderedDict: selector -> index in merged_blocks
    selector_map = OrderedDict()

    i = 0
    while i < len(non_root_blocks):
        btype, btext = non_root_blocks[i]

        if btype == 'whitespace':
            merged_blocks.append((btype, btext))
            i += 1
            continue

        if btype == 'comment':
            # Keep comments (but not dead ones — already filtered)
            merged_blocks.append((btype, btext))
            i += 1
            continue

        if btype == 'rule':
            selector, body = parse_rule(btext)
            decls = parse_declarations(body)

            if selector in selector_map:
                # Merge with existing
                existing_idx = selector_map[selector]
                existing_type, existing_text = merged_blocks[existing_idx]
                _, existing_body = parse_rule(existing_text)
                existing_decls = parse_declarations(existing_body)

                # Merge: existing values are overridden by new values
                for prop, val in decls.items():
                    existing_decls[prop] = val

                # Rebuild the rule
                new_body = declarations_to_str(existing_decls)
                new_text = f"{selector} {{\n{new_body}\n}}"
                merged_blocks[existing_idx] = ('rule', new_text)
            else:
                selector_map[selector] = len(merged_blocks)
                new_body = declarations_to_str(decls)
                new_text = f"{selector} {{\n{new_body}\n}}"
                merged_blocks.append(('rule', new_text))

            i += 1
            continue

        if btype == 'at_media':
            # Parse @media block and merge within
            merged_text = merge_at_media(btext)
            merged_blocks.append(('at_media', merged_text))
            i += 1
            continue

        # @keyframes, @other — keep as-is
        merged_blocks.append((btype, btext))
        i += 1

    # Phase 3: Remove empty rules
    final_blocks = []
    for btype, btext in merged_blocks:
        if btype == 'rule':
            selector, body = parse_rule(btext)
            decls = parse_declarations(body)
            if not decls:
                continue  # Skip empty rules
            # Rebuild with clean formatting
            new_body = declarations_to_str(decls)
            new_text = f"{selector} {{\n{new_body}\n}}"
            final_blocks.append(('rule', new_text))
        else:
            final_blocks.append((btype, btext))

    # Phase 4: Build output — single :root first, then all other blocks
    output_parts = []

    # Output merged :root
    if root_vars:
        root_body = declarations_to_str(root_vars)
        output_parts.append(f":root {{\n{root_body}\n}}")

    # Output all other blocks (skip leading whitespace if empty)
    for btype, btext in final_blocks:
        if btype == 'whitespace':
            output_parts.append('')
        else:
            output_parts.append(btext)

    # Join with newlines
    result = '\n'.join(output_parts)

    # Clean up excessive blank lines (max 2 consecutive)
    result = re.sub(r'\n{4,}', '\n\n\n', result)

    return result


def merge_at_media(block_text: str) -> str:
    """Merge duplicate selectors within an @media block."""
    # Parse the @media prelude and inner content
    brace_idx = block_text.index('{')
    prelude = block_text[:brace_idx+1]  # includes the opening brace
    inner = block_text[brace_idx+1:].rstrip()
    if inner.endswith('}'):
        inner = inner[:-1]

    # Tokenize inner content
    inner_blocks = tokenize_css(inner)

    # Merge duplicate selectors
    selector_map = OrderedDict()
    merged = []

    for btype, btext in inner_blocks:
        if btype in ('whitespace', 'comment'):
            merged.append((btype, btext))
            continue
        if btype == 'rule':
            selector, body = parse_rule(btext)
            decls = parse_declarations(body)

            if selector in selector_map:
                existing_idx = selector_map[selector]
                _, existing_text = merged[existing_idx]
                _, existing_body = parse_rule(existing_text)
                existing_decls = parse_declarations(existing_body)

                for prop, val in decls.items():
                    existing_decls[prop] = val

                new_body = declarations_to_str(existing_decls)
                new_text = f"{selector} {{\n{new_body}\n}}"
                merged[existing_idx] = ('rule', new_text)
            else:
                selector_map[selector] = len(merged)
                new_body = declarations_to_str(decls)
                new_text = f"{selector} {{\n{new_body}\n}}"
                merged.append(('rule', new_text))
            continue
        # Keep other blocks as-is
        merged.append((btype, btext))

    # Remove empty rules
    final = []
    for btype, btext in merged:
        if btype == 'rule':
            selector, body = parse_rule(btext)
            decls = parse_declarations(body)
            if not decls:
                continue
            new_body = declarations_to_str(decls)
            new_text = f"{selector} {{\n{new_body}\n}}"
            final.append(new_text)
        elif btype == 'whitespace':
            final.append('')
        else:
            final.append(btext)

    inner_result = '\n'.join(final)
    inner_result = re.sub(r'\n{4,}', '\n\n\n', inner_result)

    return f"{prelude}\n{inner_result}\n}}"


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 3:
        print("Usage: python css_merger.py <input.css> <output.css>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    with open(input_path, 'r', encoding='utf-8') as f:
        css_text = f.read()

    original_lines = css_text.count('\n')
    print(f"Original: {original_lines} lines")

    merged = merge_css(css_text)

    merged_lines = merged.count('\n')
    print(f"Merged: {merged_lines} lines")
    print(f"Saved: {original_lines - merged_lines} lines ({(1 - merged_lines/original_lines)*100:.1f}% reduction)")

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(merged)

    print(f"Written to: {output_path}")


if __name__ == '__main__':
    main()
