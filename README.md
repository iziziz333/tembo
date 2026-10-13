# Tembo

A smart, safe file organizer for cluttered Desktops and Downloads folders.

**Predictable, offline, private.** Files are sorted by clear rules (file types,
installers, duplicates by content, camera photos by month). Nothing leaves
your computer.

**Nothing happens without your approval.** Tembo always shows a plan first.
It never deletes anything: duplicates and unclear files go to `_Tembo_Review`.

## Status

- [x] Stage 1: scanner, rules, `tembo plan` (dry run)
- [x] Stage 2: apply plan with a journal, one-command undo
- [ ] Stage 3: desktop GUI
- [ ] Stage 4: landing page, installer

## Try it

```
pip install -e ".[dev]"
tembo plan ~/Downloads          # shows the plan, changes nothing
tembo plan ~/Desktop -r         # also look inside subfolders
tembo apply ~/Downloads         # shows the plan, asks, then moves files
tembo undo ~/Downloads          # puts everything back
pytest
```
