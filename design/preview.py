"""Open the mockup in a real app window instead of a browser tab.

    python -m pip install pywebview
    python design/preview.py

On macOS the sidebar gets the system frosted glass (vibrancy).
"""

import sys
from pathlib import Path

try:
    import webview
except ImportError:
    sys.exit("Нужна библиотека pywebview:\n  "
             f'"{sys.executable}" -m pip install pywebview')

# The page is passed as text, not as a file:// link: the Windows engine
# fails to open file links with extra parameters. The "app" class switches
# the mockup to its in-window layout.
html = Path(__file__).with_name("mockup.html").read_text(encoding="utf-8")
html = html.replace('<html lang="ru">', '<html lang="ru" class="app">', 1)

webview.create_window(
    "Tembo", html=html,
    width=1180, height=740, min_size=(980, 620),
    vibrancy=sys.platform == "darwin",
)
webview.start()
