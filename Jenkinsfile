pipeline {
    
    agent any

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        stage('Build and deploy') {
            steps {
                script {
                    withEnv(["version=$version"]) {
                        shell('./Jenkinsfile.sh')
                    }
                    cleanWs()
                }
            }
        }
    }
}
