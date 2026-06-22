set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

default:
    @just --list

verify:
    npm run lint && npm run verify:runtime-contract && npm run build && npm run audit:maintainability && npm run budget:bundle && npm run test:unit

doctor:
    just verify

actions:
    actionlint

security-audit:
    osv-scanner scan source --recursive --allow-no-lockfiles --experimental-exclude node_modules --experimental-exclude .next --experimental-exclude dist --experimental-exclude build --experimental-exclude target --experimental-exclude archive .

security:
    just actions
    just security-audit
