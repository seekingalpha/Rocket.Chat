#!/bin/bash
## This script is invoked by the GitHub workflow ".github/workflows/deploy.yml".
## It expects the following environment variables to be defined:
## - $environment : Either `staging` or `production`
## - $version     : Either the full tarball filename or just its {rc_version}.{commit_hash} substring

set -o errexit

function hr() {
  echo "==========================================================================="
}

function run_script_on_ec2_instances() {
  local script_file=${1:?}
  local ip_list_as_multiline_string=${2:?}
  parallel-ssh \
    -x "-o StrictHostKeyChecking=no" \
    --inline --timeout 600 \
    --user deploy \
    --hosts <(echo "$ip_list_as_multiline_string") \
    --send-input < "$script_file"
}


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
all_rc_ec2_instance_ips=$(
  aws ec2 describe-instances \
      --filters Name=instance-state-name,Values=running \
                Name=tag:aws:autoscaling:groupName,Values=rocketchat \
      --query "Reservations[*].Instances[*].NetworkInterfaces[0].PrivateIpAddress" \
      --output text
)
first_rc_ec2_instance_ip=$(echo "$all_rc_ec2_instance_ips" | head -1)
other_rc_ec2_instance_ips=$(echo "$all_rc_ec2_instance_ips" | tail -n +2)


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
envsubst "$envsubst_varlist" < install_tarball.sh.tpl              > install_tarball.sh
envsubst "$envsubst_varlist" < stop_rc_and_enable_new_build.sh.tpl > stop_rc_and_enable_new_build.sh
envsubst "$envsubst_varlist" < start_rc.sh.tpl                     > start_rc.sh

## Update the version marker file
echo "Mark (in S3) which RC build is now active on $environment..."
aws s3 cp "s3://$s3_bucket/$rc_tarball" "s3://$s3_bucket/rocket.chat-$environment.tgz" --acl public-read
hr

## Install RC tarball (and its dependencies) onto all RC nodes
echo "Installing new build onto all RC nodes..."
run_script_on_ec2_instances install_tarball.sh "$all_rc_ec2_instance_ips"
hr

## Shut down old RC
# Copy the new build into place so the new version can be started manually if needed.
echo "Shut down all RC nodes and move the new build into place..."
run_script_on_ec2_instances stop_rc_and_enable_new_build.sh "$all_rc_ec2_instance_ips"
hr


## Activate new version
# Start up only one instance, initially, then the others.
# When multiple RC instances come online after an upgrade, they all try to run migrations
# and to add new settings to `db.rocketchat_settings`.  RC seems to have proper locking
# mechanisms for running migrations – only one instance runs the migrations while the others block –
# however it does not do so for adding settings – other instances try to add missing settings
# in a race condition, leading to “duplicate key error” exceptions inserting new records into MongoDB.
# Avoid this by starting only one instance and after it is online, continue with the others.
echo "Activating new build on all RC nodes..."
echo "First node..."
run_script_on_ec2_instances start_rc.sh "$first_rc_ec2_instance_ip"
run_script_on_ec2_instances start_rc.sh "$other_rc_ec2_instance_ips"
hr

## Flush CDN
echo "Flushing $environment CDN..."
curl -X POST -H "Fastly-Key: $fastly_token" "https://api.fastly.com/service/$fastly_service/purge/$environment"
hr

echo Done!
