Forkable CI
===========

Deploy Coursefork using [gruntjs](http://gruntjs.com/).

Overview
--------

Single repo, 3 different "modes."

* deploy to a remote machine from your local machine
* execute deployment steps on remote machine
* heroku web listener for github service hooks

Installation
------------

You'll need to have the grunt command line tool installed globally.

  npm install -g grunt-cli

Then clone or fork this repo.

Configuration
-------------

You'll need a JSON host file containing:

* host - hostname or IP address of host deploying to
* username - user that logs into remote machine over ssh
* privateKey - path to your privateKey (public key needs to be added to remote machine)

Usage
-----

For deploying to remote machine:

  PASS=<passphrase> grunt deploy --remote <path to config file>

