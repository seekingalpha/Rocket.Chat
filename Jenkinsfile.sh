#!/bin/bash

case $JOB_BASE_NAME in
  *staging*)    environment=staging ;;
  *production*) environment=production ;;
  *)            echo "ERROR: Can’t infer environment from job name!"; exit 99 ;;
esac

asg_names="rocketchat rocketchat-upm"

## Note: $version is a Jenkins job parameter.
## We accept either the full tarball filename or just its version substring.
if [[ "$version" == rocket.chat-*.tgz ]]
then
  rc_tarball="$version"
else
  rc_tarball="rocket.chat-$version.tgz"
fi

## Strip off the trailing letter from the region: Use us-west-2, not us-west-2a
export AWS_DEFAULT_REGION=$(ec2metadata --availability-zone | awk '{print substr($0,1,length($0)-1)}')

## EXPORTED variables ending in _ARG are for expansion in the .tpl template files.
export AWS_DEFAULT_REGION_ARG=$AWS_DEFAULT_REGION
export ENV_ARG=$environment
export RC_DIR_ARG="/opt/rocket-chat"
export S3_BUCKET_ARG="seekingalpha-rocketchat-builds"
export RC_TARBALL_ARG=$rc_tarball

## Render Script Templates
envsubst_varlist=$( ruby -e 'puts ENV.keys.select{ |name| name.end_with?("_ARG") }.map{ |name| "$#{name}" }.join(",")' )
envsubst "$envsubst_varlist" < ./pre_install.sh.tpl  > ./pre_install.sh
envsubst "$envsubst_varlist" < ./rotate_version.sh.tpl > ./rotate_version.sh

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
  for asg in $asg_names ; do
      aws ec2 describe-instances \
          --filters Name=instance-state-name,Values=running \
                    Name=tag:aws:autoscaling:groupName,Values=$asg \
          --query "Reservations[*].Instances[*].NetworkInterfaces[0].PrivateIpAddress" \
          --output text
  done
)

## Parallel build via pssh
parallel-ssh \
  --inline --timeout 300 --user deploy \
  --hosts <(echo "$rc_instance_ips") \
  --send-input < ./pre_install.sh

## One by one rotate the running code via ssh
for host in $rc_instance_ips ; do
  echo "-----------------------------"
  echo "Applying new version to $host"
  ssh -t -l deploy $host < ./rotate_version.sh
done

# Update current version marker to deployed in environment
current_marker_file="rocket.chat-$environment.tgz"
echo "Marking up the latest version for $environment..."
aws s3 cp "s3://$S3_BUCKET_ARG/$rc_tarball" "s3://$S3_BUCKET_ARG/$current_marker_file" --acl public-read

## flush CDN after letting the last host a bit more time to truly come up
echo "Flushing $environment CDN"
sleep 30
FASTLY_SERVICE=$(aws ssm get-parameter --name /rocketchat/fastly_service_id --with-decryption --query Parameter.Value --output text)
FASTLY_TOKEN=$(aws ssm get-parameter --name /rocketchat/fastly_api_key --with-decryption --query Parameter.Value --output text)
curl -X POST -H "Fastly-Key: $FASTLY_TOKEN" "https://api.fastly.com/service/$FASTLY_SERVICE/purge/$environment"
