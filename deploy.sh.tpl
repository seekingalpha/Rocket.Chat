#!/usr/bin/env bash
AWS="/usr/local/bin/aws"
AWS_DEFAULT_REGION="us-west-2"
ASGS="rocketchat rocketchat-upm"
RC_INSTANCES=$(mktemp)
RC_VERSION=$version
RC_ENV=$ENV
S3_BUCKET="seekingalpha-rocketchat-builds"
USER="deploy"

set -e

function prepare_directories () {
  sudo rm -rf /opt/rocket-chat-{new,old}
  sudo mkdir -p /opt/rocket-chat-new
  sudo chown deploy:deploy /opt/rocket-chat-new
}

# Download given RocketChat build
function get_rc {
    local fname
    local s3_path
    fname="rocket.chat-$RC_VERSION.tgz"
    s3_path="s3://$S3_BUCKET/$fname"
    echo "RC filename is $fname"
    echo "s3 path is $s3_path"
    rm -rf /tmp/bundle # Clean up previous unpacked versions if any
    $AWS s3 cp --quiet $s3_path $local_path
    tar zxf $fname
    rm -f $fname
    cd ./bundle
    npm install --quiet --production >/dev/null
}

function update_current_version_marker {
    local versionized_file
    local current_marker_file
    versionized_file="rocket.chat-$RC_VERSION.tgz"
    current_marker_file="rocket.chat-$RC_ENV.tgz"
    $AWS s3 cp s3://$S3_BUCKET/$versionized_file s3://$S3_BUCKET/$current_marker_file --acl public-read
}

function update_rc {
    prepare_directories
    cd /opt/rocket-chat-new
    get_rc
    mv /opt/rocket-chat /opt/rocket-chat-old && mv /opt/rocket-chat-new /opt/rocket-chat
}


function systemctl_rocket {
    find /etc/systemd/system/multi-user.target.wants/ -maxdepth 1 -type l -name 'rocket*' -printf '%f\\n' | xargs -r sudo systemctl "$@"
}

function restart {
    systemctl_rocket restart
    echo "Waiting service to start"
    until $(curl --output /dev/null --silent --head --fail http://localhost)
    do
        printf '.'
        sleep 5
    done
}

function rocketchat_restart() {
    local cooloff_minutes=${1:-5}
    echo -n Will restart servers with a $cooloff_minutes minute sleep... ; sleep 5; echo
    echo Stopping service...
    systemctl_rocket stop
    echo Letting the system chill out for $cooloff_minutes minutes...
    sleep $(( $cooloff_minutes * 60 ))
    echo Starting up ...
    systemctl_rocket start
}

# For testing purposes
cd $(mktemp -d)
get_rc