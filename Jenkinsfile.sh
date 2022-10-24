#!/bin/bash

case $JOB_BASE_NAME in
  *staging*)    environment=staging ;;
  *production*) environment=production ;;
  *)            echo "ERROR: Can’t infer environment from job name!"; exit 99 ;;
esac

asg_names="rocketchat rocketchat-upm"

## Strip off the trailing letter from the region: Use us-west-2, not us-west-2a
export AWS_DEFAULT_REGION=$(ec2metadata --availability-zone | awk '{print substr($0,1,length($0)-1)}')

## Exported variables ending in _ARG are for expansion in the .tpl template files.
export AWS_DEFAULT_REGION_ARG=$AWS_DEFAULT_REGION
export ENV_ARG=$environment
export RC_DIR_ARG="/opt/rocket-chat"
export S3_BUCKET_ARG="seekingalpha-rocketchat-builds"

## Render Script Templates
## Note: $version is a Jenkins job parameter
envsubst_varlist='$AWS_DEFAULT_REGION_ARG,$ENV_ARG,$RC_DIR_ARG,$S3_BUCKET_ARG,$version'
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
  ssh -t -l deploy $host < ./rotate_version.sh
done
