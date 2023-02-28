# RC deploy scripts

Overview of the deploy process:
- The Jenkins job is configured to run a Groovy script named `Jenkinsfile`,
  passing it the job parameters (currently, just `version`)
- The `Jenkinsfile` script invokes `Jenkinsfile.sh`, passing on all job parameters as environment variables
- `Jenkinsfile.sh` uses the `*.sh.tpl` template files to prepare `*.sh` files which are executed on
  the rocketchat nodes via ssh:
  - `pre_install.sh` installs the RC bundle tarball and its dependencies into a temporary folder
  - `rotate_version.sh` swaps out the old installation folder with the new one
