# AIB-001 App Package Boundary And Manifest

## Goal

Establish the dedicated attribution intelligence app package boundary, manifest,
runtime surfaces, and ownership split above shared adapters and website-input
packages.

## Current Gap

- the product shape is defined canonically, but there is no dedicated app
  package boundary yet
- the app-owned runtime surfaces and package contract are not explicit
- input bindings, jobs, and UI surfaces do not yet have one package home

## Acceptance

1. one dedicated attribution intelligence app package exists
2. the manifest makes the package boundary, runtime surfaces, and app-owned
   dependencies explicit
3. the app boundary does not re-own adapter ingest or website collector ingest
4. docs point at the dedicated board and package seam truthfully
