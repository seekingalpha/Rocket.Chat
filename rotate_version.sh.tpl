#!/bin/bash
AWS="/usr/local/bin/aws"
AWS_DEFAULT_REGION=$AWS_DEFAULT_REGION_ARG
RC_ENV=$ENV_ARG
RC_DIR=$RC_DIR_ARG
RC_VERSION=$version
S3_BUCKET=$S3_BUCKET_ARG

set -e

# Find Rocket.Chat service name
systemctl_rocket () {
    find /etc/systemd/system/multi-user.target.wants/ -maxdepth 1 -type l -name 'rocket*' -printf '%f\n' | xargs --no-run-if-empty sudo systemctl "$@"
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

# Delete previous version
cleanup () {
    echo "Cleaning up old directories..."
    sudo rm -rf $RC_DIR-old
}

update_rc
cleanup
