#!/bin/bash

set -o errexit

case $ENVIRONMENT_NAME in
  *staging*)    environment=staging ;;
  *production*) environment=production ;;
  *)            echo "ERROR: Can’t infer environment from job name!"; exit 99 ;;
esac

echo $environment

rc_dir="/opt/rocket-chat"
s3_bucket="seekingalpha-rocketchat-builds"

## Note: $version is a Jenkins job parameter.
## We accept either the full tarball filename or just its version substring.
if [[ "$version" == rocket.chat-*.tgz ]]
then
  rc_tarball="$version"
else
  rc_tarball="rocket.chat-$version.tgz"
fi

function hr() {
  echo "==========================================================================="
}


## Strip off the trailing letter from the region: Use us-west-2, not us-west-2a
export AWS_DEFAULT_REGION=$(ec2metadata --availability-zone | awk '{print substr($0,1,length($0)-1)}')

## EXPORTED variables ending in _ENVSUBST are for expansion in the .tpl template files.
export AWS_DEFAULT_REGION_ENVSUBST=$AWS_DEFAULT_REGION
export ENV_ENVSUBST=$environment
export RC_DIR_ENVSUBST=$rc_dir
export S3_BUCKET_ENVSUBST=$s3_bucket
export RC_TARBALL_ENVSUBST=$rc_tarball

echo "print ENVSUBST env:"
env | grep "ENVSUBST"

## Render Script Templates
envsubst_varlist='$ENV_ENVSUBST $RC_TARBALL_ENVSUBST $AWS_DEFAULT_REGION_ENVSUBST $S3_BUCKET_ENVSUBST $RC_DIR_ENVSUBST'

envsubst '$ENV_ENVSUBST $RC_TARBALL_ENVSUBST $AWS_DEFAULT_REGION_ENVSUBST $S3_BUCKET_ENVSUBST $RC_DIR_ENVSUBST' < ./pre_install_gh.sh.tpl  > ./pre_install.sh
envsubst '$ENV_ENVSUBST $RC_TARBALL_ENVSUBST $AWS_DEFAULT_REGION_ENVSUBST $S3_BUCKET_ENVSUBST $RC_DIR_ENVSUBST' < ./rotate_version_gh.sh.tpl > ./rotate_version.sh

echo "print script pre_install.sh:"
cat pre_install.sh
echo "print script rotate_version.sh:"
cat rotate_version.sh


## When deploying to production, run using the "rocketchat-deploy" role
if [[ $environment == production ]] ; then
  assumed_role_json=$(
    aws \
      --output json \
      sts assume-role \
      --role-arn arn:aws:iam::618678420696:role/switch-account-deploy-rocket-chat \
      --role-session-name rocketchat-deploy
  )
  assumed_role_variables=$(
    echo "${assumed_role_json}" | jq -r \
    '
      "export AWS_SESSION_TOKEN=" + .Credentials.SessionToken + "\n" +
      "export AWS_ACCESS_KEY_ID=" + .Credentials.AccessKeyId + "\n" +
      "export AWS_SECRET_ACCESS_KEY=" + .Credentials.SecretAccessKey + "\n"
    '
  )
  eval "$assumed_role_variables"
fi

## Get instance IPs one per line (multiline string)
rc_instance_ips=$(
  aws ec2 describe-instances \
      --filters Name=instance-state-name,Values=running \
                Name=tag:aws:autoscaling:groupName,Values=rocketchat \
      --query "Reservations[*].Instances[*].NetworkInterfaces[0].PrivateIpAddress" \
      --output text
)


## Install RC tarball (and its dependencies) onto all RC nodes
hr
echo "Installing new build onto all RC nodes:"
parallel-ssh \
  -x  "-o StrictHostKeyChecking=no" \
  --inline --timeout 600 --user deploy \
  --hosts <(echo "$rc_instance_ips") \
  --send-input < ./pre_install.sh
hr

## Activate new version
echo "Activating new build on all RC nodes:"
parallel-ssh \
  -x  "-o StrictHostKeyChecking=no" \
  --inline --timeout 600 --user deploy \
  --hosts <(echo "$rc_instance_ips") \
  --send-input < ./rotate_version.sh
hr

## Update the version marker file
echo "Mark which RC build is now active..."
current_marker_file="rocket.chat-$environment.tgz"
aws s3 cp "s3://$s3_bucket/$rc_tarball" "s3://$s3_bucket/$current_marker_file" --acl public-read
hr

## Flush CDN
echo "Flushing $environment CDN"
unset AWS_SESSION_TOKEN
unset AWS_ACCESS_KEY_ID
unset AWS_SECRET_ACCESS_KEY
FASTLY_SERVICE=$(aws ssm get-parameter --name /rocketchat/fastly_service_id --with-decryption --query Parameter.Value --output text)
FASTLY_TOKEN=$(aws ssm get-parameter --name /rocketchat/fastly_api_key --with-decryption --query Parameter.Value --output text)
curl -X POST -H "Fastly-Key: $FASTLY_TOKEN" "https://api.fastly.com/service/$FASTLY_SERVICE/purge/$environment"
