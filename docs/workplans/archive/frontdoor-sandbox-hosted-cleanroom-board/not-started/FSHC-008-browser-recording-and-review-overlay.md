# FSHC-008 Browser Recording And Review Overlay

## Archive Status

This ticket is preserved as historical intent only.
Browser and recording overlay work now belongs on the active hosted
integration board or the Nex-side fresh-boot sandbox board, not this archived
substrate board.

## Goal

Add review-grade browser or full-screen recording artifacts on top of hosted
cleanroom proof bundles.

Operator-console Playwright coverage is the first concrete producer. This lane
should reuse that producer model rather than inventing a competing browser
artifact stack.

## Acceptance

1. recording output can be attached to the same proof bundle
2. one hosted cleanroom lane emits a reviewable demo artifact
3. the capture model works under the Docker executor boundary
