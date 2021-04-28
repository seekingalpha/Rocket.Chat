#!/usr/bin/env bash
AWS="/usr/local/bin/aws"
AWS_DEFAULT_REGION=$AWS_DEFAULT_REGION
RC_DIR=$RC_DIR
RC_VERSION=$version
S3_BUCKET=$S3_BUCKET

set -e

# Clean old RC dirs and create new
function prepare_directories () {
  sudo rm -rf $RC_DIR-{new,old}
  sudo mkdir -p $RC_DIR-new
}

# Download given RocketChat build
function build_rc {
    local fname
    local s3_path
    fname="rocket.chat-$RC_VERSION.tgz"
    s3_path="s3://$S3_BUCKET/$fname"
    cd $(mktemp -d)
    $AWS s3 cp --quiet $s3_path .
    tar zxf $fname
    rm -f $fname
    npm install --production --prefix ./bundle/programs/server
    sudo cp ./bundle $RC_DIR-new/
    sudo chown -R deploy:deploy $RC_DIR-new
}

# Find RocketChat service name
function systemctl_rocket {
    find /etc/systemd/system/multi-user.target.wants/ -maxdepth 1 -type l -name 'rocket*' -printf '%f\\n' | xargs -r sudo systemctl "$@"
}

function restart_rocket {
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

prepare_directories
build_rc
