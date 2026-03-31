# AIB-006 Backend Outcome Materialization And Bridge Extraction

## Goal

Materialize backend outcome rows and extract the bridge evidence needed to join
website intent to backend truth.

## Acceptance

1. backend adapter rows map into app-owned `business_outcomes`
2. bridge evidence is extracted into explicit app-owned bridge facts
3. provider-native outcome ids remain inspectable
4. the same contract supports Shopify first and later EMR or CRM inputs
