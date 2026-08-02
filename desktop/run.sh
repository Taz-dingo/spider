#!/bin/bash
# Build and launch the desktop-pet shell.  The spider page is served from the
# repository root; the shell loads it through its own pet:// scheme.  Quit
# with Cmd-Q or Ctrl-C in this terminal.
set -e
cd "$(dirname "$0")/.."
swiftc -O -module-cache-path /tmp/clangmod desktop/SpiderPet.swift -o /tmp/SpiderPet
cd "$(pwd)" && /tmp/SpiderPet "$(pwd)"
