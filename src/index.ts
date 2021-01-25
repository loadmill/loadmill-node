import './polyfills'
import * as fs from 'fs';
import * as superagent from 'superagent';
import {
    getJSONFilesInFolderRecursively, isEmptyObj, isString, checkAndPrintErrors, filterLabels,
    getLogger, getObjectAsString, convertArrToLabelQueryParams, TESTING_HOST
} from './utils';
import { junitReport as createJunitReport, mochawesomeReport as createMochawesomeReport } from './reporter';
import { runFunctionalOnLocalhost } from 'loadmill-runner';
const pLimit = require('p-limit');

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
            let testResult;
            if (!isString(res) && !res.id) { // obj but without id -> local test
                testResult = { url: Loadmill.TYPES.LOCAL, passed: res.passed } as Loadmill.TestResult;
            } else { // obj with id -> functional test. id as string -> load test
                testResult = await _wait(res);
            }
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
                const { body } = await superagent.get(apiUrl)
                    .auth(token, '');

                if (isTestInFinalState(body)) {
                    clearInterval(intervalId);

                    const testResult: Loadmill.TestResult  = {
                        ...testDef,
                        url: webUrl,
                        description: body && body.description,
                        passed: isTestPassed(body, testDef.type),
                        startTime: body.startTime,
                        endTime: body.endTime
                    };

                    if(testDef.type === Loadmill.TYPES.SUITE){
                        testResult.flowRuns = reductFlowRunsData(body.testSuiteFlowRuns);
                    } 
                    else if(testDef.type === Loadmill.TYPES.TEST_PLAN){
                        testResult.testSuitesRuns = reductTestSuitesRuns(body.testSuitesRuns)
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
                if (testDef.type === Loadmill.TYPES.FUNCTIONAL && err.status === 404) {
                    // 404 for functional could be fine when async - keep going:
                    return;
                }

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

    async function _runFunctionalLocally(
        config: Loadmill.Configuration,
        paramsOrCallback: Loadmill.ParamsOrCallback,
        callback?: Loadmill.Callback,
        testArgs?: Loadmill.Args) {
        return wrap(
            async () => {
                const logger = getLogger(testArgs);
                logger.warn(`Deprecation warning: Functional tests are deprecated. Please use test-suites instead.`);
                const description = (config.meta && config.meta.description) || 'no-test-description';

                config = toConfig(config, paramsOrCallback);

                config['async'] = false;

                const trialRes = await runFunctionalOnLocalhost(config);

                if (!isEmptyObj(trialRes.failures)) {
                    checkAndPrintErrors(trialRes, testArgs, logger, description);
                }

                return {
                    type: Loadmill.TYPES.FUNCTIONAL,
                    passed: isFunctionalPassed(trialRes),
                    description: description
                };
            },
            callback || paramsOrCallback
        );
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

        return wrap(
            async () => {
                const {
                    body: {
                        testSuiteRunId,
                        err
                    }
                } = await superagent.post(`${testSuitesAPI}/${suiteId}/run${failGracefully ? '?failGracefully=true' : ''}`)
                    .send({ overrideParameters, additionalDescription, labels })
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
        const overrideParameters = params || {};
        const testPlanId = testPlan.id;
        const additionalDescription = testPlan.options && testPlan.options.additionalDescription;

        const {
            body: {
                testPlanRunId,
                err
            }
        } = await superagent.post(`${testPlansAPI}/${testPlanId}/run`)
            .send({ overrideParameters, additionalDescription })
            .auth(token, '');

        if (err || !testPlanRunId) {
            console.error(err ? JSON.stringify(err) : "The server encountered an error while handling the request");
            return;
        }
        return { id: testPlanRunId, type: Loadmill.TYPES.TEST_PLAN };
    }

    async function _getExecutableTestSuites(labels?: Array<string> | null): Promise<Array<Loadmill.TestSuiteDef>> {
        let url = `${testSuitesAPI}?rowsPerPage=100&filter=CI%20enabled`;
        if (labels) {
            const filteredLabels = filterLabels(labels);
            if (filteredLabels) {
                const labelsAsQueryParams = convertArrToLabelQueryParams(filteredLabels);
                url = url.concat(labelsAsQueryParams);
            }
        }

        let { body: { testSuites } } = await superagent.get(url)
            .auth(token, '');

        if (testSuites.length >= 100) {
            // this is for protection
            throw new Error(`Not allowed to execute more than 100 suites at once. Found ${testSuites.length} suites.`);
        }

        return testSuites.map(ts => ({
            id: ts.id,
            description: ts.description
        } as Loadmill.TestSuiteDef));
    }

    async function _runAllExecutableTestSuites(
        options?: Loadmill.TestSuiteOptions,
        params?: Loadmill.Params,
        testArgs?: Loadmill.Args): Promise<Array<Loadmill.TestResult>> {

        const suites: Array<Loadmill.TestSuiteDef> = await _getExecutableTestSuites(options && options.labels);
        const logger = getLogger(testArgs);

        if (!suites || suites.length === 0) {
            logger.log(`No test suites marked for execution were found. Are you sure flows are marked with CI toggle? - exiting...`);
        } else {
            logger.verbose(`Found ${suites.length} test suites marked for execution.`);
        }

        const results: Array<Loadmill.TestResult> = [];

        if (options && options.parallel) {
            logger.verbose(`Executing all suites in parallel`);
            const limit = pLimit(10); // max concurrency we allow
            const suitesPromises = suites.map(suite => limit(() => {
                logger.verbose(`Executing suite ${suite.description} with id ${suite.id}`);
                return _runTestSuite({ ...suite, options }, params)
                    .then(_wait)
                    .then((res) => { results.push(res); });
            }));
            await Promise.all<void>(suitesPromises);
        } else {

            for (let suite of suites) {
                logger.verbose(`Executing suite ${suite.description} with id ${suite.id}`);
                suite.options = options;
                await _runTestSuite(suite, params)
                    .then(_wait)
                    .then(res => {
                        logger.verbose(`Suite result - ${getObjectAsString(res, testArgs && testArgs.colors)}`);
                        results.push(res);
                    });
            }
        }

        return results;
    }

    async function _junitReport(suite: Loadmill.TestResult | Array<Loadmill.TestResult>, path?: string) {
        return createJunitReport(suite, token, path);
    }

    async function _mochawesomeReport(suite: Loadmill.TestResult | Array<Loadmill.TestResult>, path?: string) {
        return createMochawesomeReport(suite, token, path);
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

        runFunctional(): void {
            console.error('Deprecation error: Functional tests are deprecated. Please use test-suites instead.');
        },

        runFunctionalFolder(): void {
            console.error('Deprecation error: Functional tests are deprecated. Please use test-suites instead.');
        },

        async runFunctionalLocally(config: Loadmill.Configuration,
            paramsOrCallback?: Loadmill.ParamsOrCallback,
            callback?: Loadmill.Callback,
            testArgs?: Loadmill.Args): Promise<Loadmill.TestResult> {
            return _runFunctionalLocally(config, paramsOrCallback, callback, testArgs);
        },

        async runFunctionalFolderLocally(
            folderPath: string,
            paramsOrCallback?: Loadmill.ParamsOrCallback,
            callback?: Loadmill.Callback): Promise<Array<Loadmill.TestResult>> {

            const listOfFiles = getJSONFilesInFolderRecursively(folderPath);
            if (listOfFiles.length === 0) {
                console.log(`No Loadmill test files were found at ${folderPath} - exiting...`);
            }

            return _runFolderSync(listOfFiles, _runFunctionalLocally, paramsOrCallback, callback);
        },

        runAsyncFunctional(): void {
            console.error('Deprecation error: Functional tests are deprecated. Please use test-suites instead.');
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

        async getExecutableTestSuites(labels?: Array<string> | null): Promise<Array<Loadmill.TestSuiteDef>> {
            return _getExecutableTestSuites(labels);
        },

        async runAllExecutableTestSuites(
            options?: Loadmill.TestSuiteOptions,
            params?: Loadmill.Params,
            testArgs?: Loadmill.Args) {
            return _runAllExecutableTestSuites(options, params, testArgs);
        },

        async junitReport(suite: Loadmill.TestResult | Array<Loadmill.TestResult>, path?: string): Promise<void> {
            return _junitReport(suite, path);
        },

        async mochawesomeReport(suite: Loadmill.TestResult | Array<Loadmill.TestResult>, path?: string): Promise<void> {
            return _mochawesomeReport(suite, path);
        },

    };
}

function isFunctionalPassed(trialResult) {
    return !!trialResult && Object.keys(trialResult.failures || {}).length === 0;
}

const isTestPassed = (body, type) => {
    switch (type) {
        case Loadmill.TYPES.FUNCTIONAL:
            return isFunctionalPassed(body.trialResult);
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
        (result || trialResult === false) || // load or functional tests
        (status && status !== "RUNNING") // test suites or test plan
    );
}


function getTestAPIUrl({ id, type }: Loadmill.TestDef, server: string) {
    const prefix = `${server}/api`;
    switch (type) {
        case Loadmill.TYPES.FUNCTIONAL:
            return `${prefix}/tests/trials/${id}`
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
        case Loadmill.TYPES.FUNCTIONAL:
            return `${prefix}/functional/${id}`
        case Loadmill.TYPES.SUITE:
            return `${prefix}/api-tests/test-suite-runs/${id}`
        case Loadmill.TYPES.TEST_PLAN:
            return `${prefix}/api-tests/test-plans-runs/${id}`
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

function reductTestSuitesRuns(suitesRuns) {
    if (suitesRuns) {
        return suitesRuns.map(s => ({
            id: s.id,
            description: s.description,
            status: s.status
        }));
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
        parallel?: boolean;
    }

    export interface TestPlanOptions {
        additionalDescription?: string;
    }

    export interface TestResult extends TestDef {
        url: string;
        passed: boolean;
        description: string
        flowRuns?: Array<FlowRun>;
        testSuitesRuns?: Array<SuiteRun>;
        startTime: string;
        endTime: string;
    }

    export interface FlowRun {
        id: string;
        status: string;
        description: string;
    }

    export interface SuiteRun {
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
        FUNCTIONAL = 'functional',
        SUITE = 'test-suite',
        LOCAL = 'local',
        TEST_PLAN = 'test-plan'
    };
}
