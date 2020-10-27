import './polyfills'
import * as fs from 'fs';
import * as superagent from 'superagent';
import { getJSONFilesInFolderRecursively, isEmptyObj, isString, checkAndPrintErrors,
    getLogger, getObjectAsString, convertArrToLabelQueryParams, junitReport as createJunitReport } from './utils';
import { runFunctionalOnLocalhost } from 'loadmill-runner';

export = Loadmill;

function Loadmill(options: Loadmill.LoadmillOptions) {
    const {
        token,
        _testingServerHost = process.env.LOADMILL_SERVER_HOST || "www.loadmill.com"
    } = options as any;

    const testingServer = "https://" + _testingServerHost;
    const testSuitesAPI = `${testingServer}/api/test-suites`;

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

                    const testResult = {
                        ...testDef,
                        url: webUrl,
                        description: body && body.description,
                        passed: isTestPassed(body, testDef.type),
                        flowRuns: reductFlowRunsData(body.testSuiteFlowRuns)
                    };

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
        const labels = suite.options && suite.options.labels;

        return wrap(
            async () => {
                const {
                    body: {
                        testSuiteRunId,
                        err
                    }
                } = await superagent.post(`${testSuitesAPI}/${suiteId}/run`)
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

    async function _getExecutableTestSuites(labels?: Array<string> | null): Promise<Array<Loadmill.TestSuiteDef>> {
        let url = `${testSuitesAPI}?rowsPerPage=100&filter=CI%20enabled`;
        if (labels) {
            const labelsAsQueryParams = convertArrToLabelQueryParams(labels);
            url = url.concat(labelsAsQueryParams);
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
            logger.verbose(`Found ${suites.length} test suites marked for execution. Executing one by one.`);
        }

        const results: Array<Loadmill.TestResult> = [];
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
        return results;
    }

    function _junitReport(suite: Loadmill.TestResult | Array<Loadmill.TestResult>, path?: string){
        return createJunitReport(suite, path);
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

        async getExecutableTestSuites(labels?: Array<string> | null): Promise<Array<Loadmill.TestSuiteDef>> {
            return _getExecutableTestSuites(labels);
        },

        async runAllExecutableTestSuites(
            options?: Loadmill.TestSuiteOptions,
            params?: Loadmill.Params,
            testArgs?: Loadmill.Args) {
            return _runAllExecutableTestSuites(options, params, testArgs);
        },
                
        junitReport(suite: Loadmill.TestResult| Array<Loadmill.TestResult>, path?: string): void {
            return _junitReport(suite, path);
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
            return body.status === "PASSED";
        default: //load
            return body.result === 'done';
    }
}
function isTestInFinalState(body) {
    const { trialResult, result, status } = body;
    return (
        (result || trialResult === false) || // load or functional tests
        (status && status !== "RUNNING") // test suites
    );
}

function getTestAPIUrl({ id, type }: Loadmill.TestDef, server: string) {
    const prefix = `${server}/api`;
    switch (type) {
        case Loadmill.TYPES.FUNCTIONAL:
            return `${prefix}/tests/trials/${id}`
        case Loadmill.TYPES.SUITE:
            return `${prefix}/test-suites-runs/${id}`
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
        default: //load
            return `${prefix}/test/${id}`
    }
}

function reductFlowRunsData(flowRuns) {
    if (flowRuns) {
        return flowRuns.map(f => ({ description: f.description, status: f.status }));
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

    export interface TestSuiteOptions {
        additionalDescription?: string;
        labels?: string[] | null;
    }

    export interface TestResult extends TestDef {
        url: string;
        passed: boolean;
        description: string
        flowRuns?: Array<FlowRun>
    }

    export interface FlowRun {
        status: string;
        description: string
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
        LOCAL = 'local'
    };
}
