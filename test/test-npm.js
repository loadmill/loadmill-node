const assert = require('assert');
const fs = require('fs');
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

describe('Validate test-plan', () => {
    it('Validate test-plan with mochawesomeReport', async () => {
        const testPlan = await loadmill.runTestPlan({
            id: testPlanId,
            options: {
                additionalDescription
            }
        },
            { "p1": "from-loadmill-node" }
        );

        assert.notStrictEqual(testPlan.id.match(uuidPattern), null);

        res = await loadmill.wait(testPlan);
        assert.strictEqual(res.passed, true);
        await loadmill.mochawesomeReport(res, `${__dirname}/tmp/npm`);
        const data = fs.readFileSync(`${__dirname}/tmp/npm/loadmill/results.json`, { encoding: 'utf8', flag: 'r' });
        const dataObj = JSON.parse(data);
        const { suites, tests, passes, failures } = dataObj.stats;
        assert.strictEqual(suites, 1);
        assert.strictEqual(tests, 1);
        assert.strictEqual(passes, 1);
        assert.strictEqual(failures, 0);

        const flows = dataObj.results[0].suites[0].tests;
        assert.strictEqual(flows.length, 3);
        flows.map(f => {
            assert.strictEqual(f.pass, true);
            assert.strictEqual(f.fail, false);
            assert.strictEqual(f.state, "passed");
        })

    }).timeout(timeout);
});

