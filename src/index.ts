import * as fs from 'fs';
import * as superagent from 'superagent';

export = Loadmill;

namespace Loadmill {
    export interface LoadmillOptions {
        token: string;
    }

    export interface TestDef {
        id: string;
        type: string;
    }

    export interface TestResult extends TestDef {
        url: string;
        passed: boolean;
    }

    export type Configuration = object | string;
    export type ParamsOrCallback = object | Callback;
    export type Callback = {(err: Error | null, result: any): void} | undefined;
}

const TYPE_LOAD = 'load';
const TYPE_FUNCTIONAL = 'functional';

function Loadmill(options: Loadmill.LoadmillOptions) {
    const {
        token,
        _testingServerHost = "www.loadmill.com"
    } = options as any;

    const testingServer = "https://" + _testingServerHost;

    async function _runFunctional(
        async: boolean,
        config: Loadmill.Configuration,
        paramsOrCallback: Loadmill.ParamsOrCallback,
        callback: Loadmill.Callback) {

        return wrap(
            async () => {
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
                        type: TYPE_FUNCTIONAL,
                        url: `${testingServer}/app/functional/${id}`,
                        passed: async ? null : isFunctionalPassed(trialResult),
                    };
                }
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

                    const {body: {testId}} = await superagent.post(testingServer + "/api/tests")
                        .send(config)
                        .auth(token, '');

                    await superagent.put(`${testingServer}/api/tests/${testId}/load`)
                        .auth(token, '');

                    return testId;
                },
                callback || paramsOrCallback
            );
        },

        wait(testDefOrId: string | Loadmill.TestDef, callback?: Loadmill.Callback): Promise<Loadmill.TestResult> {
            let resolve, reject;

            const testDef = typeof testDefOrId === 'string' ? {
                id: testDefOrId,
                type: TYPE_LOAD,
            } : testDefOrId;

            const apiUrl = getTestUrl(testDef,
                testingServer + '/api/tests/', 'trials/', '');

            const webUrl = getTestUrl(testDef,
                testingServer + '/app/', 'functional/', 'test/');

            const intervalId = setInterval(async () => {
                    try {
                        const {body: {trialResult, result}} = await superagent.get(apiUrl)
                            .auth(token, '');

                        if (result || trialResult) {
                            clearInterval(intervalId);

                            const testResult = {
                                ...testDef,
                                url: webUrl,
                                passed: testDef.type === TYPE_LOAD ?
                                    result === 'done' : isFunctionalPassed(trialResult),
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
                        if (testDef.type === TYPE_FUNCTIONAL && err.status === 404) {
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
        },

        runFunctional(
            config: Loadmill.Configuration,
            paramsOrCallback?: Loadmill.ParamsOrCallback,
            callback?: Loadmill.Callback): Promise<Loadmill.TestResult> {

            return _runFunctional(false, config, paramsOrCallback, callback);
        },

        runAsyncFunctional(
            config: Loadmill.Configuration,
            paramsOrCallback?: Loadmill.ParamsOrCallback,
            callback?: Loadmill.Callback): Promise<Loadmill.TestResult> {

            return _runFunctional(true, config, paramsOrCallback, callback);
        },
    };
}

function isFunctionalPassed(trialResult) {
    return !!trialResult && Object.keys(trialResult.failures || {}).length === 0;
}

function getTestUrl({id, type}: Loadmill.TestDef, prefix: string, funcSuffix: string, loadSuffix: string) {
    const suffix = type === TYPE_FUNCTIONAL ? funcSuffix : loadSuffix;
    return `${prefix}${suffix}${id}`
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
