#!/bin/bash

# When running under docker-compose we want to make sure CouchDB has started
echo 'Delaying start 5 seconds'
sleep 5
# Now we want to make sure the DNS is resolving for the hostname
counter=0


# try this 30 times
# 30 * 5 seconds is 5 minutes max time to wait

while true; do
  if [[ "$counter" -gt 30 ]]; then
    break
  fi

  reverseDNS=$(host $DB_HOST)
  if [ $? != 0 ]; then 
    printf '%s\n' "$DB_HOST did not resolve. Waiting"      
    sleep 10
    ((counter++))
  else
    # it did resolve
    break
  fi
done

if [ $counter -gt 30 ]; then
  # looking up the hostname failed! 
  printf '%s\n' "Unable to resolve $DB_HOST. Server cannot start. Failing!"
  exit 101 # 101 is "network unreachable" in some commands, which seems appopriate
else
  # the host did resolve
  printf '%s\n' "Starting Server!"
  node --trace-warnings ./dist/server.js#
fi
