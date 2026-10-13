# Tembo

A smart, safe file organizer for cluttered Desktops and Downloads folders.

**Rules first, Claude only where meaning matters.** Obvious cases (file types,
installers, duplicates, camera photos) are handled by plain deterministic code.
Claude is consulted only for files rules can't place, and it sees file names
and metadata only, never file contents.

**Nothing happens without your approval.** Tembo always shows a plan first.
It never deletes anything: duplicates and unclear files go to `_Tembo_Review`.

## Status

- [x] Stage 1: scanner, rules, `tembo plan` (dry run)
- [ ] Stage 2: Claude for files rules can't place
- [ ] Stage 3: apply plan, journal, undo
- [ ] Stage 4: desktop GUI
- [ ] Stage 5: landing page, installer

## Try it

```
pip install -e ".[dev]"
tembo plan ~/Downloads          # shows the plan, changes nothing
tembo plan ~/Desktop -r         # also look inside subfolders
pytest
```
