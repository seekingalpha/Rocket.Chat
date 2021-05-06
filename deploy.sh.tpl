#!/bin/bash
AWS="/usr/local/bin/aws"
AWS_DEFAULT_REGION=$AWS_DEFAULT_REGION
RC_ENV=$ENV
RC_DIR=$RC_DIR
RC_VERSION=$version
S3_BUCKET=$S3_BUCKET

set -e

# Find Rocket.Chat service name
systemctl_rocket () {
    find /etc/systemd/system/multi-user.target.wants/ -maxdepth 1 -type l -name 'rocket*' -printf '%f\n' | xargs -r sudo systemctl "$@"
}

# Perform server liveness check
rocket_restart_w_check () {
    echo "Restarting service..."
    systemctl_rocket restart
    echo "Waiting service to start..."
    until $(curl --output /dev/null --silent --head --fail http://localhost)
    do
        printf '.'
        sleep 2
    done
}

# Switch previous version with current
update_rc () {
    echo "Stopping service..."
    systemctl_rocket stop
    echo "Switching versions..."
    sudo mv $RC_DIR{,-old}
    sudo mv $RC_DIR{-new,}
    rocket_restart_w_check
}

# Declare given vesion as latest in current environment
update_current_version_marker () {
    local versionized_file
    local current_marker_file
    versionized_file="rocket.chat-$RC_VERSION.tgz"
    current_marker_file="rocket.chat-$RC_ENV.tgz"
    echo "Marking up the latest version for $RC_ENV..."
    $AWS s3 cp s3://$S3_BUCKET/$versionized_file s3://$S3_BUCKET/$current_marker_file --acl public-read
}

# Delete previous version
cleanup () {
    echo "Cleaning up old directories..."
    sudo rm -rf $RC_DIR-old
}

update_rc
update_current_version_marker
cleanup
