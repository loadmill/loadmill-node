#!/usr/bin/env bash
TOKEN=$(grep TOKEN .env | cut -d '=' -f2)
TEST_PLAN_ID=$(grep TEST_PLAN_ID .env | cut -d '=' -f2)

./bin/loadmill --test-plan ${TEST_PLAN_ID} -j --junit-report-path="./test/tmp/cli" -m --mochawesome-report-path="./test/tmp/cli" --fetch-flow-runs -w -v -t ${TOKEN} --report --colors --additional-description 'loadmill-node-cli-test-plan'