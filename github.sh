#!/bin/bash
## This script is invoked by the GitHub workflow ".github/workflows/deploy.yml".
## It expects the following environment variables to be defined:
## - $environment : Either `staging` or `production`
## - $version     : Either the full tarball filename or just its {rc_version}.{commit_hash} substring

set -o errexit

function hr() {
  echo "==========================================================================="
}

hr


## Gather all needed data

rc_dir=/opt/rocket-chat
s3_bucket=seekingalpha-rocketchat-builds

# The RC installation tarball is named "rocket.chat-{rc_version}.{commit_hash}.tgz".
# The $version parameter may be either the full tarball filename or just its {rc_version}.{commit_hash} substring.
if [[ "$version" == rocket.chat-*.tgz ]] ; then
  rc_tarball="$version"
else
  rc_tarball="rocket.chat-$version.tgz"
fi

# Strip off the trailing letter from the region: Use us-west-2, not us-west-2a
export AWS_DEFAULT_REGION=$(ec2metadata --availability-zone | awk '{print substr($0,1,length($0)-1)}')

# We will need to flush the Fastly cache post-deployment because it caches 404s returned by an _old_ server
# which was asked for a versionized file referenced by a _new_ server.
# (Now that we are HUPing servers in parallel rather than serially, the window for this race condition is much smaller,
# however it might not be completely eliminated.)
fastly_service=$(aws ssm get-parameter --name /rocketchat/fastly_service_id --with-decryption --query Parameter.Value --output text)
fastly_token=$(aws ssm get-parameter --name /rocketchat/fastly_api_key --with-decryption --query Parameter.Value --output text)

# Get RC EC2 instance IPs (one per line, as a multiline string, since `parallel-ssh --hosts` expects them in that format)
rc_instance_ips=$(
  aws ec2 describe-instances \
      --filters Name=instance-state-name,Values=running \
                Name=tag:aws:autoscaling:groupName,Values=rocketchat \
      --query "Reservations[*].Instances[*].NetworkInterfaces[0].PrivateIpAddress" \
      --output text
)


## Generate scripts to run on the RC EC2 instances, using the `envsubst` template renderer,
## part of the GNU gettext package.

# *Exported* variables ending in _ENVSUBST will be expanded in the *.tpl template files.
export AWS_DEFAULT_REGION_ENVSUBST=$AWS_DEFAULT_REGION
export ENV_ENVSUBST=$environment
export RC_DIR_ENVSUBST=$rc_dir
export RC_TARBALL_ENVSUBST=$rc_tarball
export S3_BUCKET_ENVSUBST=$s3_bucket

# envsubst only expands template variables it is told about via
# an argument with format '$foo,$bar,$baz'
for dollar__varname__non_final_comma in $(printenv | grep '^\w*_ENVSUBST=' | sed 's/=.*//; s/^/$/; $!s/$/,/') ; do
  envsubst_varlist+=$dollar__varname__non_final_comma
done
envsubst "$envsubst_varlist" < pre_install.sh.tpl    > pre_install.sh
envsubst "$envsubst_varlist" < rotate_version.sh.tpl > rotate_version.sh


## Install RC tarball (and its dependencies) onto all RC nodes
echo "Installing new build onto all RC nodes..."
parallel-ssh \
  -x  "-o StrictHostKeyChecking=no" \
  --inline --timeout 600 --user deploy \
  --hosts <(echo "$rc_instance_ips") \
  --send-input < pre_install.sh            # TODO: Rename to install_tarball.sh
hr

## Activate new version
echo "Activating new build on all RC nodes..."
parallel-ssh \
  -x  "-o StrictHostKeyChecking=no" \
  --inline --timeout 600 --user deploy \
  --hosts <(echo "$rc_instance_ips") \
  --send-input < rotate_version.sh         # TODO: Rename to activate_new_build.sh
hr

## Flush CDN
echo "Flushing $environment CDN..."
curl -X POST -H "Fastly-Key: $fastly_token" "https://api.fastly.com/service/$fastly_service/purge/$environment"
hr

## Update the version marker file
echo "Mark (in S3) which RC build is now active on $environment..."
aws s3 cp "s3://$s3_bucket/$rc_tarball" "s3://$s3_bucket/rocket.chat-$environment.tgz" --acl public-read
hr

echo Done!
