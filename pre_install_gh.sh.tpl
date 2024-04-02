#!/bin/bash

echo "run pre"


#AWS="/usr/local/bin/aws"
#AWS_DEFAULT_REGION=$AWS_DEFAULT_REGION_ENVSUBST
#RC_DIR=$RC_DIR_ENVSUBST
#RC_FILE=$RC_TARBALL_ENVSUBST
#S3_BUCKET=$S3_BUCKET_ENVSUBST
#
#set -e
#
## Clean old RC dirs and create new
#prepare_directories () {
#  echo "Removing previous release's directories..."
#  sudo rm -rf $RC_DIR-{new,old}
#  sudo mkdir -p $RC_DIR-new
#}
#
## Download given RocketChat build
#build_rc () {
#    local s3_path
#    s3_path="s3://$S3_BUCKET/$RC_FILE"
#    tmprcdir=$(mktemp -d)
#    cd $tmprcdir
#    echo "Downloading Rocket.Chat installation files.."
#    $AWS s3 cp --quiet "$s3_path" .
#    echo "Unpacking Rocket.Chat files..."
#    tar zxf "$RC_FILE"
#    rm -f "$RC_FILE"
#    echo "Installing modules..."
#    # loglevels (high to low): error, warn, notice, http, timing, info, verbose, silly
#    #   default = notice
#    #   To disable logging, set loglevel to `silent`
#    #   However, even with `silent` the "package_name@version install_folder" lines are still shown
#    npm_config_loglevel=warn npm install --production --prefix ./bundle/programs/server
#    echo "Copying to the new location..."
#    sudo mv ./bundle $RC_DIR-new/
#    rm -rf $tmprcdir
#}
#
#prepare_directories
#build_rc
