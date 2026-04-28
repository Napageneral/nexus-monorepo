# AFEA-008 Jira Durable Monitor Watermarks

## Goal

Persist Jira monitor watermarks so restarts do not lose downtime changes.

## Current Gap

The Jira monitor initializes from config or current time, mutates an in-memory
map, and does not persist updated cursors.

Primary file:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/jira/cmd/jira-adapter/monitor.go`

## Scope

- persist per-project or per-board monitor state under adapter state
- track updated timestamps and issue keys as tie-breakers
- add overlap handling with unchanged-row suppression
- add restart/downtime replay tests

## Acceptance

1. monitor state survives process restart
2. downtime changes are read after restart without broad full scans
3. overlap windows do not re-emit unchanged issues forever
4. benchmark artifacts include request and emitted-record counts
