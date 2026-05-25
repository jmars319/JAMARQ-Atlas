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
	env -u ELECTRON_RUN_AS_NODE -u NO_COLOR -u FORCE_COLOR /usr/bin/open -n "$APP_BUNDLE"
	;;
--debug | debug)
	env -u ELECTRON_RUN_AS_NODE -u NO_COLOR -u FORCE_COLOR lldb -- "$APP_BINARY"
	;;
--logs | logs)
	env -u ELECTRON_RUN_AS_NODE -u NO_COLOR -u FORCE_COLOR /usr/bin/open -n "$APP_BUNDLE"
	/usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
	;;
--telemetry | telemetry)
	env -u ELECTRON_RUN_AS_NODE -u NO_COLOR -u FORCE_COLOR /usr/bin/open -n "$APP_BUNDLE"
	/usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
	;;
--verify | verify)
	env -u ELECTRON_RUN_AS_NODE -u NO_COLOR -u FORCE_COLOR /usr/bin/open -n "$APP_BUNDLE"
	for _ in {1..10}; do
		if pgrep -f "$APP_BUNDLE/Contents/MacOS/$APP_NAME" >/dev/null 2>&1; then
			sleep 2
			pgrep -f "$APP_BUNDLE/Contents/MacOS/$APP_NAME" >/dev/null 2>&1
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
