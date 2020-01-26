#!/usr/bin/env bash
SUITE_ID=$(grep SUITE_ID .env | cut -d '=' -f2)
TOKEN=$(grep TOKEN .env | cut -d '=' -f2)

NODE_TLS_REJECT_UNAUTHORIZED=0 ./bin/loadmill ${SUITE_ID} -s -w -v -t ${TOKEN} --labels "npm-sanity"