import './polyfills'
import * as fs from 'fs';
import * as superagent from 'superagent';
import { getJSONFilesInFolderRecursively, filterLabels, TESTING_HOST } from './utils';
import { junitReport as createJunitReport, mochawesomeReport as createMochawesomeReport } from './reporter';

export = Loadmill;

function Loadmill(options: Loadmill.LoadmillOptions) {
    const {
        token,
        _testingServerHost = TESTING_HOST
    } = options as any;


    const testingServer = "https://" + _testingServerHost;
    const testSuitesAPI = `${testingServer}/api/test-suites`;
    const testPlansAPI = `${testingServer}/api/test-plans`;

    async function _runFolderSync(
        listOfFiles: string[],
        execFunc: (...args) => Promise<any>,
        ...funcArgs) {

        const results: Loadmill.TestResult[] = [];

        for (let file of listOfFiles) {
            let res = await execFunc(file, ...funcArgs);
            const testResult = await _wait(res);
            results.push(testResult);
            if (!testResult.passed) break;
        }

        return results;
    }

    async function _wait(testDefOrId: string | Loadmill.TestDef, callback?: Loadmill.Callback): Promise<Loadmill.TestResult> {
        let resolve, reject;

        const testDef = typeof testDefOrId === 'string' ? {
            id: testDefOrId,
            type: Loadmill.TYPES.LOAD,
        } : testDefOrId;

        const apiUrl = getTestAPIUrl(testDef, testingServer);
        const webUrl = getTestWebUrl(testDef, testingServer);

        const intervalId = setInterval(async () => {
            try {
                let { body } = await superagent.get(apiUrl)
                    .auth(token, '');

                if (isTestInFinalState(body)) {
                    clearInterval(intervalId);

                    if (testDef.type === Loadmill.TYPES.TEST_PLAN) {
                        const { body: bodyWithFlows } = await superagent.get(`${apiUrl}?fetchAllFlows=true`).auth(token, '');
                        body = bodyWithFlows;
                    }

                    const testResult: Loadmill.TestResult = {
                        ...testDef,
                        url: webUrl,
                        description: body && body.description,
                        passed: isTestPassed(body, testDef.type),
                        startTime: body.startTime,
                        endTime: body.endTime
                    };

                    if (testDef.type === Loadmill.TYPES.SUITE) {
                        testResult.flowRuns = reductFlowRunsData(body.testSuiteFlowRuns);
                    }
                    else if (testDef.type === Loadmill.TYPES.TEST_PLAN) {
                        testResult.testSuitesRuns = reductTestSuitesRuns(body.testSuitesRuns, testingServer)
                    }

                    if (callback) {
                        callback(null, testResult);
                    }
                    else {
                        resolve(testResult);
                    }
                }
            }
            catch (err) {
                clearInterval(intervalId);

                if (callback) {
                    callback(err, null);
                }
                else {
                    reject(err);
                }
            }
        },
            10 * 1000);

        return callback ? null! as Promise<any> : new Promise((_resolve, _reject) => {
            resolve = _resolve;
            reject = _reject;
        });
    }

    async function _runTestSuite(
        suite: Loadmill.TestSuiteDef,
        paramsOrCallback: Loadmill.ParamsOrCallback,
        callback?: Loadmill.Callback) {

        const overrideParameters = paramsOrCallback && typeof paramsOrCallback !== 'function' ? paramsOrCallback : {};

        const suiteId = suite.id;
        const additionalDescription = suite.options && suite.options.additionalDescription;
        const labels = suite.options && suite.options.labels && filterLabels(suite.options.labels);
        const failGracefully = suite.options && suite.options.failGracefully;
        const pool = suite.options && suite.options.pool;

        return wrap(
            async () => {
                const {
                    body: {
                        testSuiteRunId,
                        err
                    }
                } = await superagent.post(`${testSuitesAPI}/${suiteId}/run${failGracefully ? '?failGracefully=true' : ''}`)
                    .send({ overrideParameters, additionalDescription, labels, pool })
                    .auth(token, '');

                if (err || !testSuiteRunId) {
                    console.error(err ? JSON.stringify(err) : "The server encountered an error while handling the request");
                    return;
                }
                return { id: testSuiteRunId, type: Loadmill.TYPES.SUITE };

            },
            callback || paramsOrCallback
        );
    }

    async function _runTestPlan(
        testPlan: Loadmill.TestPlanDef,
        params: Loadmill.Params,
    ) {
        const testPlanId = testPlan.id;
        const overrideParameters = params || {};
        const labels = testPlan.options && testPlan.options.labels && filterLabels(testPlan.options.labels);
        const additionalDescription = testPlan.options && testPlan.options.additionalDescription;
        const pool = testPlan.options && testPlan.options.pool;
        const parallel = testPlan.options && testPlan.options.parallel;

        const {
            body: {
                testPlanRunId,
                err
            }
        } = await superagent.post(`${testPlansAPI}/${testPlanId}/run`)
            .send({ overrideParameters, additionalDescription, labels, pool, parallel })
            .auth(token, '');

        if (err || !testPlanRunId) {
            console.error(err ? JSON.stringify(err) : "The server encountered an error while handling the request");
            return;
        }
        return { id: testPlanRunId, type: Loadmill.TYPES.TEST_PLAN };
    }

    async function _junitReport(testResult: Loadmill.TestResult | Array<Loadmill.TestResult>, path?: string) {
        return createJunitReport(testResult, token, path);
    }

    async function _mochawesomeReport(testResult: Loadmill.TestResult | Array<Loadmill.TestResult>, path?: string) {
        return createMochawesomeReport(testResult, token, path);
    }

    return {
        run(
            config: Loadmill.Configuration,
            paramsOrCallback?: Loadmill.ParamsOrCallback,
            callback?: Loadmill.Callback): Promise<string> {

            return wrap(
                async () => {
                    config = toConfig(config, paramsOrCallback);

                    const { body: { testId } } = await superagent.post(testingServer + "/api/tests")
                        .send(config)
                        .auth(token, '');

                    await superagent.put(`${testingServer}/api/tests/${testId}/load`)
                        .auth(token, '');

                    return testId;
                },
                callback || paramsOrCallback
            );
        },

        async runFolder(
            folderPath: string,
            paramsOrCallback?: Loadmill.ParamsOrCallback,
            callback?: Loadmill.Callback): Promise<Array<Loadmill.TestResult>> {

            const listOfFiles = getJSONFilesInFolderRecursively(folderPath);
            if (listOfFiles.length === 0) {
                console.log(`No Loadmill test files were found at ${folderPath} - exiting...`);
            }
            return _runFolderSync(listOfFiles, this.run, paramsOrCallback, callback);

        },

        wait(testDefOrId: string | Loadmill.TestDef, callback?: Loadmill.Callback): Promise<Loadmill.TestResult> {
            return _wait(testDefOrId, callback);
        },

        async runTestSuite(
            suite: Loadmill.TestSuiteDef,
            paramsOrCallback?: Loadmill.ParamsOrCallback,
            callback?: Loadmill.Callback): Promise<Loadmill.TestDef> {

            return _runTestSuite(suite, paramsOrCallback, callback);
        },

        async runTestPlan(
            testPlan: Loadmill.TestPlanDef,
            params: Loadmill.Params,
        ): Promise<Loadmill.TestDef | undefined> {

            return _runTestPlan(testPlan, params);
        },

        async junitReport(testResult: Loadmill.TestResult | Array<Loadmill.TestResult>, path?: string): Promise<void> {
            return _junitReport(testResult, path);
        },

        async mochawesomeReport(testResult: Loadmill.TestResult | Array<Loadmill.TestResult>, path?: string): Promise<void> {
            return _mochawesomeReport(testResult, path);
        },

    };
}

const isTestPassed = (body, type) => {
    switch (type) {
        case Loadmill.TYPES.SUITE:
        case Loadmill.TYPES.TEST_PLAN:
            return body.status === "PASSED";
        default: //load
            return body.result === 'done';
    }
}
function isTestInFinalState(body) {
    const { trialResult, result, status } = body;
    return (
        (result || trialResult === false) || // load tests
        (status && status !== "RUNNING") // test suites or test plan
    );
}

function getTestAPIUrl({ id, type }: Loadmill.TestDef, server: string) {
    const prefix = `${server}/api`;
    switch (type) {
        case Loadmill.TYPES.SUITE:
            return `${prefix}/test-suites-runs/${id}`
        case Loadmill.TYPES.TEST_PLAN:
            return `${prefix}/test-plans-runs/${id}`
        default: //load
            return `${prefix}/tests/${id}`;
    }
}

function getTestWebUrl({ id, type }: Loadmill.TestDef, server: string) {
    const prefix = `${server}/app`;
    switch (type) {
        case Loadmill.TYPES.SUITE:
            return `${prefix}/api-tests/test-suite-runs/${id}`
        case Loadmill.TYPES.TEST_PLAN:
            return `${prefix}/api-tests/test-plan-runs/${id}`
        default: //load
            return `${prefix}/test/${id}`
    }
}

function reductFlowRunsData(flowRuns) {
    if (flowRuns) {
        return flowRuns.map(f => ({
            id: f.id,
            description: f.description,
            status: f.status
        }));
    }
}

function reductTestSuitesRuns(suitesRuns, testingServer) {
    if (suitesRuns) {
        return suitesRuns.map(s => {
            const suiteRun: Loadmill.TestResult =
            {
                id: s.id,
                type: Loadmill.TYPES.SUITE,
                description: s.description,
                status: s.status,
                url: getTestWebUrl({ id: s.id, type: Loadmill.TYPES.SUITE }, testingServer),
                passed: s.status === "PASSED",
                startTime: s.startTime,
                endTime: s.endTime
            }

            if (Array.isArray(s.testSuiteFlowRuns)) {
                suiteRun.flowRuns = s.testSuiteFlowRuns.map(fr => ({
                    id: fr.id,
                    status: fr.status,
                    description: fr.description
                }));
            }

            return suiteRun;
        });
    }
}

function wrap(asyncFunction, paramsOrCallback?: Loadmill.ParamsOrCallback) {
    const promise = asyncFunction();

    if (typeof paramsOrCallback === 'function') {
        promise.then(res => paramsOrCallback(null, res))
            .catch(err => paramsOrCallback(err, null));
    }
    else {
        return promise;
    }
}

function toConfig(config: any | string, paramsOrCallback?: Loadmill.ParamsOrCallback) {
    if (typeof config === 'string') {
        let text = fs.readFileSync(config).toString();
        config = JSON.parse(text);
    }

    if (typeof paramsOrCallback === 'object' && paramsOrCallback != null) {
        let parameters = config.parameters;

        if (!parameters) {
            config.parameters = paramsOrCallback;
        }
        else if (typeof parameters.push === 'function') {
            parameters.push(paramsOrCallback);
        }
        else {
            config.parameters = [parameters, paramsOrCallback];
        }
    }

    return config;
}

namespace Loadmill {
    export interface LoadmillOptions {
        token: string;
    }
    export interface TestDef {
        id: string;
        type: string;
    }
    export interface TestSuiteDef {
        id: string;
        description?: string;
        options?: TestSuiteOptions;
    }
    export interface TestPlanDef {
        id: string;
        description?: string;
        options?: TestPlanOptions;
    }
    export interface TestSuiteOptions {
        additionalDescription?: string;
        labels?: string[] | null;
        failGracefully?: boolean;
        pool?: string;
    }
    export interface TestPlanOptions {
        additionalDescription?: string;
        labels?: string[] | null;
        fetchFlowRuns?: boolean;
        pool?: string;
        parallel?: number | string;
    }
    export interface TestResult extends TestDef {
        url: string;
        passed: boolean;
        description: string
        flowRuns?: Array<FlowRun>;
        testSuitesRuns?: Array<TestResult>;
        status?: string;
        startTime: string;
        endTime: string;
    }

    export interface FlowRun {
        id: string;
        status: string;
        description: string;
    }

    export type Configuration = object | string | any; // todo: bad typescript
    export type Params = { [key: string]: string };
    export type ParamsOrCallback = Params | Callback;
    export type Callback = { (err: Error | null, result: any): void } | undefined;
    export type Histogram = { [reason: string]: number };
    export type TestFailures = { [reason: string]: { [histogram: string]: Histogram } };
    export type Args = { verbose: boolean, colors?: boolean };

    export enum TYPES {
        LOAD = 'load',
        SUITE = 'test-suite',
        TEST_PLAN = 'test-plan'
    };
}
