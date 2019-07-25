import './polyfills'
import * as fs from 'fs';
import * as superagent from 'superagent';
import { getJSONFilesInFolderRecursively, isEmptyObj, isString, checkAndPrintErrors, Logger } from './utils';
import { runFunctionalOnLocalhost } from 'loadmill-runner';

export = Loadmill;

function Loadmill(options: Loadmill.LoadmillOptions) {
    const {
        token,
        _testingServerHost = process.env.LOADMILL_SERVER_HOST || "www.loadmill.com"
    } = options as any;

    const testingServer = "https://" + _testingServerHost;

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
                        passed: isTestPassed(body, testDef.type),
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
                const verbose = testArgs && testArgs.verbose ? testArgs.verbose : false;
                const colors = testArgs && testArgs.colors ? testArgs.colors : false;
                const logger = new Logger(verbose, colors);
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

    async function _runFunctional(
        config: Loadmill.Configuration,
        async: boolean,
        paramsOrCallback: Loadmill.ParamsOrCallback,
        callback: Loadmill.Callback) {

        return wrap(
            async () => {
                const description = (config.meta && config.meta.description) || 'no-test-description';

                config = toConfig(config, paramsOrCallback);

                config['async'] = async;

                const {
                    body: {
                        id,
                        trialResult,
                        incompleteMessage,
                    }
                } = await superagent.post(testingServer + "/api/tests/trials")
                    .send(config)
                    .auth(token, '');

                if (incompleteMessage) {
                    throw Error(incompleteMessage);
                }
                else {
                    return {
                        id,
                        type: Loadmill.TYPES.FUNCTIONAL,
                        url: `${testingServer}/app/functional/${id}`,
                        passed: async ? null : isFunctionalPassed(trialResult),
                        description: description
                    };
                }
            },
            callback || paramsOrCallback
        );
    }

    async function _runTestSuite(
        suite: Loadmill.TestSuiteDef,
        paramsOrCallback: Loadmill.ParamsOrCallback,
        callback: Loadmill.Callback) {

        const overrideParameters = typeof paramsOrCallback !== 'function' ? paramsOrCallback : {};
        return wrap(
            async () => {
                const {
                    body: {
                        testSuiteRunId
                    }
                } = await superagent.post(`${testingServer}/api/test-suites/${suite.id}/run`)
                    .send({ overrideParameters })
                    .auth(token, '');

                return { id: testSuiteRunId, type: Loadmill.TYPES.SUITE };

            },
            callback || paramsOrCallback
        );
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

        runFunctional(
            config: Loadmill.Configuration,
            paramsOrCallback?: Loadmill.ParamsOrCallback,
            callback?: Loadmill.Callback): Promise<Loadmill.TestResult> {

            return _runFunctional(config, false, paramsOrCallback, callback);
        },

        async runFunctionalFolder(
            folderPath: string,
            paramsOrCallback?: Loadmill.ParamsOrCallback,
            callback?: Loadmill.Callback): Promise<Array<Loadmill.TestResult>> {

            const listOfFiles = getJSONFilesInFolderRecursively(folderPath);
            if (listOfFiles.length === 0) {
                console.log(`No Loadmill test files were found at ${folderPath} - exiting...`);
            }

            return _runFolderSync(listOfFiles, _runFunctional, false, paramsOrCallback, callback);
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

        runAsyncFunctional(
            config: Loadmill.Configuration,
            paramsOrCallback?: Loadmill.ParamsOrCallback,
            callback?: Loadmill.Callback): Promise<Loadmill.TestResult> {

            return _runFunctional(config, true, paramsOrCallback, callback);
        },

        runTestSuite(
            suiteId: string,
            paramsOrCallback?: Loadmill.ParamsOrCallback,
            callback?: Loadmill.Callback): Promise<Loadmill.TestDef> {

            const suite = { id: suiteId };
            return _runTestSuite(suite, paramsOrCallback, callback);
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
    }

    export interface TestResult extends TestDef {
        url: string;
        passed: boolean;
        descrption: string
    }

    export type Configuration = object | string | any; // todo: bad typescript
    export type ParamsOrCallback = object | Callback;
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
