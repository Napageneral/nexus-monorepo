import { isNexEmbedded } from "./embed-config";

export const NEX_UPSTREAM_FEATURE_POLICY = {
  bootstrapRouteSelection: false,
  threadCreation: false,
  projectCreation: false,
  git: false,
  diff: false,
  terminal: false,
  openInEditor: false,
  laneActions: true,
} as const;

export type NexFeatureName = keyof typeof NEX_UPSTREAM_FEATURE_POLICY;

export function isNexFeatureEnabled(feature: NexFeatureName): boolean {
  return isNexEmbedded() ? NEX_UPSTREAM_FEATURE_POLICY[feature] : true;
}
