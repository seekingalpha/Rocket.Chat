#!/bin/bash
AWS="/usr/local/bin/aws"
AWS_DEFAULT_REGION=$AWS_DEFAULT_REGION_ARG
RC_DIR=$RC_DIR_ARG
RC_FILE=$RC_TARBALL_ARG
S3_BUCKET=$S3_BUCKET_ARG

set -e

# Clean old RC dirs and create new
prepare_directories () {
  echo "Removing previous release's directories..."
  sudo rm -rf $RC_DIR-{new,old}
  sudo mkdir -p $RC_DIR-new
}

# Download given RocketChat build
build_rc () {
    local s3_path
    s3_path="s3://$S3_BUCKET/$RC_FILE"
    tmprcdir=$(mktemp -d)
    cd $tmprcdir
    echo "Downloading Rocket.Chat installation files.."
    $AWS s3 cp --quiet "$s3_path" .
    echo "Unpacking Rocket.Chat files..."
    tar zxf "$RC_FILE"
    rm -f "$RC_FILE"
    echo "Installing modules..."
    npm install --quiet --production --prefix ./bundle/programs/server
    echo "Copying to the new location..."
    sudo mv ./bundle $RC_DIR-new/
    rm -rf $tmprcdir
}

prepare_directories
build_rc
