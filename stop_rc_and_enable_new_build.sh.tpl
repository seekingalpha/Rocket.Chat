#!/bin/bash
RC_DIR='$RC_DIR_ENVSUBST'

set -e

main () {
    stop_rc
    move_new_rc_build_into_place
}

stop_rc () {
    echo "Stopping RC service..."
    systemctl_rocket stop
    for service in $(rocketchat_systemd_service_names)
    do
        echo "Waiting for service ${service} to be 'inactive'..."
        until [ "$(systemctl show $service -p ActiveState)" = "ActiveState=inactive" ]
        do
            echo "    waiting..."
            sleep 2
        done
    done
    echo "RC service stopped!"
}

# Run a systemctl command on RC services
systemctl_rocket () {
    rocketchat_systemd_service_names | xargs --no-run-if-empty sudo systemctl "$@"
}

# Typically these will be "rocket.service" on staging
# and "rocket@800[012].service" on production.
rocketchat_systemd_service_names () {
    find /etc/systemd/system/multi-user.target.wants/ -maxdepth 1 -type l -name 'rocket*' -printf '%f\n'
}

move_new_rc_build_into_place () {
    echo "Moving new RC build into place..."
    sudo mv $RC_DIR{,-old}
    sudo mv $RC_DIR{-new,}
}


main
