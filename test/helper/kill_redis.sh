#!/bin/bash

#print which process will be killed
ps -ef | grep redis-server | grep $1 | grep -v grep

#kill the requested process
ps -ef | grep redis-server | grep $1 | grep -v grep | awk '{print $2}' | sudo xargs kill -9
