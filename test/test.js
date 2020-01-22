const assert = require('assert');
const timeout = 80000;
const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const token = process.env.TOKEN;
const url = process.env.URL;
const suiteId = process.env.SUITEID;
const additionalDescription = "npm-unit-test"

const loadmill = require('../lib/index.js')({ token });

describe('Validate load-test', () => {
    it('validate loadmill.run()', async () => {
        let isPassed = false;
        try {
            // return --> id: 'uuid'
            const loadTestId = await loadmill.run({ requests: [{ url }] });
            assert.notEqual(loadTestId.match(uuidPattern), null);

            const res = await loadmill.wait(loadTestId);
            if (res !== undefined) {
                isPassed = res.passed;
            }
        } catch (err) {
            console.error("err", err);
        }
        finally {
            assert.equal(isPassed, true);
        }
    }).timeout(timeout);
});

describe('Validate test-suite', () => {

    it('validate runTestSuite', async () => {
        let isPassed = false;
        try {
            // return --> { id: 'uuid', type: 'test-suite' }
            const result = await loadmill.runTestSuite({ id: suiteId, additionalDescription, labels: ["npm-sanity"] });
            assert.notEqual(result.id.match(uuidPattern), null);

            const res = await loadmill.wait(result);
            if (res !== undefined) {
                isPassed = res.passed;
            }

        } catch (err) {
            console.error("err", err);
        }
        finally {
            assert.equal(isPassed, true);
        }
    }).timeout(timeout);
});

