
#!/usr/bin/env bash
AWS="/usr/local/bin/aws"
AWS_DEFAULT_REGION=$AWS_DEFAULT_REGION
RC_ENV=$ENV
RC_DIR=$RC_DIR
RC_VERSION=$version
S3_BUCKET=$S3_BUCKET

set -e

function systemctl_rocket {
    find /etc/systemd/system/multi-user.target.wants/ -maxdepth 1 -type l -name 'rocket*' -printf '%f\\n' | xargs -r sudo systemctl "$@"
}

function update_rc {
    sudo mv $RC_DIR{,-old}
    sudo systemctl_rocket stop
    sudo mv $RC_DIR{-new,}
    sudo systemctl_rocket start
    echo "Waiting service to start"
    until $(curl --output /dev/null --silent --head --fail http://localhost)
    do
        printf '.'
        sleep 5
    done
}

function update_current_version_marker {
    local versionized_file
    local current_marker_file
    versionized_file="rocket.chat-$RC_VERSION.tgz"
    current_marker_file="rocket.chat-$RC_ENV.tgz"
    $AWS s3 cp s3://$S3_BUCKET/$versionized_file s3://$S3_BUCKET/$current_marker_file --acl public-read
}

function cleanup {
    sudo rm -rf $RC_DIR-{new,old}
}

update_rc
update_current_version_marker
cleanup
