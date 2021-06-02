pipeline {
    
    agent any

    options { timestamps () }

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
                        sh './Jenkinsfile.sh'
                    }
                }
            }
        }
    }
}
