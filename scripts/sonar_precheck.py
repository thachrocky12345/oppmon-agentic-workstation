#!/usr/bin/env python
"""
Quick local pre-check for common SonarCloud issues.
Run before pushing to catch issues early.

Usage:
    python scripts/sonar_precheck.py [file_or_directory]
    python scripts/sonar_precheck.py apps/verification/
"""

import ast
import re
import sys
from pathlib import Path
from collections import defaultdict


class SonarPreChecker(ast.NodeVisitor):
    """AST visitor to check for common SonarCloud issues."""

    def __init__(self, filename):
        self.filename = filename
        self.issues = []
        self.string_literals = defaultdict(list)

    def add_issue(self, line, rule, message):
        self.issues.append((line, rule, message))

    def visit_For(self, node):
        """Check for unused loop variables."""
        if isinstance(node.target, ast.Name):
            var_name = node.target.id
            # Check if variable is used in the loop body
            used = self._is_name_used_in(var_name, node.body)
            if not used and not var_name.startswith('_'):
                self.add_issue(
                    node.lineno,
                    "S1481",
                    f"Unused loop variable '{var_name}' - replace with '_'"
                )
        self.generic_visit(node)

    def visit_Assign(self, node):
        """Check for unused variables and password patterns."""
        for target in node.targets:
            if isinstance(target, ast.Name):
                var_name = target.id.lower()
                if 'password' in var_name or 'passwd' in var_name:
                    if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                        self.add_issue(
                            node.lineno,
                            "S2068",
                            f"Potential hardcoded credential in '{target.id}'"
                        )
            if isinstance(target, ast.Tuple):
                for elt in target.elts:
                    if isinstance(elt, ast.Name):
                        # This would need more context to check if truly unused
                        pass
        self.generic_visit(node)

    def visit_Constant(self, node):
        """Track string literals for duplication check."""
        if isinstance(node.value, str) and len(node.value) > 10:
            self.string_literals[node.value].append(node.lineno)
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        """Check for unused parameters and cognitive complexity."""
        # Check unused parameters
        param_names = {arg.arg for arg in node.args.args}
        used_names = self._get_used_names(node.body)

        for param in param_names:
            if param not in used_names and not param.startswith('_') and param != 'self':
                self.add_issue(
                    node.lineno,
                    "S1172",
                    f"Unused parameter '{param}' - prefix with '_'"
                )

        # Rough cognitive complexity check
        complexity = self._estimate_complexity(node)
        if complexity > 15:
            self.add_issue(
                node.lineno,
                "S3776",
                f"Function '{node.name}' has high cognitive complexity (~{complexity})"
            )

        self.generic_visit(node)

    def _is_name_used_in(self, name, nodes):
        """Check if a name is used in a list of nodes."""
        for node in ast.walk(ast.Module(body=nodes)):
            if isinstance(node, ast.Name) and node.id == name:
                return True
        return False

    def _get_used_names(self, body):
        """Get all names used in a function body."""
        names = set()
        for node in ast.walk(ast.Module(body=body)):
            if isinstance(node, ast.Name):
                names.add(node.id)
        return names

    def _estimate_complexity(self, node):
        """Rough estimate of cognitive complexity."""
        complexity = 0
        nesting = 0

        for child in ast.walk(node):
            if isinstance(child, (ast.If, ast.While, ast.For)):
                complexity += 1 + nesting
                nesting += 1
            elif isinstance(child, ast.Try):
                complexity += 1
            elif isinstance(child, ast.ExceptHandler):
                complexity += 1 + nesting
            elif isinstance(child, (ast.And, ast.Or)):
                complexity += 1

        return complexity

    def check_duplicates(self):
        """Check for duplicated string literals."""
        for literal, lines in self.string_literals.items():
            if len(lines) >= 3:
                self.add_issue(
                    lines[0],
                    "S1192",
                    f"String '{literal[:40]}...' duplicated {len(lines)} times - define a constant"
                )


def check_file(filepath):
    """Check a single Python file."""
    issues = []

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        return [(0, "ERROR", f"Could not read file: {e}")]

    # AST-based checks
    try:
        tree = ast.parse(content)
        checker = SonarPreChecker(filepath)
        checker.visit(tree)
        checker.check_duplicates()
        issues.extend(checker.issues)
    except SyntaxError as e:
        issues.append((e.lineno or 0, "SYNTAX", str(e)))

    # Regex-based checks for things AST misses
    lines = content.split('\n')
    for i, line in enumerate(lines, 1):
        # Check for TODO/FIXME without ticket
        if re.search(r'#\s*(TODO|FIXME)(?!\s*[A-Z]+-\d+)', line, re.IGNORECASE):
            pass  # Not a SonarCloud issue, skip

        # Check for print statements (usually debug)
        if re.match(r'\s*print\s*\(', line) and 'NOSONAR' not in line:
            pass  # Not always an issue, skip

    return issues


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        target = Path('apps')
    else:
        target = Path(sys.argv[1])

    if not target.exists():
        print(f"Error: {target} does not exist")
        sys.exit(1)

    # Collect files
    if target.is_file():
        files = [target]
    else:
        files = list(target.rglob('*.py'))
        # Exclude migrations and tests by default
        files = [f for f in files if 'migration' not in str(f) and '__pycache__' not in str(f)]

    print(f"Checking {len(files)} Python files...\n")

    total_issues = 0
    for filepath in sorted(files):
        issues = check_file(filepath)
        if issues:
            print(f"\n{filepath}:")
            for line, rule, message in issues:
                print(f"  Line {line} [{rule}]: {message}")
                total_issues += 1

    print(f"\n{'='*60}")
    print(f"Total issues found: {total_issues}")

    if total_issues > 0:
        print("\nNote: This is a rough pre-check. SonarCloud may find more or fewer issues.")
        sys.exit(1)
    else:
        print("\nNo obvious issues found!")
        sys.exit(0)


if __name__ == '__main__':
    main()
