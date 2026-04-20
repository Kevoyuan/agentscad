#!/bin/bash
while true; do
  cd /home/z/my-project
  node node_modules/.bin/next dev -p 3000 2>&1
  echo "Server died, restarting in 5s..." >> /home/z/my-project/dev.log
  sleep 5
done
