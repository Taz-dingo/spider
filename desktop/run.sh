#!/bin/bash
# Build and launch the desktop-pet shell. The spider page is served from the
# repository root; the shell loads it through its own pet:// scheme.
#
# Optional diagnostic example:
#   ./desktop/run.sh --trace /tmp/spider-cross-screen.jsonl
#
# Quit with Cmd-Q or Ctrl-C in this terminal.
set -e
cd "$(dirname "$0")/.."
swiftc -O -module-cache-path /tmp/clangmod desktop/HostGeometry.swift desktop/SpiderPet.swift -o /tmp/SpiderPet
/tmp/SpiderPet "$(pwd)" "$@"
