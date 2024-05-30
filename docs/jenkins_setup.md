# Jenkins Setup (internal use)

## Steps

### Create a fresh user on the Raspberry Pi (or other server) and add it to the docker group.
```sh
sudo useradd -m -G docker jenkins
```
Set the password
```sh
sudo passwd jenkins
```
Give this user sudo access
```sh
sudo usermod -aG sudo jenkins
```
Login as the new user
```sh
su jenkins
```

### Install Jenkins

```sh
sudo wget -O /usr/share/keyrings/jenkins-keyring.asc \
  https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key
echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc]" \
  https://pkg.jenkins.io/debian-stable binary/ | sudo tee \
  /etc/apt/sources.list.d/jenkins.list > /dev/null
sudo apt-get update
sudo apt-get install jenkins
```

If Java is not already installed, you will need to install it.
```sh
sudo apt update
sudo apt install fontconfig openjdk-17-jre
```

Enable the Jenkins service to start at boot
```sh
sudo systemctl enable jenkins
```

Before we start Jenkins, we need to change the default port it will listen on.
```sh
sudo systemctl edit jenkins
```
Add the following to the top part of the file, and :wq
```
[Service]
Environment="JENKINS_PORT=31443"
```

Start the Jenkins service
```sh
sudo systemctl start jenkins
```

Check the status of the Jenkins service
```sh
sudo systemctl status jenkins
```

If everything has been set up correctly, you should see an output like this:

```
Loaded: loaded (/lib/systemd/system/jenkins.service; enabled; vendor preset: enabled)
Active: active (running) since Tue 2018-11-13 16:19:01 +03; 4min 57s ago
```

### Configure Jenkins

Navigate a web browser to `http://localhost:31443' <br>
<br>
Find the administrator password from the file on the screen, or from the console and paste it. <br>
<br>
Click "Select plugins to install" <br>
<br>
At the top, click the "None" button.<br>
<br>
Now select the following plugins:
```
Folders
Build Timeout
Timestamper
Pipeline
Git
GitHub
SSH Build Agents
```

Create an admin user. I recommend just using the same credentials as the user on the Raspberry Pi.<br>
<br>
When you are prompted to enter a Jenkins URL, <strong>MAKE SURE TO PUT THE PUBLIC FACING IP.</strong>
Localhost will not work. The url should look like http://ip.address:31443/ <br>
<br>

### Create a job
On the left side, click "New Item" <br>
<br>
Name it whatever, I chose "rpi-integration".<br>
<br>
Choose "Freestyle project"<br>
<br>
Feel free to add a description.<br>
<br>
Under "Source Code Management" select "Git". Enter "https://github.com/x5e/gink.git" into the "Repository URL" field.<br>
<br>
Under "Branches to build", use the branch specifier "origin**".<br>
<br>
Add a build step, and enter the command "docker build ."<br>
<br>
Click save.<br>
<br>
Assuming the GitHub action has already been configured correctly, this job should checkout the branch that had changes and build the docker image on that branch.
