#!/bin/bash
AWS="/usr/local/bin/aws"
AWS_DEFAULT_REGION=$AWS_DEFAULT_REGION
RC_DIR=$RC_DIR
RC_VERSION=$version
S3_BUCKET=$S3_BUCKET

set -e

# Clean old RC dirs and create new
prepare_directories () {
  sudo rm -rf $RC_DIR-{new,old}
  sudo mkdir -p $RC_DIR-new
}

# Download given RocketChat build
build_rc () {
    local fname
    local s3_path
    fname="rocket.chat-$RC_VERSION.tgz"
    s3_path="s3://$S3_BUCKET/$fname"
    cd $(mktemp -d)
    $AWS s3 cp --quiet "$s3_path" .
    tar zxvf "$fname"
    rm -f "$fname"
    npm install --production --prefix ./bundle/programs/server
    sudo cp ./bundle $RC_DIR-new/
}

prepare_directories
build_rc
