#!/usr/bin/env bash
SUITE_ID=$(grep SUITE_ID .env | cut -d '=' -f2)
TOKEN=$(grep TOKEN .env | cut -d '=' -f2)
TEST_PLAN_ID=$(grep TEST_PLAN_ID .env | cut -d '=' -f2)

./bin/loadmill ${SUITE_ID} -s -w -v -t ${TOKEN} --labels "npm-sanity" --report --colors
./bin/loadmill -t ${TOKEN} -a --labels "lone star" --report --colors
./bin/loadmill --test-plan ${TEST_PLAN_ID} -j --junit-report-path="./test/tmp/cli" -m --mochawesome-report-path="./test/tmp/cli" --fetch-flow-runs -w -v -t ${TOKEN} --report --colors