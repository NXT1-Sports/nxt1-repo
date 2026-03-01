#!/usr/bin/env python3
"""Remove CSS blocks belonging to child components from the profile shell. V2."""
import re, sys

SHELL_FILE = "packages/ui/src/profile/web/profile-shell-web.component.ts"

CHILD_PREFIXES = [
    "profile-verification-banner", "verified-by",
    "ov-", "madden-overview",
    "madden-mobile-hero", "mobile-hero-stat",
    "stats-board", "gl-", "comparison-", "stat-comparison",
    "schedule-board", "schedule-row", "schedule-section",
    "contact-social", "contact-info", "contact-section",
    "coach-card", "madden-contact",
    "academic-",
    "metrics-", "metric-",
    # Round 2: additional dead CSS (not in shell template)
    "profile-header-actions", "profile-header-action-btn",
    "madden-team-type",
    "madden-empty",
    "madden-cta-btn",
    "madden-section-label",
    "stats-compare",
    "madden-stat-",
    "madden-schedule",
    "madden-side-tab",  # old tab styles not in current template
]

def is_child_selector(selector_text):
    classes = re.findall(r'\.([a-zA-Z][\w-]*)', selector_text)
    if not classes:
        return False
    first_class = classes[0]
    return any(first_class.startswith(p) for p in CHILD_PREFIXES)


def find_block_end(lines, start, max_line):
    """Find the closing brace that matches the first opening brace at/after start."""
    depth = 0
    i = start
    found_open = False
    while i <= max_line:
        depth += lines[i].count('{') - lines[i].count('}')
        if '{' in lines[i]:
            found_open = True
        if found_open and depth <= 0:
            return i
        i += 1
    return i - 1


def skip_comment(lines, start, max_line):
    """Skip a /* ... */ comment block, return next line index."""
    i = start
    while i <= max_line:
        if '*/' in lines[i]:
            return i + 1
        i += 1
    return i


def collect_preceding_comment(lines, before_line, min_line):
    """Find the start of a comment/blank block above a given line."""
    t = before_line - 1
    comment_top = before_line
    while t >= min_line:
        s = lines[t].strip()
        if s == '':
            t -= 1
            continue
        if s.startswith('/*') or s.startswith('*') or s.endswith('*/') or s.startswith('//'):
            comment_top = t
            t -= 1
        else:
            break
    return comment_top


def main():
    with open(SHELL_FILE, 'r') as f:
        lines = f.readlines()

    # Dynamically find styles section boundaries
    S = None
    E = None
    for idx, line in enumerate(lines):
        s = line.strip()
        if s == 'styles: [':
            S = idx + 2  # skip `styles: [` and opening backtick
        if S and idx > S + 10 and s == '`,' and 'changeDetection' in lines[min(idx + 2, len(lines) - 1)]:
            E = idx - 1
            break
    if S is None or E is None:
        print("ERROR: could not find styles boundaries")
        sys.exit(1)
    debug = '--debug' in sys.argv
    dry_run = '--dry-run' in sys.argv

    print(f"Styles: lines {S+1}-{E+1} ({E-S+1} lines)")

    to_remove = set()
    i = S

    while i <= E:
        stripped = lines[i].strip()

        if not stripped:
            i += 1; continue

        # comments
        if stripped.startswith('/*'):
            i = skip_comment(lines, i, E); continue
        if stripped.startswith('//'):
            i += 1; continue

        # @keyframes — always keep
        if stripped.startswith('@keyframes'):
            i = find_block_end(lines, i, E) + 1; continue

        # @media blocks — check inner rules
        if stripped.startswith('@media'):
            media_start = i
            media_end = find_block_end(lines, i, E)

            # Parse inner rules (between media_start+1 and media_end-1)
            inner_results = []  # (start, end, is_child, sel)
            j = media_start + 1
            while j < media_end:
                js = lines[j].strip()
                if not js or js == '}':
                    j += 1; continue
                if js.startswith('/*'):
                    j = skip_comment(lines, j, media_end - 1); continue
                if js.startswith('//'):
                    j += 1; continue

                # This should be a CSS selector
                if '{' in js or js.startswith('.') or js.startswith(':') or js.startswith('&') or js.startswith('*'):
                    rule_start = j
                    # Get selector text (everything up to {)
                    sel_parts = []
                    while j < media_end:
                        if '{' in lines[j]:
                            sel_parts.append(lines[j].split('{')[0].strip())
                            break
                        sel_parts.append(lines[j].strip())
                        j += 1
                    selector = ' '.join(sel_parts)

                    rule_end = find_block_end(lines, j, media_end - 1)
                    child = is_child_selector(selector)
                    inner_results.append((rule_start, rule_end, child, selector))
                    if debug and child:
                        print(f"  CHILD @media rule L{rule_start+1}-{rule_end+1}: {selector[:60]}")
                    j = rule_end + 1
                else:
                    j += 1

            if inner_results:
                all_child = all(r[2] for r in inner_results)
                if all_child:
                    cstart = collect_preceding_comment(lines, media_start, S)
                    for r in range(cstart, media_end + 1):
                        to_remove.add(r)
                    if debug:
                        print(f"REMOVE entire @media L{cstart+1}-{media_end+1}")
                else:
                    for rs, re_, child, sel in inner_results:
                        if child:
                            for r in range(rs, re_ + 1):
                                to_remove.add(r)

            i = media_end + 1; continue

        # Top-level CSS rules
        if stripped.startswith('.') or stripped.startswith(':') or stripped.startswith('*'):
            rule_start = i
            sel_parts = []
            while i <= E:
                if '{' in lines[i]:
                    sel_parts.append(lines[i].split('{')[0].strip())
                    break
                sel_parts.append(lines[i].strip())
                i += 1
            selector = ' '.join(sel_parts)

            rule_end = find_block_end(lines, i, E)
            child = is_child_selector(selector)

            if child:
                cstart = collect_preceding_comment(lines, rule_start, S)
                for r in range(cstart, rule_end + 1):
                    to_remove.add(r)
                if debug:
                    print(f"REMOVE rule L{cstart+1}-{rule_end+1}: {selector[:60]}")

            i = rule_end + 1; continue

        i += 1

    print(f"Lines to remove: {len(to_remove)}")

    # Show summary
    sorted_lines = sorted(to_remove)
    if sorted_lines:
        blocks = []
        bs = be = sorted_lines[0]
        for ln in sorted_lines[1:]:
            if ln == be + 1:
                be = ln
            else:
                blocks.append((bs, be))
                bs = be = ln
        blocks.append((bs, be))
        print(f"\n{len(blocks)} contiguous blocks:")
        for bs, be in blocks[:30]:
            first = next((lines[j].strip()[:70] for j in range(bs, be+1) if lines[j].strip().startswith('.') or lines[j].strip().startswith('@')), '')
            print(f"  L{bs+1}-{be+1} ({be-bs+1} lines): {first}")
        if len(blocks) > 30:
            print(f"  ... and {len(blocks)-30} more blocks")

    if dry_run:
        print("\n[DRY RUN] No changes.")
        return

    new_lines = [l for idx, l in enumerate(lines) if idx not in to_remove]
    cleaned = []
    blank = 0
    for l in new_lines:
        if l.strip() == '':
            blank += 1
            if blank <= 1:
                cleaned.append(l)
        else:
            blank = 0
            cleaned.append(l)

    with open(SHELL_FILE, 'w') as f:
        f.writelines(cleaned)
    print(f"\nOriginal: {len(lines)} -> New: {len(cleaned)} ({len(lines)-len(cleaned)} removed)")


if __name__ == '__main__':
    main()
