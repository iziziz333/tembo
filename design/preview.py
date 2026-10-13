"""Open the mockup in a real macOS window with system glass (vibrancy).

    python3 -m pip install pywebview
    python3 design/preview.py
"""

from pathlib import Path

import webview

page = Path(__file__).with_name("mockup.html").resolve().as_uri() + "?app=1"
webview.create_window(
    "Tembo", page,
    width=1180, height=740, min_size=(980, 620),
    vibrancy=True,  # macOS: the desktop shows through the sidebar as frosted glass
)
webview.start()
