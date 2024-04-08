#!/bin/bash
RC_DIR='$RC_DIR_ENVSUBST'

set -e

# Find Rocket.Chat service names
find_rocket () {
    find /etc/systemd/system/multi-user.target.wants/ -maxdepth 1 -type l -name 'rocket*' -printf '%f\n'
}

# activate command on Rocket.Chat
systemctl_rocket () {
    find_rocket | xargs --no-run-if-empty sudo systemctl "$@"
}

stop_rc () {
    echo "Stopping service..."
    systemctl_rocket stop
    echo "Waiting for service to stop..."
    for service in $(find_rocket)
    do
        until [ "$(systemctl show $service -p ActiveState)" = "ActiveState=inactive" ]
        do
            printf '.'
            sleep 2
        done
    done
}

start_rocket_and_wait_for_response () {
    echo "Starting service..."
    systemctl_rocket start
    echo "Waiting 1 minute for service to start..."
    timeout=60
    until $(curl --output /dev/null --silent --head --fail http://localhost)
    do
        if [ "$timeout" = "0" ]
        then
            echo -e "\nWaiting timed out - Rocket.Chat not responding yet"
            exit 1
        fi
        printf '.'
        timeout=$((timeout - 2))
        sleep 2
    done
}

# Switch previous version with current
update_rc () {
    stop_rc
    echo "Switching versions..."
    sudo mv $RC_DIR{,-old}
    sudo mv $RC_DIR{-new,}
    start_rocket_and_wait_for_response
}

# Delete previous version
cleanup () {
    echo "Cleaning up old directories..."
    sudo rm -rf $RC_DIR-old
}

update_rc
cleanup
