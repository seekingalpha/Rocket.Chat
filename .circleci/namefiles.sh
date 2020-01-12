#!/bin/bash
set -euvo pipefail
IFS=$'\n\t'

ln -s /tmp/build/Rocket.Chat.tar.gz "$ROCKET_DEPLOY_DIR/rocket.chat-$ARTIFACT_NAME.tgz"
ln -s /tmp/build/Rocket.Chat.tar.gz "$ROCKET_DEPLOY_DIR/rocket.chat-latest.tgz"
