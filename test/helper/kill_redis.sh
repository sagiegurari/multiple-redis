#!/bin/bash

#print which process will be killed
ps -ef | grep $1

#kill the requested process
ps -ef | grep $1 | grep -v grep | awk '{print $2}' | sudo xargs kill -9
