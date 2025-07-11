import './polyfills'
import * as fs from 'fs';
import { HttpMethods, sendHttpRequest } from './http-request';
import {
    filterLabels,
    filterTags,
    TESTING_ORIGIN,
    toLoadmillParams,
    readRawParams,
    FLOW_STATUS,
} from './utils';
import { junitReport as createJunitReport, mochawesomeReport as createMochawesomeReport } from './reporter';

const TEST_PLAN_POLL_INTERVAL_IN_MS = 10 * 1000 // 10 seconds

export = Loadmill;

function Loadmill(options: Loadmill.LoadmillOptions) {
    const {
        token,
        _testingServerHost
    } = options as any;


    const testingServer = _testingServerHost ? `https://${_testingServerHost}` : TESTING_ORIGIN;
    const testPlansAPI = `${testingServer}/api/test-plans`;

    async function _wait(testDefOrId: string | Loadmill.TestDef, callback?: Loadmill.Callback): Promise<Loadmill.TestResult> {
        let resolve, reject;

        const testDef = typeof testDefOrId === 'string' ? {
            id: testDefOrId,
            type: Loadmill.TYPES.LOAD,
        } : testDefOrId;

        const apiUrl = getTestAPIUrl(testDef, testingServer);
        const webUrl = getTestWebUrl(testDef, testingServer);

        let retries = 1;
        const intervalId = setInterval(async () => {
            try {
                let { body } = await sendHttpRequest({ url: apiUrl, token });

                if (isTestInFinalState(body, testDef.type)) {
                    clearInterval(intervalId);

                    if (testDef.type === Loadmill.TYPES.TEST_PLAN) {
                        const { body: bodyWithFlows } = await sendHttpRequest({
                            url: apiUrl,
                            query: {
                                fetchAllFlows: true,
                                groupFlowAttempts: true,
                            },
                            token,
                        });
                        body = bodyWithFlows;
                    }

                    const testResult: Loadmill.TestResult = toTestResult(testDef, webUrl, body);

                    redactData(testResult, body);

                    if (callback) {
                        callback(null, testResult);
                    }
                    else {
                        resolve(testResult);
                    }
                }
            }
            catch (err) {

                if (retries < 3) {
                    retries++;
                    return;
                } else {
                    clearInterval(intervalId);
                }

                if (callback) {
                    callback(err, null);
                }
                else {
                    reject(err);
                }
            }
        }, TEST_PLAN_POLL_INTERVAL_IN_MS);

        return callback ? null! as Promise<any> : new Promise((_resolve, _reject) => {
            resolve = _resolve;
            reject = _reject;
        });
    }

    async function _runTestPlan(
        testPlan: Loadmill.TestPlanDef,
        params: Loadmill.Params,
    ) {
        const testPlanId = testPlan.id;
        const overrideParameters = toParams(params, testPlan.options?.parametersFile);
        const labels = testPlan.options && testPlan.options.labels && filterLabels(testPlan.options.labels);
        const labelsExpression = testPlan.options && testPlan.options.labelsExpression;
        const additionalDescription = testPlan.options && testPlan.options.additionalDescription;
        const pool = testPlan.options && testPlan.options.pool;
        const tags = testPlan.options && testPlan.options.tags && filterTags(testPlan.options.tags);
        const parallel = testPlan.options && testPlan.options.parallel;
        const branch = testPlan.options && testPlan.options.branch;
        const inlineParameterOverride = !!(testPlan.options && testPlan.options.inlineParameterOverride);
        const maxFlakyFlowRetries = testPlan.options && testPlan.options.maxFlakyFlowRetries;
        const apiCatalogService = testPlan.options && testPlan.options.apiCatalogService;
        const turboParallel = !!(testPlan.options && testPlan.options.turboParallel);
        const {
            body: {
                testPlanRunId,
                err
            }
        } = await sendHttpRequest({
            method: HttpMethods.POST,
            url: `${testPlansAPI}/${testPlanId}/run`,
            body: { 
                overrideParameters,
                additionalDescription,
                labels,
                pool,
                parallel,
                tags,
                branch,
                maxFlakyFlowRetries,
                labelsExpression,
                inlineParameterOverride,
                apiCatalogService,
                turboParallel,
            },
            token,
        });
        if (err || !testPlanRunId) {
            console.error(err ? JSON.stringify(err) : "The server encountered an error while handling the request");
            return;
        }
        return { id: testPlanRunId, type: Loadmill.TYPES.TEST_PLAN };
    }

    async function _junitReport(testResult: Loadmill.TestResult, path?: string) {
        return createJunitReport(testResult, token, path);
    }

    async function _mochawesomeReport(testResult: Loadmill.TestResult, path?: string) {
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

                    const { body: { testId } } = await sendHttpRequest({
                        method: HttpMethods.POST,
                        url: testingServer + "/api/tests",
                        body: config,
                        token,
                    });

                    await sendHttpRequest({
                        method: HttpMethods.PUT,
                        url: `${testingServer}/api/tests/${testId}/load`,
                        token,
                    });

                    return testId;
                },
                callback || paramsOrCallback
            );
        },

        wait(testDefOrId: string | Loadmill.TestDef, callback?: Loadmill.Callback): Promise<Loadmill.TestResult> {
            return _wait(testDefOrId, callback);
        },

        async runTestPlan(
            testPlan: Loadmill.TestPlanDef,
            params: Loadmill.Params,
        ): Promise<Loadmill.TestDef | undefined> {

            return _runTestPlan(testPlan, params);
        },

        async junitReport(testResult: Loadmill.TestResult, path?: string): Promise<void> {
            return _junitReport(testResult, path);
        },

        async mochawesomeReport(testResult: Loadmill.TestResult, path?: string): Promise<void> {
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

function toTestResult(testDef: Loadmill.TestDef, webUrl: string, body: any): Loadmill.TestResult {
    return {
        ...testDef,
        url: webUrl,
        description: body && body.description,
        passed: isTestPassed(body, testDef.type),
        startTime: body.startTime,
        endTime: body.endTime,
        status: body.status,
    }
}

function redactData(testResult: Loadmill.TestResult, body: any) {
    testResult.testSuitesRuns = reductTestSuitesRuns(body.testSuitesRuns);
}

function isTestInFinalState(body, runType) {
    if (runType === Loadmill.TYPES.TEST_PLAN) {
        if (body.testSuitesRuns.some(suite => suite.status === "RUNNING")) {
            return false;
        }
    }
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

function reductTestSuitesRuns(suitesRuns) {
    if (suitesRuns) {
        return suitesRuns.map(s => {
            const suiteRun: Loadmill.TestResult =
            {
                id: s.id,
                type: Loadmill.TYPES.SUITE,
                description: s.description,
                status: s.status,
                url: s.url,
                passed: s.status === "PASSED",
                startTime: s.startTime,
                endTime: s.endTime,
            }
            s.error && (suiteRun.error = s.error.message);

            if (Array.isArray(s.testSuiteFlowRuns)) {
                suiteRun.flowRuns = s.testSuiteFlowRuns.map(fr => {
                    const flowRun: Loadmill.FlowRun = {
                        id: fr.id,
                        status: fr.status,
                        description: fr.description,
                        flowStatus: fr.testSuiteFlowStatus,
                        duration: (fr.endTime - fr.startTime) || 0,
                    };

                    if (fr.runs?.length) {
                        flowRun.retries = fr.runs.length - 1;
                        flowRun.duration = fr.runs[fr.runs.length - 1].endTime - fr.runs[0].startTime;
                    }

                    return flowRun;
                });
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

function toParams(params: Loadmill.Params = {}, filePath?: string) {
    if (filePath) {
        const fileParams = toLoadmillParams(readRawParams(filePath));
        return { ...fileParams, ...params };
    }
    return params;
}

namespace Loadmill {
    export interface LoadmillOptions {
        token: string;
    }
    export interface TestDef {
        id: string;
        type: TYPES;
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
        parametersFile?: string;
    }
    export interface TestPlanOptions {
        additionalDescription?: string;
        labels?: string[] | null;
        labelsExpression?: string;
        fetchFlowRuns?: boolean;
        pool?: string;
        tags?: string[] | null;
        parallel?: number | string;
        branch?: string;
        maxFlakyFlowRetries?: number | string;
        parametersFile?: string;
        inlineParameterOverride?: boolean;
        apiCatalogService?: string;
        turboParallel?: boolean;
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
        error?: SuiteError; 
    }

    export interface FlowRun {
        id: string;
        status: string;
        description: string;
        flowStatus: FLOW_STATUS;
        duration: number;
        retries?: number;
    }

    type SuiteError = { message: string };
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
