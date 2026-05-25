#!/usr/bin/env bash
set -euo pipefail

APP_NAME="JAMARQ Atlas"
APP_BUNDLE="out/JAMARQ Atlas-darwin-arm64/JAMARQ Atlas.app"
APP_BINARY="$APP_BUNDLE/Contents/MacOS/$APP_NAME"
MODE="${1:-run}"

if [[ "$#" -gt 1 ]]; then
	echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
	exit 2
fi

if pgrep -f "$APP_BUNDLE/Contents/MacOS/$APP_NAME" >/dev/null 2>&1; then
	pkill -f "$APP_BUNDLE/Contents/MacOS/$APP_NAME"
fi

npm run desktop:build

case "$MODE" in
run)
	/usr/bin/open -n "$APP_BUNDLE"
	;;
--debug | debug)
	lldb -- "$APP_BINARY"
	;;
--logs | logs)
	/usr/bin/open -n "$APP_BUNDLE"
	/usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
	;;
--telemetry | telemetry)
	/usr/bin/open -n "$APP_BUNDLE"
	/usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
	;;
--verify | verify)
	/usr/bin/open -n "$APP_BUNDLE"
	for _ in {1..10}; do
		if pgrep -f "$APP_BUNDLE/Contents/MacOS/$APP_NAME" >/dev/null 2>&1; then
			exit 0
		fi
		sleep 1
	done
	exit 1
	;;
*)
	echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
	exit 2
	;;
esac
