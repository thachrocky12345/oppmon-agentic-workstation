# Skill: pdf-extract

## When to use
Use this skill when you need to read text from a PDF file that the Read tool cannot handle (e.g., "pdftoppm not found" error).

## Setup (one-time)

`pdfminer.six` must be installed for **Python 3.14** (the version that has it in PATH):

```bash
# Check which python has pdfminer
py -3.14 -c "from pdfminer.high_level import extract_text; print('ok')"

# Install if missing (targets py 3.14 site-packages)
pip install pdfminer.six
# OR if pip installs to wrong version:
py -3.14 -m pip install pdfminer.six
```

## Extraction pattern

```bash
py -3.14 -c "
import sys
sys.stdout.reconfigure(encoding='utf-8')
from pdfminer.high_level import extract_text
text = extract_text('PATH/TO/FILE.pdf')
with open('PATH/TO/output.txt', 'w', encoding='utf-8') as f:
    f.write(text)
print('done, chars:', len(text))
"
```

Then read the output `.txt` file with the Read tool — or use an Agent to process it if it's large (>20KB).

## Windows-specific gotchas

- Multiple Python versions exist on this machine. `python3` → Python 3.13 (Microsoft Store). `py -3.14` → Python 3.14 (Program Files). `pdfminer.six` was installed to **3.14**.
- Always use `py -3.14` not `python3` for pdfminer operations.
- Write output to a file within the project directory — `C:/temp/` may throw PermissionError.
- For large PDFs (>20KB text), use the Agent tool to read+summarize rather than trying to pipe all output through Bash (it gets truncated).

## Full pipeline for large PDFs

1. Extract to `.txt` in the project tree:
   ```bash
   py -3.14 -c "
   from pdfminer.high_level import extract_text
   text = extract_text('input.pdf')
   open('output.txt', 'w', encoding='utf-8').write(text)
   "
   ```
2. Use the Agent tool to read `output.txt` and produce a structured summary MD.
3. Save the summary MD — discard or keep the raw `.txt` as desired.

## Other PDF libraries to try if pdfminer fails

```bash
py -3.14 -m pip install pypdf       # good for metadata + simple text
py -3.14 -m pip install pdfplumber  # good for table extraction
py -3.14 -m pip install pymupdf     # fastest; handles complex layouts (install as: pip install pymupdf)
```
