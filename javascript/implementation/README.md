# Typescript Implementation of Gink Database System

The typescript implementation can be used in one of three modes:
* via node.js as a server instance that listens to websocket connections from other instances
* via node.js as an instance that doesn't listen for any incoming connections (but can still make outgoing connections to other instances)
* in a web browser, which can't listen for incoming connections but can still connect to server instances

# Coding Conventions
* Each typescript class should have a CamelCase name and exist in a corresponding CamelCase.ts file, and
should not export anything other than the respective class.
* Non-class code goes in lower case files.
* Files should be formatted according to the visual studio code default formatter.
