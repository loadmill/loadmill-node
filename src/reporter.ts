import * as fs from "fs";
import * as path from "path";
import * as Loadmill from "./index";
import * as superagent from 'superagent';
const pLimit = require('p-limit');

import flatMap = require('lodash/flatMap');
import isEmpty = require('lodash/isEmpty');
import find = require('lodash/find');
import forEach = require('lodash/forEach');
import includes = require('lodash/includes');

import { TESTING_HOST, sleep } from './utils';

const testingServer = "https://" + TESTING_HOST;

const POLLING_INTERVAL_MS = 5000;
const MAX_POLLING = 36; // 3 minutes

const generateJunitReport = async (
    testId: string,
    runType: Loadmill.TYPES,
    token: string
): Promise<string | undefined> => {
    try {
        const { body: { junitReportId } } = await superagent.post(junitReportAPI)
            .send({ testId, runType })
            .auth(token, '');
    
        return junitReportId;
    } catch (err) {
        handleJunitFailed(err.message);
    }
};

const waitForAndSaveJunitReport = async (reportId: string, token: string, path?: string) => {
    let polling_count = 0;

    while (polling_count < MAX_POLLING) {
        try {
            const { body: { junitReport } } = await superagent.get(`${junitReportAPI}/${reportId}`)
                .auth(token, '');

            saveJunitReport(junitReport, path);
            break;
        }
        catch (err) {
            if (err.status !== 404) {
                handleJunitFailed(err.message);
                break;
            }
        }

        polling_count ++;
        await sleep(POLLING_INTERVAL_MS);
    }

    if (polling_count === MAX_POLLING) {
        handleJunitFailed('Generating report took too long. Please contact support');
    }
};

const saveJunitReport = (junitReport: string, path?: string) => {
    const resolvedPath = resolvePath(path ? path : './test-results', 'xml');
    ensureDirectoryExistence(resolvedPath);
    fs.writeFileSync(resolvedPath, junitReport);
};

const handleJunitFailed = (errMsg?) => {
    console.log(`Failed to generate JUnit report${errMsg ? `: ${errMsg}` : '' }`);
};

const ensureDirectoryExistence = (filePath) => {
    var dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

const resolvePath = (path: string, suffix) => {
    if (path.charAt(path.length - 1) == '/') {
        path = path.substr(0, path.length - 1);
    }
    return `${path}/loadmill/results.${suffix}`
}

// TODO this all flow should come from @loadmill package
const toFailedFlowRunReport = (flowRun, formater) => {
    const errs: Array<string> = [];
    const { result, redactableResult } = flowRun;
    if (result.flow) {
        const { flow, afterEach } = result;
        appendFlowRunFailures(errs, formater, flow, redactableResult.flow);
        
        if (afterEach) {
            appendFlowRunFailures(errs, formater, afterEach, redactableResult.afterEach, flow.resolvedRequests.length);
        }
    } 
    else {
        appendFlowRunFailures(errs, formater, result, redactableResult);
    }

    return errs;
};

const appendFlowRunFailures = (errs: string[], formater, result, redactableResult, offset: number = 0) => {
    const { resolvedRequests, failures, err } = result as any;

    if (Array.isArray(resolvedRequests) && resolvedRequests.length > 0) {
        resolvedRequests.map((req, i) => {
            const { description, method, url, assert = [] } = req;
            const postParameters = redactableResult && redactableResult[i].postParameters;

            const reqFailures = failures && failures[i];
            const numSuccesses = 1;
            const { histogram = {}, numFailures = 0 } = reqFailures || {};
            const totalNumRequests = numSuccesses + numFailures;

            if (numFailures > 0) {
                let flowFailedText = `${genReqDesc(i + offset)} ${description ? genReqDesc(i + offset, description) : ''} ${method} ${url} =>`;

                const assertionNames = Object.keys(assert);
                const requestErrorNames = Object.keys(histogram).filter(
                    (name) => !includes(assertionNames, name)
                );

                requestErrorNames.map((name) => {
                    flowFailedText += ` ${name} `;
                });

                errs.push(flowFailedText);

                const flatPostParameters = flatMap(postParameters);
                const assertionItems = getItems(
                    assertionNames,
                    histogram,
                    totalNumRequests);
                forEach(assertionItems, (assertion) => {
                    if (assert[assertion.name]) {
                        const check = assert[assertion.name].check;
                        const actual = getActualValue(
                            assertion.errorRate,
                            flatPostParameters,
                            check
                        );
                        if (actual) {
                            const assErr = generateAssertionName(
                                assert[assertion.name],
                                actual,
                                formater
                            );
                            errs.push(assErr);
                        }
                    }
                });
            }
        });
    } 
    else if (err) {
        errs.push(typeof err === 'string' ? err : err.message)
    }
};

function generateAssertionName(
    { check, equals, notEquals, contains, notContains, matches, falsy, greater, lesser, JSONSchema }: any,
    actual: any,
    formatAssertion: Function
) {
    if (equals != null) {
        return formatAssertion(check, 'Equals', equals, actual);
    } else if (notEquals != null) {
        return formatAssertion(check, 'Doesn\'t equal', notEquals, actual);
    } else if (contains != null) {
        return formatAssertion(check, 'Contains', contains, actual);
    } else if (notContains != null) {
        return formatAssertion(check, 'Doesn\'t contain', notContains, actual);
    } else if (matches != null) {
        return formatAssertion(check, 'Matches', matches, actual);
    } else if (greater != null) {
        return formatAssertion(check, 'Greater than', greater, actual);
    } else if (lesser != null) {
        return formatAssertion(check, 'Less than', lesser, actual);
    } else if (falsy != null) {
        return formatAssertion(check, 'Doesn\'t exist', null, actual);
    } else if (JSONSchema != null) {
        return formatAssertion(check, 'JSON Schema', JSONSchema, actual);
    } else {
        return formatAssertion(check, 'Exists', null, actual);
    }
}

/**
 * null - we dont want to show actual value - load test or successfull test.
 * NULL_VAL - we want to show there was a null value.
 * else - show the actual value.
 */
function getActualValue(errorRate, postParameters, check) {
    if (errorRate && !isEmpty(postParameters)) {
        // empty means load test
        const exists = find(postParameters, (p) => p[check]);
        return exists ? exists[check] : 'null';
    }
    return null;
}


function getItems(
    names: string[],
    histogram: any,
    totalNumRequests: number
) {
    const items = names.sort().map((name) => {
        const numFailures = histogram[name];
        const errorRate = calculateErrorRate(
            numFailures,
            totalNumRequests - numFailures
        );

        return { name, errorRate };
    });

    return isEmpty(items) ? [{ name: 'None' as any, errorRate: 0 }] : items;
}

function calculateErrorRate(
    failures?: number | string | null,
    successes?: number | string | null
) {
    failures = numberify(failures);
    successes = numberify(successes);

    if (failures === 0) {
        return 0;
    } else if (successes === 0) {
        return 1;
    } else {
        return failures / (failures + successes);
    }
}

function numberify(num?: number | string | null, defaultValue = 0) {
    if (num == null) {
        return defaultValue;
    } else {
        return Number(num);
    }
}

function genReqDesc(index: number, description?: string) {
    return `${description ? description : `Request #${index + 1}`} -`;
}

function getFlowRunAPI(f: Loadmill.FlowRun) {
    return `${testingServer}/api/test-suites-runs/flows/${f.id}`;
}

function getFlowRunWebURL(s: Loadmill.TestResult, f: Loadmill.FlowRun) {
    return `${testingServer}/app/api-tests/test-suite-runs/${s.id}/flows/${f.id}`;
}

const junitReportAPI = `${testingServer}/api/reports/junit`;

const toMochawesomeFailedFlow = (flowRun) => {

    const errs = toFailedFlowRunReport(flowRun, (check, operation, value, actual) => {
        let text = '';
        if (actual != null) {
            text += `\n+   Expected: ${check} ${operation} ${value != null ? value : ''} `;
            text += `\n-   Actual: ${actual !== 'null' ? actual : 'null'} `;
        }
        return text;
    });

    return {
        "showDiff": true,
        "actual": "",
        "negate": false,
        "_message": "",
        "generatedMessage": false,
        "diff": errs.join('\n')
    };
};

const flowToMochawesone = async (suite: Loadmill.TestResult, flow: Loadmill.FlowRun, token: string) => {

    const url = getFlowRunAPI(flow);
    const { body: flowData } = await superagent.get(url).auth(token, '');

    const hasPassed = flow.status === 'PASSED';
    const hasFailed = flow.status === 'FAILED';
    const res =
    {
        "title": flow.description,
        "fullTitle": flow.description,
        "timedOut": false,
        "duration": (flowData.endTime - flowData.startTime) || 0,
        "state": hasPassed ? 'passed' : 'failed',
        "pass": hasPassed,
        "fail": hasFailed,
        "isHook": false,
        "skipped": false,
        "pending": false,
        "code": getFlowRunWebURL(suite, flow),
        "err": hasFailed ? toMochawesomeFailedFlow(flowData) : {},
        "uuid": flow.id
    }
    return res;
};

const suiteToMochawesone = async (suite: Loadmill.TestResult, token: string) => {

    const flows = suite.flowRuns || [];
    const passedFlows = flows.filter(f => f.status === 'PASSED').map(f => f.id);
    const failedFlows = flows.filter(f => f.status === 'FAILED').map(f => f.id);

    const limit = pLimit(3);

    return {
        "title": suite.description,
        "tests": await Promise.all(
            flows.filter(flow => ['PASSED', 'FAILED'].includes(flow.status))
            .map(f => limit(() => flowToMochawesone(suite, f, token)))
        ),
        "duration": ((+suite.endTime || Date.now()) - +suite.startTime),
        "suites": [],
        "uuid": suite.id,
        "passes": passedFlows,
        "failures": failedFlows,
        "root": false,
        "_timeout": 0,
        "file": "",
        "fullFile": "",
        "beforeHooks": [],
        "afterHooks": [],
        "skipped": [],
        "pending": [],
    }
};

const generateMochawesomeReport = async (testResult: Loadmill.TestResult, token: string) => {
    const suites = testResult.testSuitesRuns || [testResult];
    const passedSuites = suites.filter(t => t.passed).length;
    const failedSuites = suites.filter(t => !t.passed).length;
    const duration = suites.reduce((acc, s) => acc + ((+s.endTime || Date.now()) - +s.startTime), 0);

    const suitesLength = suites.length;
    const limit = pLimit(3);

    const res = {
        "stats": {
            "suites": suitesLength,
            "tests": suitesLength,
            "passes": passedSuites,
            "failures": failedSuites,
            "start": (suites[0]? getFirstExecutedSuiteTime(suites) : new Date()).toISOString(),
            "end": new Date().toISOString(),
            "pending": 0,
            "testsRegistered": suitesLength,
            "pendingPercent": 0,
            "passPercent": suitesLength == 0 ? 0 : (passedSuites / suitesLength) * 100,
            "other": 0,
            "hasOther": false,
            "skipped": 0,
            "hasSkipped": false,
            "duration": duration
        },
        "results": [
            {
                "title": "Loadmill API tests",
                "suites": await Promise.all(suites.map(s => limit(() => suiteToMochawesone(s, token)))),
                "tests": [],
                "pending": [],
                "root": true,
                "_timeout": 0,
                "uuid": suites[0]? suites[0].id : '123e4567-e89b-12d3-a456-426652340000',
                "beforeHooks": [],
                "afterHooks": [],
                "fullFile": "",
                "file": "",
                "passes": [],
                "failures": [],
                "skipped": [],
                "duration": duration,
                "rootEmpty": true
            }
        ]
    }
    return res;
};

export const junitReport = async (testResult: Loadmill.TestResult, token: string, path?: string) => {
    if (!testResult) {
        return;
    }
    console.log('Generating JUnit report...');
    const reportId = await generateJunitReport(testResult.id, testResult.type, token);    
    reportId && await waitForAndSaveJunitReport(reportId, token, path);
    console.log('Finished generating JUnit report');
}

export const mochawesomeReport = async (testResult: Loadmill.TestResult, token: string, path?: string) => {
    if (!testResult) {
        return;
    }
    const jsonResults = await generateMochawesomeReport(testResult, token);
    const resolvedPath = resolvePath(path ? path : './mochawesome-results', 'json');
    ensureDirectoryExistence(resolvedPath);
    fs.writeFileSync(resolvedPath, JSON.stringify(jsonResults, null, 2));
}

function getFirstExecutedSuiteTime(suites: Loadmill.TestResult[]) {
    const firstSuite = suites.reduce(function(prev, curr) {
        return prev.startTime < curr.startTime ? prev : curr;
    });
    return new Date(firstSuite.startTime);
}
