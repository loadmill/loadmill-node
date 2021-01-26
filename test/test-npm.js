const assert = require('assert');
require('dotenv').config();
const timeout = 80000;
const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const token = process.env.TOKEN;
const url = process.env.URL;
const suiteId = process.env.SUITE_ID;
const testPlanId = process.env.TEST_PLAN_ID;
const additionalDescription = "npm-unit-test"

const loadmill = require('../lib/index.js')({ token });

describe('Validate load-test', () => {
    it('validate loadmill.run()', async () => {
        let isPassed = false;
        try {
            // return --> id: 'uuid'
            const loadTestId = await loadmill.run({ requests: [{ url }] });
            assert.notStrictEqual(loadTestId.match(uuidPattern), null);

            const res = await loadmill.wait(loadTestId);
            if (res !== undefined) {
                isPassed = res.passed;
            }
        } catch (err) {
            console.error("err", err);
        }
        finally {
            assert.strictEqual(isPassed, true);
        }
    }).timeout(timeout);
});

describe('Validate test-suite', () => {
    it('validate runTestSuite', async () => {
        let isPassed = false;
        try {
            // return --> { id: 'uuid', type: 'test-suite' }
            const result = await loadmill.runTestSuite({
                id: suiteId,
                options: {
                    additionalDescription, labels: ["npm-sanity"]
                }
            });
            assert.notStrictEqual(result.id.match(uuidPattern), null);

            const res = await loadmill.wait(result);
            if (res !== undefined) {
                isPassed = res.passed;
            }

        } catch (err) {
            console.error("err", err);
        }
        finally {
            assert.strictEqual(isPassed, true);
        }
    }).timeout(timeout);

    it('validate runAllExecutableTestSuites', async () => {
        let results;
        results = await loadmill.runAllExecutableTestSuites({
            additionalDescription,
            labels: ["lone star"]
        });
        assert.deepStrictEqual(results, []);
    }).timeout(timeout);
});

describe('Validate test-plan', () => {
    it('Validate test-plan', async () => {
        let isPassed = false;
        try {
            const result = await loadmill.runTestPlan({
                id: testPlanId,
                options: {
                    additionalDescription
                }
            }, 
            {"p1":"from-loadmill-node"}
            );
    
            assert.notStrictEqual(result.id.match(uuidPattern), null);

            const res = await loadmill.wait(result);
            if (res !== undefined) {
                isPassed = res.passed;
            }

        } catch (err) {
            console.error("err", err);
        }
        finally {
            assert.strictEqual(isPassed, true);
        }
    }).timeout(timeout);
});

