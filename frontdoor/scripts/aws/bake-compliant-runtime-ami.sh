#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage:
  bake-compliant-runtime-ami.sh \
    --profile frontdoor-admin \
    --region us-east-2 \
    --subnet-id subnet-... \
    --security-group-id sg-... \
    --key-name nexus-operator \
    --ssh-key /abs/path/to/nexus-operator \
    [--nex-root /abs/path/to/nex] \
    [--base-ami-id ami-...] \
    [--instance-type t4g.medium] \
    [--name nex-compliant-runtime-YYYYMMDDhhmmss] \
    [--keep-builder-on-failure]

Launches a temporary ARM64 Ubuntu builder, installs the current Nex hosted
runtime image contract, creates an AMI, and terminates the builder on success.
EOF
  exit 2
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_BUNDLE_SCRIPT="${SCRIPT_DIR}/build-compliant-runtime-bundle.sh"
INSTALL_SCRIPT="${SCRIPT_DIR}/install-compliant-runtime-image.sh"

PROFILE=""
REGION=""
SUBNET_ID=""
SECURITY_GROUP_ID=""
KEY_NAME=""
SSH_KEY=""
NEX_ROOT="$(cd "${SCRIPT_DIR}/../../../../nex" && pwd)"
BASE_AMI_ID=""
INSTANCE_TYPE="t4g.medium"
NAME="nex-compliant-runtime-$(date +%Y%m%d%H%M%S)"
KEEP_BUILDER_ON_FAILURE="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --profile)
      PROFILE="${2:-}"
      shift 2
      ;;
    --region)
      REGION="${2:-}"
      shift 2
      ;;
    --subnet-id)
      SUBNET_ID="${2:-}"
      shift 2
      ;;
    --security-group-id)
      SECURITY_GROUP_ID="${2:-}"
      shift 2
      ;;
    --key-name)
      KEY_NAME="${2:-}"
      shift 2
      ;;
    --ssh-key)
      SSH_KEY="${2:-}"
      shift 2
      ;;
    --nex-root)
      NEX_ROOT="${2:-}"
      shift 2
      ;;
    --base-ami-id)
      BASE_AMI_ID="${2:-}"
      shift 2
      ;;
    --instance-type)
      INSTANCE_TYPE="${2:-}"
      shift 2
      ;;
    --name)
      NAME="${2:-}"
      shift 2
      ;;
    --keep-builder-on-failure)
      KEEP_BUILDER_ON_FAILURE="true"
      shift
      ;;
    -*)
      printf 'Unknown option: %s\n' "$1" >&2
      usage
      ;;
    *)
      usage
      ;;
  esac
done

if [ -z "$PROFILE" ] || [ -z "$REGION" ] || [ -z "$SUBNET_ID" ] || [ -z "$SECURITY_GROUP_ID" ] || [ -z "$KEY_NAME" ] || [ -z "$SSH_KEY" ]; then
  usage
fi

if [ ! -x "$BUILD_BUNDLE_SCRIPT" ]; then
  echo "missing bundle builder script: $BUILD_BUNDLE_SCRIPT" >&2
  exit 1
fi
if [ ! -f "$INSTALL_SCRIPT" ]; then
  echo "missing image installer script: $INSTALL_SCRIPT" >&2
  exit 1
fi
if [ ! -f "$SSH_KEY" ]; then
  echo "ssh key not found: $SSH_KEY" >&2
  exit 1
fi

AWS=(aws --profile "$PROFILE" --region "$REGION")

if [ -z "$BASE_AMI_ID" ]; then
  BASE_AMI_ID="$("${AWS[@]}" ssm get-parameter \
    --name /aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id \
    --query 'Parameter.Value' --output text)"
fi

RUNTIME_BUNDLE="$(mktemp -t nex-runtime-bundle).tgz"
INSTANCE_ID=""
PUBLIC_IP=""
SSH_READY="false"

cleanup() {
  if [ -n "$INSTANCE_ID" ] && [ "$KEEP_BUILDER_ON_FAILURE" != "true" ]; then
    "${AWS[@]}" ec2 terminate-instances --instance-ids "$INSTANCE_ID" >/dev/null 2>&1 || true
  fi
}
trap 'rc=$?; if [ $rc -ne 0 ]; then echo "bake-compliant-runtime-ami failed" >&2; fi; cleanup' EXIT

"$BUILD_BUNDLE_SCRIPT" --nex-root "$NEX_ROOT" --output "$RUNTIME_BUNDLE"

INSTANCE_ID="$("${AWS[@]}" ec2 run-instances \
  --image-id "$BASE_AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --network-interfaces "[{\"DeviceIndex\":0,\"AssociatePublicIpAddress\":true,\"SubnetId\":\"${SUBNET_ID}\",\"Groups\":[\"${SECURITY_GROUP_ID}\"]}]" \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"DeleteOnTermination":true,"Encrypted":true,"VolumeSize":32,"VolumeType":"gp3"}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${NAME}-builder},{Key=managed-by,Value=nexus-frontdoor},{Key=role,Value=compliant-runtime-builder}]" \
  --query 'Instances[0].InstanceId' --output text)"

"${AWS[@]}" ec2 wait instance-running --instance-ids "$INSTANCE_ID"
PUBLIC_IP="$("${AWS[@]}" ec2 describe-instances --instance-ids "$INSTANCE_ID" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)"

if [ -z "$PUBLIC_IP" ] || [ "$PUBLIC_IP" = "None" ]; then
  echo "builder did not receive a public IP" >&2
  exit 1
fi

for _ in $(seq 1 60); do
  if ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${PUBLIC_IP}" true >/dev/null 2>&1; then
    SSH_READY="true"
    break
  fi
  sleep 5
done

if [ "$SSH_READY" != "true" ]; then
  echo "builder ssh never became ready" >&2
  exit 1
fi

scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  "$RUNTIME_BUNDLE" "$INSTALL_SCRIPT" "ubuntu@${PUBLIC_IP}:/tmp/"

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${PUBLIC_IP}" \
  "sudo RUNTIME_BUNDLE_TARBALL=/tmp/$(basename "$RUNTIME_BUNDLE") RUNTIME_BUNDLE_STRIP_COMPONENTS=1 bash /tmp/$(basename "$INSTALL_SCRIPT")"

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${PUBLIC_IP}" \
  "sudo test -f /opt/nex/runtime/dist/index.js && sudo test -e /opt/nex/runtime/node_modules"

"${AWS[@]}" ec2 stop-instances --instance-ids "$INSTANCE_ID" >/dev/null
"${AWS[@]}" ec2 wait instance-stopped --instance-ids "$INSTANCE_ID"

AMI_ID="$("${AWS[@]}" ec2 create-image \
  --instance-id "$INSTANCE_ID" \
  --name "$NAME" \
  --description "$NAME" \
  --query 'ImageId' --output text)"

"${AWS[@]}" ec2 wait image-available --image-ids "$AMI_ID"
"${AWS[@]}" ec2 terminate-instances --instance-ids "$INSTANCE_ID" >/dev/null
INSTANCE_ID=""

printf '%s\n' "$AMI_ID"
