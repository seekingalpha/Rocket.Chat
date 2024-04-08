This repo contains Seeking Alpha's customized version
of the Rocket.Chat server and web client.  That code
may be found in any of the `sa_patches_1.2.3` branches,
which are forks of the `1.2.3` release tags, with our
custom patches re-cherry-picked onto each new release.

This branch (`sa_devops`), however, is a mostly empty
branch which serves two purposes:
  - The "Deploy to EC2" workflow, which copies a tarball
    from S3 onto the various RC EC2 instances and relaunches
    the RocketChat servers from it.
  - The "Rotate AWS secrets" monthly cronjob

GitHub requires a branch to be marked as the "default" branch,
which is used for three purposes:
  - Default target for new PRs
  - Definition of the scheduled cronjob workflows
  - Adds a "Run workflow" button to the Workflow run-history page
    if a `on: workflow_dispatch:` is defined for this workflow.
    (You may choose another branch to actually *run* workflow code,
    but the button only appears if the default branch defines it.)

# The Deployment Process
- The Deploy job (defined in .github/workflows/deploy.yml)
  obtains credentials and runs `./github.sh`
- `github.sh` uses the `*.sh.tpl` template files to prepare `*.sh` files
  which are executed on the rocketchat EC2 nodes via ssh:
  - `install_tarball.sh` installs the RC bundle tarball and its dependencies into a temporary folder
  - `activate_new_build.sh` swaps out the old installation folder with the new one and HUPs the daemon
